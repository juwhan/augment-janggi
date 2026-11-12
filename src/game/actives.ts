// ───────────────────────────────────────────────
// 액티브 증강
//
// 액티브 증강은 "특별한 수"로 다룬다.
//   1) getActiveMoves: 지금 쓸 수 있는 액티브 증강 사용법을 전부 Move로 만든다.
//      → getLegalMoves가 보통 수와 같이 돌려주니까, 봇도 따로 배우지 않고 증강을 쓴다.
//   2) applyActive: 고른 사용법을 판에 적용한다. (applyMove가 부른다)
// 증강 하나의 "만들기"와 "적용하기"를 이 파일 한곳에 같이 두어서 찾기 쉽게 했다.
// ───────────────────────────────────────────────
import { AUG, ACTIVE_AUGMENTS } from './augmentIds';
import { getPiece, inBounds, isInPalace, opponent, toBoardRow } from './board';
import { COLS, ROWS } from './types';
import type { Board, GameState, Move, Piece, PieceType, Position, Team } from './types';

const ORTHOGONAL: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];

/** 판의 모든 칸을 돌면서 (위치, 말)을 넘겨주는 도우미 */
function forEachCell(board: Board, fn: (pos: Position, piece: Piece | null) => void) {
    for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) fn({ row, col }, board[row][col]);
    }
}

/** 효과(빙결/수호)가 지금 걸려 있는지 */
export function hasEffect(state: GameState, kind: 'freeze' | 'protect', pieceId: string): boolean {
    return state.effects.some((e) => e.kind === kind && e.pieceId === pieceId && e.until > state.moveCount);
}

/** 이 칸에 함정이 있는지 */
export function trapAt(state: GameState, pos: Position) {
    return state.traps.find((t) => t.pos.row === pos.row && t.pos.col === pos.col);
}

/** 상대가 "강을 건넜는지": 판의 절반(상대 진영)에 들어갔는지 */
function crossedRiver(team: Team, row: number): boolean {
    return team === 'cho' ? row <= 4 : row >= 5;
}

/**
 * 지금 차례인 진영이 쓸 수 있는 액티브 증강 사용법 전부.
 * 추가 이동 중이거나 발동 대기 중에는 쓸 수 없다.
 */
