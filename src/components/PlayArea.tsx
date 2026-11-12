// ───────────────────────────────────────────────
// 대국 화면의 공통 부분: 판, 좌우 증강 패널, 안내 막대
//   - 말 선택과 이동, 액티브 증강 대상 고르기
//   - 장군!/멍군! 표시, 직전 수 흔적, 빙결·수호·함정 표시
//
// 혼자 두기(봇·친구)와 온라인 대전이 이 화면을 같이 쓴다.
// 이 화면은 "수를 두겠다"고 onMove로 알려주기만 한다.
// 실제로 상태를 바꾸는 건 부모(혼자 두기: Game, 온라인: 서버)가 한다.
// ───────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from 'react';
import { getPiece, opponent, PIECE_LABEL } from '../game/board';
import { getLegalMoves, isInCheck } from '../game/moves';
import { findGeneral, hasEffect } from '../game/actives';
import { AUG } from '../game/augmentIds';
import type { AugmentId, GameState, Move, PieceType, Position, Team } from '../game/types';
import { getAugment } from '../augments/registry';
import { BoardView } from './BoardView';
import { AugmentPanel } from './AugmentPanel';

/**
 * 액티브 증강을 쓰는 중일 때의 상태.
 * 대상을 한 번 고르면 끝나는 증강(저격 등)은 first 없이 끝나고,
 * 두 번 고르는 증강(포격: 포 → 도착 칸, 자리 바꾸기: 말 → 말, 차 분신: 차 → 칸)은 first를 거친다.
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

// 두 좌표가 같은 칸인지
const samePos = (a: Position, b: Position) => a.row === b.row && a.col === b.col;

// 겹치는 좌표를 하나만 남긴다
const uniquePositions = (list: Position[]) =>
    list.filter((p, i) => list.findIndex((q) => samePos(p, q)) === i);

/** 증강 사용 수(Move)를 화면에서 고르기 쉬운 선택지 목록으로 바꾼다 */
function toOptions(moves: Move[], state: GameState): ActiveOption[] {
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

interface PlayAreaProps {
    state: GameState;
    /** 직전에 둔 수 (흔적 표시용). 없으면 null */
    lastMove: Move | null;
    /** 이 화면이 조작하는 진영 (봇 대전: 나, 친구와 플레이: 초와 한 둘 다, 온라인: 내 진영) */
    actingTeams: Team[];
    /** 지금 조작을 받아도 되는지 (드래프트 중, 봇 계산 중, 게임 끝 등이면 false) */
    canAct: boolean;
    onMove: (move: Move) => void;
    flipped: boolean;
    leftTeam: Team;
    leftTitle: string;
    rightTitle: string;
}

export function PlayArea({
    state, lastMove, actingTeams, canAct, onMove, flipped, leftTeam, leftTitle, rightTitle,
}: PlayAreaProps) {
    const [selected, setSelected] = useState<Position | null>(null);
    const [using, setUsing] = useState<UsingAugment | null>(null);
    const [flash, setFlash] = useState<{ text: string; key: number; team: Team } | null>(null);

    const isOver = state.winner !== null || state.isDraw;
    // 지금 이 화면에서 직접 둘 차례인지
    const humanTurn = canAct && !isOver && actingTeams.includes(state.turn);

    // 상태가 바뀌면(상대가 두었거나, 내 수가 서버에서 돌아왔거나) 선택을 정리한다
    useEffect(() => {
        setSelected(null);
        setUsing(null);
    }, [state]);

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

    // ── 클릭 처리 ──
    function handleClick(pos: Position) {
        if (!humanTurn) return;

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

    // 수 하나를 부모에게 알리고, 선택 상태를 정리한다
    function playMove(move: Move) {
        onMove(move);
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

    // 증강 진행 안내 문구 (추가 이동, 발동 대기, 대상 고르기)
    let hint: string | null = null;
    if (!isOver && canAct) {
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
    const rightTeam = opponent(leftTeam);

    return (
        <>
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
                    title={leftTitle}
                    team={leftTeam}
                    augments={state.augments[leftTeam]}
                    used={state.usedAugments[leftTeam]}
                    side="left"
                    canUse={actingTeams.includes(leftTeam) ? canUse(leftTeam) : undefined}
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
                    lastMove={lastMove && leavesTrace(lastMove) ? lastMove : null}
                    flipped={flipped}
                />
                <AugmentPanel
                    title={rightTitle}
                    team={rightTeam}
                    augments={state.augments[rightTeam]}
                    used={state.usedAugments[rightTeam]}
                    side="right"
                    canUse={actingTeams.includes(rightTeam) ? canUse(rightTeam) : undefined}
                    activeId={using?.id ?? null}
                    onUse={startUsing}
                />
            </div>
        </>
    );
}
