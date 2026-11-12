// ───────────────────────────────────────────────
// 혼자 두는 게임 화면 (봇 대전, 친구와 플레이)
// 판 상태를 이 화면이 들고, 드래프트와 봇의 수를 처리한다.
// 판·패널·증강 사용 같은 대국 화면은 PlayArea가 그린다. (온라인 대전과 같이 쓴다)
// ───────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createInitialState, opponent } from '../game/board';
import { applyMove } from '../game/apply';
import type { AugmentId, Move, Team } from '../game/types';
import { BOT_LEVELS } from '../bot';
import type { BotRequest, BotResponse } from '../bot/bot.worker';
import type { AugmentPhase, DraftPick } from '../augments/registry';
import { PHASE_NAME, PHASE_ORDER } from '../augments/registry';
import { DRAFT_THRESHOLDS, botPickAugment, drawOffers, finishDraft, pendingDraftPhase } from '../augments/draft';
import { PlayArea } from './PlayArea';
import { DraftModal } from './DraftModal';
import type { GameSettings } from './StartScreen';

/** 진행 중인 드래프트 */
interface DraftState {
    phase: AugmentPhase;
    offers: Record<Team, AugmentId[]>;       // 각자에게 나온 카드
    picks: Record<Team, DraftPick | null>;   // 각자 고른 카드 (+ 선택지)
    done: Record<Team, boolean>;             // 각자 골랐는지 (카드가 없으면 처음부터 true)
}

// 진영 이름 표시용
const TEAM_NAME = { cho: '초', han: '한' } as const;

// 봇이 "생각하는 척" 기다리는 시간 (밀리초). 너무 빨리 두면 어색하다.
const BOT_DELAY_MS = 600;

interface GameProps {
    settings: GameSettings;
    onExit: () => void; // 처음 화면으로 돌아가기
}