export function getActiveMoves(state: GameState): Move[] {
    if (state.bonus || state.armed) return [];
    const team = state.turn;
    const enemy = opponent(team);
    const board = state.board;
    const usable = state.augments[team].filter(
        (id) => ACTIVE_AUGMENTS.includes(id) && !state.usedAugments[team].includes(id),
    );
    const moves: Move[] = [];
    const general = findGeneral(board, team);

    for (const id of usable) {
        const add = (from: Position, to: Position, pieceType?: PieceType) =>
            moves.push({ from, to, augment: id, pieceType });

        switch (id) {
            // 포격: 내 포 하나가 받침 없이 차처럼 직선 이동·공격 (포와 궁은 잡을 수 없음)
            case AUG.CANNON_STRIKE:
                forEachCell(board, (pos, p) => {
                    if (!p || p.team !== team || p.type !== 'cannon' || hasEffect(state, 'freeze', p.id)) return;
                    for (const [dr, dc] of ORTHOGONAL) {
                        let to = { row: pos.row + dr, col: pos.col + dc };
                        while (inBounds(to)) {
                            const t = getPiece(board, to);
                            if (t === null) {
                                add(pos, to);
                            } else {
                                const ironPalace = isInPalace(to) && state.augments[enemy].includes(AUG.IRON_PALACE);
                                if (t.team === enemy && t.type !== 'cannon' && t.type !== 'general'
                                    && !hasEffect(state, 'protect', t.id) && !ironPalace) add(pos, to);
                                break;
                            }
                            to = { row: to.row + dr, col: to.col + dc };
                        }
                    }
                });
                break;

            // 빙결: 상대 말 하나(궁 제외)를 상대의 다음 차례 동안 못 움직이게
            case AUG.FREEZE:
                forEachCell(board, (pos, p) => {
                    if (p && p.team === enemy && p.type !== 'general') add(pos, pos);
                });
                break;

            // 수호: 내 말 하나가 상대의 다음 2번의 차례 동안 잡히지 않음
            case AUG.PROTECT:
                forEachCell(board, (pos, p) => {
                    if (p && p.team === team) add(pos, pos);
                });
                break;

            // 자리 바꾸기: 궁을 뺀 내 말 두 개의 위치를 바꾼다 (같은 종류끼리는 의미가 없어 제외)
            case AUG.SWAP: {
                const mine: { pos: Position; p: Piece }[] = [];
                forEachCell(board, (pos, p) => {
                    if (p && p.team === team && p.type !== 'general') mine.push({ pos, p });
                });
                for (let i = 0; i < mine.length; i++) {
                    for (let j = i + 1; j < mine.length; j++) {
                        if (mine[i].p.type !== mine[j].p.type) add(mine[i].pos, mine[j].pos);
                    }
                }
                break;
            }

            // 승급: 강을 건넌 내 졸 하나를 차로
            case AUG.PROMOTE:
                forEachCell(board, (pos, p) => {
                    if (p && p.team === team && p.type === 'soldier' && crossedRiver(team, pos.row)) add(pos, pos);
                });
                break;

            // 병력 보충: 잡힌 내 졸 하나를 졸 시작 줄(7행) 빈 칸에 되살린다
            case AUG.REINFORCE:
                if (state.captured[team].includes('soldier')) {
                    const row = toBoardRow(team, 7);
                    for (let col = 0; col < COLS; col++) {
                        if (board[row][col] === null) add({ row, col }, { row, col }, 'soldier');
                    }
                }
                break;

            // 함정: 빈 칸 하나에 함정 설치
            case AUG.TRAP:
                forEachCell(board, (pos, p) => {
                    if (p === null && !trapAt(state, pos)) add(pos, pos);
                });
                break;

            // 연속 행동 / 시간 정지: 발동만 한다 (다음 수를 둔 뒤 추가 이동이 생긴다)
            //   from/to는 의미가 없어서 내 궁 위치를 넣어둔다.
            case AUG.DOUBLE_MOVE:
            case AUG.TIME_STOP:
                if (general) add(general, general);
                break;

            // 저격: 상대 말 하나(궁·차 제외) 제거
            case AUG.SNIPE:
                forEachCell(board, (pos, p) => {
                    if (p && p.team === enemy && p.type !== 'general' && p.type !== 'chariot'
                        && !hasEffect(state, 'protect', p.id)) add(pos, pos);
                });
                break;

            // 일제 포격: 가로 한 줄을 골라 그 줄의 상대 졸을 모두 제거 (상대 졸이 있는 줄만)
            //   from/to = 그 줄의 맨 왼쪽 칸
            case AUG.BARRAGE:
                for (let row = 0; row < ROWS; row++) {
                    if (board[row].some((p) => p && p.team === enemy && p.type === 'soldier')) {
                        add({ row, col: 0 }, { row, col: 0 });
                    }
                }
                break;

            // 부활: 잡힌 내 말 하나(차 제외)를 내 궁성 안 빈 칸에 되살린다
            case AUG.REVIVE: {
                const types = [...new Set(state.captured[team])].filter((t) => t !== 'chariot' && t !== 'general');
                forEachCell(board, (pos, p) => {
                    if (p !== null || !isInPalace(pos) || !isOwnPalace(team, pos)) return;
                    for (const t of types) add(pos, pos, t);
                });
                break;
            }

            // 차 분신: 내 차 하나 바로 옆(상하좌우) 빈 칸에 차를 하나 더 만든다
            case AUG.CHARIOT_CLONE:
                forEachCell(board, (pos, p) => {
                    if (!p || p.team !== team || p.type !== 'chariot') return;
                    for (const [dr, dc] of ORTHOGONAL) {
                        const to = { row: pos.row + dr, col: pos.col + dc };
                        if (inBounds(to) && board[to.row][to.col] === null) add(pos, to);
                    }
                });
                break;
        }
    }
    return moves;
}

