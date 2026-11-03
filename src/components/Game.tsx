// ───────────────────────────────────────────────
// 게임 화면: 판 상태를 들고 있고, 클릭과 봇의 수를 처리한다.
// ───────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from 'react';
import { createInitialState, getPiece } from '../game/board';
import { getLegalMoves } from '../game/moves';
import { applyMove } from '../game/apply';
import type { Position } from '../game/types';
import { BOT_LEVELS } from '../bot';
import type { BotRequest, BotResponse } from '../bot/bot.worker';
import { BoardView } from './BoardView';
import type { GameSettings } from './StartScreen';

// 두 좌표가 같은 칸인지
const samePos = (a: Position, b: Position) => a.row === b.row && a.col === b.col;

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

    // ── 계산 ──
    const levelInfo = BOT_LEVELS.find((l) => l.level === settings.level)!;
    const isBotGame = settings.mode === 'bot';

    // 지금이 봇 차례인지: 봇 대전이고, 내 진영 차례가 아니고, 게임이 안 끝났을 때
    const isBotTurn = isBotGame && state.turn !== settings.playerTeam && state.winner === null;

    const legalMoves = useMemo(() => getLegalMoves(state), [state]);
    const selectedMoves = selected ? legalMoves.filter((m) => samePos(m.from, selected)) : [];

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
                if (move) setState(applyMove(state, move));
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
        if (state.winner !== null) return; // 게임 끝
        if (isBotTurn) return;             // 봇이 생각 중일 땐 클릭 무시

        // 1. 선택한 말이 갈 수 있는 칸을 눌렀다 → 수를 둔다
        if (selected) {
            const move = selectedMoves.find((m) => samePos(m.to, pos));
            if (move) {
                setState(applyMove(state, move));
                setSelected(null);
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

    function restart() {
        setState(createInitialState());
        setSelected(null);
    }

    // ── 상태 문구 ──
    let status: string;
    if (state.winner) {
        if (isBotGame) {
            status = state.winner === settings.playerTeam ? '승리했어요!' : '패배했어요';
        } else {
            status = `${TEAM_NAME[state.winner]} 승리!`;
        }
    } else if (isBotTurn) {
        status = `봇(${TEAM_NAME[state.turn]})이 생각 중...`;
    } else {
        status = `${TEAM_NAME[state.turn]} 차례 · ${state.moveCount + 1}수째`;
    }

    return (
        <section className="game">
            <p className="info">
                {isBotGame
                    ? `봇 대전 · ${levelInfo.level}단계 ${levelInfo.name} · 나: ${TEAM_NAME[settings.playerTeam]}`
                    : '친구와 플레이'}
            </p>
            <p className={`status ${state.winner ?? state.turn} ${state.winner ? 'winner' : ''}`}>{status}</p>

            <BoardView
                board={state.board}
                selected={selected}
                targets={selectedMoves.map((m) => m.to)}
                onClick={handleClick}
                // 봇 대전에서 한으로 플레이하면 내 진영이 아래에 오도록 판을 뒤집는다
                flipped={isBotGame && settings.playerTeam === 'han'}
            />

            <div className="buttons">
                <button onClick={restart}>다시 하기</button>
                <button onClick={onExit}>처음 화면</button>
            </div>
        </section>
    );
}