export function Game({ settings, onExit }: GameProps) {
    // ── 상태 ──
    const [state, setState] = useState(createInitialState);
    const [draft, setDraft] = useState<DraftState | null>(null);
    // 바로 직전에 둔 수 (판에 흔적으로 표시)
    const [lastMove, setLastMove] = useState<Move | null>(null);
    // "다시 하기"를 누를 때마다 바뀌는 번호. 대국 화면을 새로 만들어서 장군 기록 등을 초기화한다.
    const [gameKey, setGameKey] = useState(0);

    // ── 계산 ──
    const levelInfo = BOT_LEVELS.find((l) => l.level === settings.level)!;
    const isBotGame = settings.mode === 'bot';
    const botTeam: Team = opponent(settings.playerTeam);

    // 지금 열려야 하는 드래프트 (없으면 null)
    const draftDue = useMemo(() => pendingDraftPhase(state), [state]);
    const isDrafting = draftDue !== null || draft !== null;
    const isOver = state.winner !== null || state.isDraw;

    // 지금이 봇 차례인지: 봇 대전이고, 내 진영 차례가 아니고, 게임이 안 끝났고, 드래프트 중이 아닐 때
    const isBotTurn = isBotGame && state.turn !== settings.playerTeam && !isOver && !isDrafting;

    // ── 봇 작업자(Web Worker) 준비 ──
    // 게임 화면이 열릴 때 한 번 만들고, 닫힐 때 없앤다.
    // useRef: 화면을 다시 그려도 값이 유지되는 상자. (useState와 달리 바꿔도 화면을 다시 그리지 않는다)
    const workerRef = useRef<Worker | null>(null);
    const requestIdRef = useRef(0);

    useEffect(() => {
        const worker = new Worker(new URL('../bot/bot.worker.ts', import.meta.url), { type: 'module' });
        workerRef.current = worker;
        return () => worker.terminate();
    }, []);

    // ── 드래프트 열기 ──
    // 드래프트 시점이 되면 카드를 뽑는다. 봇 대전이면 봇은 바로 고른다.
    useEffect(() => {
        if (draftDue === null || draft !== null) return;
        const offers = drawOffers(state, draftDue);
        const picks: Record<Team, DraftPick | null> = { cho: null, han: null };
        const done = { cho: offers.cho.length === 0, han: offers.han.length === 0 };
        if (isBotGame) {
            picks[botTeam] = botPickAugment(offers[botTeam], settings.level);
            done[botTeam] = true;
        }
        setDraft({ phase: draftDue, offers, picks, done });
    }, [draftDue, draft, state, isBotGame, botTeam, settings.level]);

    // ── 드래프트 끝내기 ──
    // 두 사람 다 고르면 증강을 적용하고 공개한다 (좌우 패널에 카드가 나타난다).
    useEffect(() => {
        if (!draft || !draft.done.cho || !draft.done.han) return;
        setState((s) => finishDraft(s, draft.picks));
        setDraft(null);
    }, [draft]);

    // 사람이 카드를 골랐을 때
    const handlePick = useCallback((team: Team, pick: DraftPick | null) => {
        setDraft((d) => d && {
            ...d,
            picks: { ...d.picks, [team]: pick },
            done: { ...d.done, [team]: true },
        });
    }, []);

    // 지금 화면에서 카드를 고를 진영 (봇 대전: 나, 친구와 플레이: 초가 먼저, 그다음 한)
    let picker: Team | null = null;
    if (draft) {
        if (isBotGame) picker = draft.done[settings.playerTeam] ? null : settings.playerTeam;
        else picker = !draft.done.cho ? 'cho' : !draft.done.han ? 'han' : null;
    }

    // ── 봇 차례 처리 ──
    // useEffect: "state가 바뀐 뒤에" 실행되는 코드.
    // 봇 차례가 되면 작업자에게 계산을 맡기고, 답이 오면 적용한다.
    useEffect(() => {
        const worker = workerRef.current;
        if (!isBotTurn || !worker) return;

        const id = ++requestIdRef.current; // 이번 요청 번호
        const startedAt = Date.now();
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;

        worker.onmessage = (event: MessageEvent<BotResponse>) => {
            // 예전 요청의 답장이거나(다시 하기를 눌렀다든지), 이미 취소됐으면 무시한다.
            if (event.data.id !== id || cancelled) return;

            // 계산이 너무 빨리 끝났으면 최소 BOT_DELAY_MS까지는 기다렸다 둔다. (생각하는 척)
            const wait = Math.max(0, BOT_DELAY_MS - (Date.now() - startedAt));
            timer = setTimeout(() => {
                const move = event.data.move;
                if (move) {
                    setState(applyMove(state, move));
                    setLastMove(move);
                }
            }, wait);
        };

        const request: BotRequest = { id, level: settings.level, state };
        worker.postMessage(request);

        // 정리 함수: 기다리는 도중에 화면을 나가거나 state가 바뀌면 이 요청을 취소한다.
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [isBotTurn, state, settings.level]);

    // 사람이 수를 뒀을 때 (PlayArea가 알려준다)
    function playMove(move: Move) {
        setState(applyMove(state, move));
        setLastMove(move);
    }

    function restart() {
        setState(createInitialState());
        setDraft(null);
        setLastMove(null);
        setGameKey((k) => k + 1);
    }

    // ── 상태 문구 ──
    let status: string;
    if (state.isDraw) {
        status = '무승부';
    } else if (state.winner) {
        if (isBotGame) {
            status = state.winner === settings.playerTeam ? '승리했어요!' : '패배했어요';
        } else {
            status = `${TEAM_NAME[state.winner]} 승리!`;
        }
    } else if (isDrafting) {
        status = '증강 고르는 중...';
    } else if (isBotTurn) {
        status = `봇(${TEAM_NAME[state.turn]})이 생각 중...`;
    } else {
        status = `${TEAM_NAME[state.turn]} 차례 · ${state.moveCount + 1}수째`;
    }

    // 다음 드래프트까지 남은 주요 기물 수 안내
    const nextPhase = PHASE_ORDER[state.draftsDone];
    const draftInfo = nextPhase && nextPhase !== 'opening'
        ? `잡힌 주요 기물 ${state.majorCaptured}개 · ${PHASE_NAME[nextPhase]} 증강은 ${DRAFT_THRESHOLDS[nextPhase]}개부터`
        : state.draftsDone >= PHASE_ORDER.length ? `잡힌 주요 기물 ${state.majorCaptured}개 · 증강 선택 완료` : '';

    // 왼쪽 패널 = 나 (친구와 플레이면 초), 오른쪽 = 상대
    const leftTeam: Team = isBotGame ? settings.playerTeam : 'cho';

    return (
        <section className="game">
            <p className="info">
                {isBotGame
                    ? `봇 대전 · ${levelInfo.level}단계 ${levelInfo.name} · 나: ${TEAM_NAME[settings.playerTeam]}`
                    : '친구와 플레이'}
            </p>
            <p className={`status ${state.winner ?? state.turn} ${isOver ? 'winner' : ''}`}>{status}</p>
            {draftInfo && <p className="info">{draftInfo}</p>}
            <PlayArea
                key={gameKey}
                state={state}
                lastMove={lastMove}
                // 봇 대전: 내 진영만, 친구와 플레이: 한 화면에서 둘 다
                actingTeams={isBotGame ? [settings.playerTeam] : ['cho', 'han']}
                canAct={!isDrafting && !isBotTurn}
                onMove={playMove}
                // 봇 대전에서 한으로 플레이하면 내 진영이 아래에 오도록 판을 뒤집는다
                flipped={isBotGame && settings.playerTeam === 'han'}
                leftTeam={leftTeam}
                leftTitle={isBotGame ? '나' : '초'}
                rightTitle={isBotGame ? '봇' : '한'}
            />

            <div className="buttons">
                <button onClick={restart}>다시 하기</button>
                <button onClick={onExit}>처음 화면</button>
            </div>

            {draft && picker && (
                <DraftModal
                    // 고르는 사람이 바뀌면 새 화면으로 (타이머도 45초부터 다시)
                    key={`${draft.phase}-${picker}`}
                    phase={draft.phase}
                    team={picker}
                    offers={draft.offers[picker]}
                    onPick={(pick) => handlePick(picker!, pick)}
                />
            )}
        </section>
    );
}
