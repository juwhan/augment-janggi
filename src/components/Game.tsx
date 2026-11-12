// ───────────────────────────────────────────────
// 게임 화면: 판 상태를 들고 있고, 클릭과 봇의 수를 처리한다.
// ───────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createInitialState, getPiece, opponent } from '../game/board';
import { getLegalMoves, isInCheck } from '../game/moves';
import { applyMove } from '../game/apply';
import { findGeneral, hasEffect } from '../game/actives';
import { AUG } from '../game/augmentIds';
import { PIECE_LABEL } from '../game/board';
import type { AugmentId, Move, PieceType, Position, Team } from '../game/types';
import { getAugment } from '../augments/registry';
import { BOT_LEVELS } from '../bot';
import type { BotRequest, BotResponse } from '../bot/bot.worker';
import type { AugmentPhase, DraftPick } from '../augments/registry';
import { PHASE_NAME, PHASE_ORDER } from '../augments/registry';
import { DRAFT_THRESHOLDS, botPickAugment, drawOffers, finishDraft, pendingDraftPhase } from '../augments/draft';
import { BoardView } from './BoardView';
import { AugmentPanel } from './AugmentPanel';
import { DraftModal } from './DraftModal';
import type { GameSettings } from './StartScreen';

/** 진행 중인 드래프트 */
interface DraftState {
    phase: AugmentPhase;
    offers: Record<Team, AugmentId[]>;       // 각자에게 나온 카드
    picks: Record<Team, DraftPick | null>;   // 각자 고른 카드 (+ 선택지)
    done: Record<Team, boolean>;             // 각자 골랐는지 (카드가 없으면 처음부터 true)
}

/**
 * 액티브 증강을 쓰는 중일 때의 상태.
 * 대상을 한 번 고르면 끝나는 증강(저격 등)은 step이 1뿐이고,
 * 두 번 고르는 증강(포격: 포 → 도착 칸, 자리 바꾸기: 말 → 말, 차 분신: 차 → 칸)은 step 2가 있다.
 */
interface UsingAugment {
    id: AugmentId;
    first: Position | null;        // 첫 번째로 고른 칸 (두 번 고르는 증강에서)
    pieceType: PieceType | null;   // 부활처럼 말 종류를 먼저 고르는 증강에서
}

/** 화면에서 고를 수 있는 선택지 하나: 첫 번째 칸, 두 번째 칸(없으면 null), 실제 수 */
interface ActiveOption {
    first: Position;
    second: Position | null;
    move: Move;
}

/** 증강 사용 수(Move)를 화면에서 고르기 쉬운 선택지 목록으로 바꾼다 */
function toOptions(moves: Move[], state: ReturnType<typeof createInitialState>): ActiveOption[] {
    const options: ActiveOption[] = [];
    for (const m of moves) {
        if (m.augment === AUG.BARRAGE) {
            // 일제 포격: 그 줄의 상대 졸 아무거나 누르면 그 줄을 고른 것으로 친다
            state.board[m.from.row].forEach((p, col) => {
                if (p && p.team !== state.turn && p.type === 'soldier') {
                    options.push({ first: { row: m.from.row, col }, second: null, move: m });
                }
            });
        } else if (samePos(m.from, m.to)) {
            options.push({ first: m.from, second: null, move: m });
        } else {
            options.push({ first: m.from, second: m.to, move: m });
            // 자리 바꾸기는 어느 쪽을 먼저 눌러도 되게 반대 순서도 넣는다
            if (m.augment === AUG.SWAP) options.push({ first: m.to, second: m.from, move: m });
        }
    }
    return options;
}

/**
 * 판에 흔적을 남길 만한 수인지.
 * 넘기기, 그리고 칸과 상관없는 증강(일제 포격, 연속 행동, 시간 정지 발동)은 남기지 않는다.
 */
const leavesTrace = (m: Move) =>
    !m.pass && m.augment !== AUG.BARRAGE && m.augment !== AUG.DOUBLE_MOVE && m.augment !== AUG.TIME_STOP;