/** 내 궁의 위치 */
export function findGeneral(board: Board, team: Team): Position | null {
    for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
            const p = board[row][col];
            if (p && p.team === team && p.type === 'general') return { row, col };
        }
    }
    return null;
}

/** 이 칸이 내 진영 궁성인지 (초는 아래쪽, 한은 위쪽) */
function isOwnPalace(team: Team, pos: Position): boolean {
    return team === 'cho' ? pos.row >= 7 : pos.row <= 2;
}

/**
 * 액티브 증강 적용. applyMove가 복사해둔 판(board)과 상태(next)를 직접 고친다.
 * removed에는 이번에 판에서 사라진 말을 넣는다. (주요 기물 수·잡힌 말 기록용)
 */
export function applyActive(next: GameState, board: Board, move: Move, removed: Piece[]) {
    const team = next.turn;
    const id = move.augment!;
    const at = (pos: Position) => board[pos.row][pos.col];
    let serial = 0;
    const newId = (type: PieceType) => `${team}-${id}-${type}-${next.moveCount}-${serial++}`;

    switch (id) {
        case AUG.CANNON_STRIKE: {
            const target = at(move.to);
            if (target) removed.push(target);
            board[move.to.row][move.to.col] = at(move.from);
            board[move.from.row][move.from.col] = null;
            break;
        }
        case AUG.FREEZE:
            // 지금 moveCount = m (내 차례). 상대 차례는 m+1이니 m+2가 되면 풀린다.
            next.effects = [...next.effects, { kind: 'freeze', pieceId: at(move.from)!.id, until: next.moveCount + 2 }];
            break;
        case AUG.PROTECT:
            // 상대 차례 m+1, m+3 두 번 동안 보호 → m+4가 되면 풀린다.
            next.effects = [...next.effects, { kind: 'protect', pieceId: at(move.from)!.id, until: next.moveCount + 4 }];
            break;
        case AUG.SWAP: {
            const a = at(move.from);
            board[move.from.row][move.from.col] = at(move.to);
            board[move.to.row][move.to.col] = a;
            break;
        }
        case AUG.PROMOTE: {
            const soldier = at(move.from)!;
            board[move.from.row][move.from.col] = { ...soldier, type: 'chariot' };
            break;
        }
        case AUG.REINFORCE:
        case AUG.REVIVE: {
            const type = move.pieceType!;
            board[move.to.row][move.to.col] = { team, type, id: newId(type) };
            // 잃은 말 목록에서 하나 지운다
            const list = [...next.captured[team]];
            list.splice(list.indexOf(type), 1);
            next.captured = { ...next.captured, [team]: list };
            break;
        }
        case AUG.TRAP:
            next.traps = [...next.traps, { owner: team, pos: move.to }];
            break;
        case AUG.DOUBLE_MOVE:
        case AUG.TIME_STOP:
            next.armed = id;
            break;
        case AUG.SNIPE: {
            removed.push(at(move.to)!);
            board[move.to.row][move.to.col] = null;
            break;
        }
        case AUG.BARRAGE: {
            const row = move.from.row;
            for (let col = 0; col < COLS; col++) {
                const p = board[row][col];
                if (p && p.team !== team && p.type === 'soldier' && !hasEffect(next, 'protect', p.id)) {
                    removed.push(p);
                    board[row][col] = null;
                }
            }
            break;
        }
        case AUG.CHARIOT_CLONE:
            board[move.to.row][move.to.col] = { team, type: 'chariot', id: newId('chariot') };
            break;
    }

    next.usedAugments = { ...next.usedAugments, [team]: [...next.usedAugments[team], id] };
}