/** 장군/멍군 글자 표시 시간 (밀리초) */
const FLASH_MS = 1400;

// 두 좌표가 같은 칸인지
const samePos = (a: Position, b: Position) => a.row === b.row && a.col === b.col;

// 겹치는 좌표를 하나만 남긴다
const uniquePositions = (list: Position[]) =>
    list.filter((p, i) => list.findIndex((q) => samePos(p, q)) === i);

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
    const [selected, setSelected] = useState<Position | null>(null);
    const [draft, setDraft] = useState<DraftState | null>(null);
    const [using, setUsing] = useState<UsingAugment | null>(null);
    // 바로 직전에 둔 수 (판에 흔적으로 표시). 넘기기는 남기지 않는다.
    const [lastMove, setLastMove] = useState<Move | null>(null);
    const [flash, setFlash] = useState<{ text: string; key: number; team: Team } | null>(null);

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

    const legalMoves = useMemo(() => getLegalMoves(state), [state]);
    // 말을 선택했을 때 보여줄 수: 보통 이동만 (증강 사용·넘기기 제외)
    const selectedMoves = selected
        ? legalMoves.filter((m) => !m.augment && !m.pass && samePos(m.from, selected))
        : [];

    // ── 액티브 증강 사용 화면 ──
    const activeOptions = useMemo(
        () => (using ? toOptions(legalMoves.filter((m) => m.augment === using.id), state) : []),
        [using, legalMoves, state],
    ).filter((o) => !using?.pieceType || o.move.pieceType === using.pieceType);
    // 지금 표시할 대상 칸들
    const activeTargets: Position[] = !using ? [] : using.first
        ? activeOptions.filter((o) => samePos(o.first, using.first!)).map((o) => o.second!)
        : uniquePositions(activeOptions.map((o) => o.first));
    // 부활처럼 말 종류를 먼저 골라야 하는지 (종류가 2개 이상일 때만)
    const reviveTypes = using && !using.pieceType
        ? [...new Set(legalMoves.filter((m) => m.augment === using.id && m.pieceType).map((m) => m.pieceType!))]
        : [];
    const needTypeChoice = reviveTypes.length > 1;

    // 지금 화면에서 직접 두는 사람인지 (봇 대전에서 봇 차례가 아니고, 게임이 진행 중일 때)
    const humanTurn = !isOver && !isDrafting && !isBotTurn;

    // ── 판 표시용 정보 ──
    const frozenIds = useMemo(() => new Set(state.effects.filter((e) => e.kind === 'freeze'
        && hasEffect(state, 'freeze', e.pieceId)).map((e) => e.pieceId)), [state]);
    const protectedIds = useMemo(() => new Set(state.effects.filter((e) => e.kind === 'protect'
        && hasEffect(state, 'protect', e.pieceId)).map((e) => e.pieceId)), [state]);
    const checkedGeneral = useMemo(
        () => (!isOver && isInCheck(state, state.turn) ? findGeneral(state.board, state.turn) : null),
        [state, isOver],
    );

    // ── 장군! / 멍군! ──
    // 차례가 넘어올 때마다 확인한다.
    // - 지금 둘 사람의 궁이 공격받고 있으면: 상대가 "장군!"
    // - 방금 둔 사람이 장군을 받고 있었는데 벗어났으면: "멍군!"
    const checkedTeamRef = useRef<Team | null>(null);
    const lastTurnRef = useRef(-1);
    useEffect(() => {
        if (state.moveCount === lastTurnRef.current || state.bonus || state.armed) return;
        lastTurnRef.current = state.moveCount;
        if (isOver) return;
        const mover = opponent(state.turn);
        if (checkedGeneral) {
            setFlash({ text: '장군!', key: Date.now(), team: mover });
            checkedTeamRef.current = state.turn;
        } else {
            if (checkedTeamRef.current === mover) setFlash({ text: '멍군!', key: Date.now(), team: mover });
            checkedTeamRef.current = null;
        }
    }, [state, checkedGeneral, isOver]);
    useEffect(() => {
        if (!flash) return;
        const timer = setTimeout(() => setFlash(null), FLASH_MS);
        return () => clearTimeout(timer);
    }, [flash]);

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
                    if (leavesTrace(move)) setLastMove(move);
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

    // ── 클릭 처리 ──
    function handleClick(pos: Position) {
        if (isOver) return;      // 게임 끝
        if (isDrafting) return;  // 증강 고르는 중
        if (isBotTurn) return;   // 봇이 생각 중일 땐 클릭 무시

        // 0. 액티브 증강의 대상을 고르는 중
        if (using) {
            if (needTypeChoice) return; // 말 종류부터 골라야 한다
            if (!using.first) {
                const opts = activeOptions.filter((o) => samePos(o.first, pos));
                if (opts.length === 0) return;
                if (opts[0].second === null) {
                    playMove(opts[0].move);              // 한 번 고르면 끝나는 증강
                } else {
                    setUsing({ ...using, first: pos });  // 두 번째 칸을 고르러
                }
            } else {
                const opt = activeOptions.find((o) => samePos(o.first, using.first!) && o.second && samePos(o.second, pos));
                if (opt) playMove(opt.move);
                else setUsing({ ...using, first: null }); // 다른 곳을 누르면 첫 번째 선택부터 다시
            }
            return;
        }

        // 1. 선택한 말이 갈 수 있는 칸을 눌렀다 → 수를 둔다
        if (selected) {
            const move = selectedMoves.find((m) => samePos(m.to, pos));
            if (move) {
                playMove(move);
                return;
            }
        }

        // 2. 선택한 말을 다시 눌렀다 → 선택 해제
        if (selected && samePos(selected, pos)) {
            setSelected(null);
            return;
        }

        // 3. 지금 차례인 진영의 말을 눌렀다 → 선택
        const piece = getPiece(state.board, pos);
        if (piece && piece.team === state.turn) {
            setSelected(pos);
            return;
        }

        // 4. 그 외 → 선택 해제
        setSelected(null);
    }

    // 수 하나를 두고, 선택 상태를 정리한다
    function playMove(move: Move) {
        setState(applyMove(state, move));
        if (leavesTrace(move)) setLastMove(move);
        setSelected(null);
        setUsing(null);
    }

    // 패널에서 "사용"을 눌렀을 때
    function startUsing(id: AugmentId) {
        const moves = legalMoves.filter((m) => m.augment === id);
        if (moves.length === 0) return;
        setSelected(null);
        if (id === AUG.DOUBLE_MOVE || id === AUG.TIME_STOP) {
            playMove(moves[0]); // 대상이 없는 증강은 바로 발동
            return;
        }
        setUsing({ id, first: null, pieceType: null });
    }

    // 지금 이 증강의 "사용" 버튼을 눌러도 되는지
    const canUse = (team: Team) => (id: AugmentId) =>
        humanTurn && team === state.turn && !state.bonus && !state.armed
        && legalMoves.some((m) => m.augment === id);

    function restart() {
        setState(createInitialState());
        setSelected(null);
        setDraft(null);
        setUsing(null);
        setLastMove(null);
        checkedTeamRef.current = null;
        lastTurnRef.current = -1;
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

    // 증강 진행 안내 문구 (추가 이동, 발동 대기, 대상 고르기)
    let hint: string | null = null;
    if (!isOver && !isDrafting) {
        if (using) {
            const name = getAugment(using.id).name;
            if (needTypeChoice) hint = `${name}: 되살릴 말 종류를 고르세요`;
            else if (using.first) hint = `${name}: 두 번째 칸을 고르세요`;
            else hint = `${name}: 대상을 고르세요`;
        } else if (state.armed === AUG.DOUBLE_MOVE) {
            hint = '연속 행동: 말을 하나 움직이면, 그 말로 한 번 더 움직일 수 있어요';
        } else if (state.armed === AUG.TIME_STOP) {
            hint = '시간 정지: 한 수를 두면, 한 수를 더 둘 수 있어요';
        } else if (state.bonus) {
            hint = state.bonus.pieceId === null
                ? '추가 이동: 한 수 더 두세요 (궁은 잡을 수 없음)'
                : state.bonus.canCapture
                    ? '추가 이동: 같은 말로 한 번 더 움직일 수 있어요'
                    : '추가 이동: 같은 말로 한 번 더 (잡기 불가)';
        }
    }
    const passMove = legalMoves.find((m) => m.pass);

    // 다음 드래프트까지 남은 주요 기물 수 안내
    const nextPhase = PHASE_ORDER[state.draftsDone];
    const draftInfo = nextPhase && nextPhase !== 'opening'
        ? `잡힌 주요 기물 ${state.majorCaptured}개 · ${PHASE_NAME[nextPhase]} 증강은 ${DRAFT_THRESHOLDS[nextPhase]}개부터`
        : state.draftsDone >= PHASE_ORDER.length ? `잡힌 주요 기물 ${state.majorCaptured}개 · 증강 선택 완료` : '';

    // 왼쪽 패널 = 나 (친구와 플레이면 초), 오른쪽 = 상대
    const leftTeam: Team = isBotGame ? settings.playerTeam : 'cho';
    const rightTeam: Team = opponent(leftTeam);

    return (
        <section className="game">
            <p className="info">
                {isBotGame
                    ? `봇 대전 · ${levelInfo.level}단계 ${levelInfo.name} · 나: ${TEAM_NAME[settings.playerTeam]}`
                    : '친구와 플레이'}
            </p>
            <p className={`status ${state.winner ?? state.turn} ${isOver ? 'winner' : ''}`}>{status}</p>
            {draftInfo && <p className="info">{draftInfo}</p>}
            {hint && (
                <div className="hint-bar">
                    <span>{hint}</span>
                    {using && needTypeChoice && reviveTypes.map((t) => (
                        <button key={t} onClick={() => setUsing({ ...using, pieceType: t })}>
                            {PIECE_LABEL[state.turn][t]}
                        </button>
                    ))}
                    {using && <button onClick={() => setUsing(null)}>취소</button>}
                    {!using && passMove && humanTurn && (
                        <button onClick={() => playMove(passMove)}>넘기기</button>
                    )}
                </div>
            )}

            <div className="game-main">
                <AugmentPanel
                    title={isBotGame ? '나' : '초'}
                    team={leftTeam}
                    augments={state.augments[leftTeam]}
                    used={state.usedAugments[leftTeam]}
                    side="left"
                    canUse={canUse(leftTeam)}
                    activeId={using?.id ?? null}
                    onUse={startUsing}
                />
                <BoardView
                    board={state.board}
                    selected={using?.first ?? selected}
                    targets={using ? activeTargets : selectedMoves.map((m) => m.to)}
                    onClick={handleClick}
                    traps={state.traps}
                    frozenIds={frozenIds}
                    protectedIds={protectedIds}
                    checkedGeneral={checkedGeneral}
                    flash={flash}
                    lastMove={lastMove}
                    // 봇 대전에서 한으로 플레이하면 내 진영이 아래에 오도록 판을 뒤집는다
                    flipped={isBotGame && settings.playerTeam === 'han'}
                />
                <AugmentPanel
                    title={isBotGame ? '봇' : '한'}
                    team={rightTeam}
                    augments={state.augments[rightTeam]}
                    used={state.usedAugments[rightTeam]}
                    side="right"
                    // 친구와 플레이에서는 오른쪽(한)도 자기 차례에 쓸 수 있다
                    canUse={isBotGame ? undefined : canUse(rightTeam)}
                    activeId={using?.id ?? null}
                    onUse={startUsing}
                />
            </div>

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
