import type { GameState, Move, Position, Board, Piece } from './types';
import { inBounds, getPiece, isInPalace } from './board';
import { ROWS, COLS } from './types';

// 말 하나가 갈 수 있는 수
function getPieceMoves(board: Board, from: Position): Move[] {
    const piece = getPiece(board, from);
    if (!piece) return [];
    switch (piece.type) {
        case 'chariot': return getChariotMoves(board, from);
        case 'cannon': return getCannonMoves(board, from);
        case 'horse': return getHorseMoves(board, from);
        case 'elephant': return getElephantMoves(board, from);
        case 'general': return getPalaceStepMoves(board, from); // 궁과 사는 움직임이 같다
        case 'guard': return getPalaceStepMoves(board, from);
        case 'soldier': return getSoldierMoves(board, from);
        default: return [];
    }
}

// 지금 차례인 진영의 모든 수
export function getLegalMoves(state: GameState): Move[] {
    const moves: Move[] = []; // 판 전체에서 찾은 수를 모아둘 배열

    // 판의 모든 칸(10행 x 9열)을 하나씩 확인한다. C의 2중 for문과 같다.
    for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
            // 1. 이 칸에 있는 말을 꺼낸다. 비어 있으면 null이 나온다.
            const target = getPiece(state.board, { row, col });

            // 2. 말이 있고(null이 아니고), 지금 차례인 진영의 말일 때만 수를 찾는다.
            if (target !== null && target.team === state.turn) {
                // getPieceMoves가 말 종류(차, 마, 포...)를 보고 알맞은 함수를 대신 골라준다.
                // 그래서 여기서는 switch 없이 부르기만 하면 되고,
                // 나중에 말이 추가돼도 이 함수는 고칠 필요가 없다.
                const pieceMoves = getPieceMoves(state.board, { row, col });

                // pieceMoves는 "수의 배열"이다. 예: [수1, 수2]
                // moves.push(pieceMoves)라고 쓰면 배열이 통째로 한 칸에 들어가서
                //   moves = [[수1, 수2]]   ← 배열 안에 배열 (틀림)
                // 앞에 ...을 붙이면 배열이 풀려서 하나씩 들어간다.
                //   moves = [수1, 수2]     ← 원하는 모양
                moves.push(...pieceMoves);

                // return을 쓰지 않는 이유:
                // return은 함수를 그 자리에서 끝내버려서, 첫 번째 말만 보고 멈춘다.
                // 판 전체를 끝까지 돌아야 하니까 push로 "모아두기"만 한다.
            }
        }
    }

    // 판을 다 돈 뒤에 모은 수를 한꺼번에 돌려준다.
    return moves;
}

// ───────────────────────────────────────────────
// 공통 도우미 함수
// 여러 말이 똑같이 쓰는 검사를 한곳에 모아둔다.
// ───────────────────────────────────────────────

/**
 * 말(me)이 이 칸(to)에 내려앉을 수 있는지.
 * 판 안이고, 비어 있거나 상대 말이 있으면 true. 내 말이 있으면 false.
 * (마, 상, 궁, 사, 졸처럼 "도착 칸 하나만 검사하면 되는" 말이 쓴다.)
 */
function canLandOn(board: Board, me: Piece, to: Position): boolean {
    if (!inBounds(to)) return false;
    const target = getPiece(board, to);
    return target === null || target.team !== me.team;
}

/**
 * 궁성 대각선을 따라 뻗어나가는 "길(ray)" 목록.
 * 길 하나 = 출발점에서 한 방향으로 순서대로 지나가는 칸들의 배열.
 *
 * 궁성은 3x3이고, 대각선은 모서리 4곳과 가운데를 잇는다.
 *   모서리 ── 가운데 ── 반대쪽 모서리
 *
 * - 가운데에 있으면: 모서리 4방향으로 각각 한 칸짜리 길이 4개
 * - 모서리에 있으면: 가운데를 지나 반대쪽 모서리까지 가는 길이 1개
 * - 변의 가운데(대각선이 안 지나는 곳)나 궁성 밖이면: 길이 없다
 *
 * 차와 포는 이 길을 "쭉" 따라가고,
 * 궁, 사, 졸은 길의 첫 칸까지만 간다.
 */
function getPalaceDiagonalRays(from: Position): Position[][] {
    if (!isInPalace(from)) return [];

    // 지금 있는 궁성의 가운데 점. 위쪽 궁성이면 (1, 4), 아래쪽 궁성이면 (8, 4)
    const center: Position = { row: from.row <= 2 ? 1 : 8, col: 4 };

    const isCenter = from.row === center.row && from.col === center.col;
    if (isCenter) {
        return [
            [{ row: center.row - 1, col: 3 }], // 왼쪽 위 모서리
            [{ row: center.row - 1, col: 5 }], // 오른쪽 위 모서리
            [{ row: center.row + 1, col: 3 }], // 왼쪽 아래 모서리
            [{ row: center.row + 1, col: 5 }], // 오른쪽 아래 모서리
        ];
    }

    const isCorner = from.row !== center.row && from.col !== 4;
    if (isCorner) {
        // 반대쪽 모서리 = 가운데를 기준으로 점대칭인 위치
        const opposite: Position = { row: 2 * center.row - from.row, col: 8 - from.col };
        return [[center, opposite]];
    }

    return []; // 변의 가운데: 대각선이 지나가지 않는다
}

/**
 * 판 끝까지 뻗는 상하좌우 4개의 길.
 * 포가 쓴다. (차는 네가 짠 while 방식을 그대로 쓴다)
 */
function getOrthogonalRays(from: Position): Position[][] {
    const rays: Position[][] = [];
    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];

    for (const [dr, dc] of directions) {
        const ray: Position[] = [];
        let row = from.row + dr;
        let col = from.col + dc;
        while (inBounds({ row, col })) {
            ray.push({ row, col });
            row += dr;
            col += dc;
        }
        rays.push(ray);
    }
    return rays;
}

/**
 * 길(ray)을 따라 막힐 때까지 미끄러지는 이동. 차의 궁성 대각선 이동에 쓴다.
 * 네가 짠 차 코드의 while문과 규칙이 완전히 같다.
 */
function slideAlong(board: Board, from: Position, ray: Position[]): Move[] {
    const moves: Move[] = [];
    const me = getPiece(board, from)!;

    for (const to of ray) {
        const target = getPiece(board, to);
        if (target === null) {
            moves.push({ from, to }); // 빈 칸: 가고, 계속
        } else if (target.team !== me.team) {
            moves.push({ from, to }); // 상대 말: 잡고, 멈춤
            break;
        } else {
            break; // 내 말: 멈춤
        }
    }
    return moves;
}

// ───────────────────────────────────────────────
// 차(車)
// ───────────────────────────────────────────────

// 차가 갈 수 있는 수
function getChariotMoves(board: Board, from: Position): Move[] {
    const moves: Move[] = [];
    const me = getPiece(board, from)!; // 지금 움직이려는 차 (! = 여기엔 반드시 말이 있다는 뜻)
    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]]; // 위, 아래, 왼쪽, 오른쪽

    for (const [dr, dc] of directions) {
        let row = from.row + dr;
        let col = from.col + dc;

        while (inBounds({ row, col })) {
            const target = getPiece(board, { row, col });

            if (target === null) {
                // 빈 칸이면 차가 이 칸으로 갈 수 있다.
                // 그래서 "from에서 (row, col)로 가는 수" 하나를 만들어 moves 배열에 추가한다.
                //
                // { from, to: { row, col } } 를 풀어서 쓰면 이것과 같다:
                //   {
                //       from: from,                       // 출발 위치 = 지금 차가 있는 곳
                //       to: { row: row, col: col },        // 도착 위치 = 지금 검사 중인 칸
                //   }
                // TS에서는 이름과 값이 같으면(from: from) 한 번만 써도 된다.
                //
                // 이 { ... } 모양이 types.ts에 정의한 Move 타입과 똑같아서
                // Move[] 배열인 moves에 넣을 수 있다.
                moves.push({ from, to: { row, col } });

                // 빈 칸이니까 멈추지 않는다.
                // 아래 TODO 4로 내려가서 한 칸 더 나아간 뒤, while이 다시 돈다.
            } else if (target.team !== me.team) {
                // TODO 2: 상대 말 → moves에 추가하고 반복 멈추기 (break)
                moves.push({ from, to: { row, col } });
                break;
            } else {
                // TODO 3: 내 말 → 추가하지 않고 반복 멈추기
                break;
            }

            // TODO 4: 같은 방향으로 한 칸 더 나아가기 (row, col에 dr, dc 더하기)
            row += dr;
            col += dc;
        }
    }

    // [추가] 궁성 안에서는 대각선 선을 따라서도 움직일 수 있다.
    for (const ray of getPalaceDiagonalRays(from)) {
        moves.push(...slideAlong(board, from, ray));
    }

    return moves;
}
// ───────────────────────────────────────────────
// 포(包)
// ───────────────────────────────────────────────

/**
 * 길(ray) 하나를 따라 포가 갈 수 있는 수.
 *
 * 포의 규칙:
 * 1. 반드시 말 하나(받침)를 넘어야 움직일 수 있다. 받침은 내 말이든 상대 말이든 된다.
 * 2. 받침이 포면 넘을 수 없다.
 * 3. 받침을 넘은 뒤에는 빈 칸으로 계속 가거나, 처음 만나는 상대 말을 잡는다.
 * 4. 포는 포를 잡을 수 없다.
 *
 * 그래서 길을 따라가면서 "받침을 찾기 전"과 "받침을 넘은 후" 두 단계로 나눠 처리한다.
 */
function cannonAlong(board: Board, from: Position, ray: Position[]): Move[] {
    const moves: Move[] = [];
    const me = getPiece(board, from)!;
    let jumped = false; // 받침을 넘었는지

    for (const to of ray) {
        const target = getPiece(board, to);

        if (!jumped) {
            // ── 1단계: 받침 찾는 중 ──
            if (target === null) continue;            // 빈 칸은 그냥 지나간다 (아직 못 멈춤)
            if (target.type === 'cannon') break;      // 포는 받침이 될 수 없다 → 이 방향 끝
            jumped = true;                            // 받침 발견! 이제 넘는다
            continue;
        }

        // ── 2단계: 받침을 넘은 후 ──
        if (target === null) {
            moves.push({ from, to });                 // 빈 칸: 갈 수 있고 계속
            continue;
        }
        if (target.type !== 'cannon' && target.team !== me.team) {
            moves.push({ from, to });                 // 포가 아닌 상대 말: 잡을 수 있다
        }
        break;                                        // 어떤 말이든 만나면 여기서 끝
    }
    return moves;
}

// 포가 갈 수 있는 수: 상하좌우 4방향 + 궁성 대각선
function getCannonMoves(board: Board, from: Position): Move[] {
    const moves: Move[] = [];
    const rays = [...getOrthogonalRays(from), ...getPalaceDiagonalRays(from)];
    for (const ray of rays) {
        moves.push(...cannonAlong(board, from, ray));
    }
    return moves;
}

// ───────────────────────────────────────────────
// 마(馬)
// ───────────────────────────────────────────────

/**
 * "점프형" 말(마, 상)의 이동 하나를 표현하는 타입.
 * - path: 지나가는 칸들(멱). 출발점 기준으로 [행 변화, 열 변화]. 하나라도 막히면 못 간다.
 * - to:   도착 칸. 출발점 기준으로 [행 변화, 열 변화].
 */
interface JumpPattern {
    path: [number, number][];
    to: [number, number];
}

/**
 * 마가 갈 수 있는 8가지 경우를 표로 적어둔 것.
 * 마는 "직선 한 칸 → 바깥쪽 대각선 한 칸"으로 움직인다.
 * 그래서 도착 칸은 출발점에서 진행 방향으로 2칸, 옆으로 1칸 떨어져 있다.
 *
 *   · 가 · 가 ·        행이 줄어드는 쪽이 위(-1), 늘어나는 쪽이 아래(+1)
 *   가 · ○ · 가        ○ = 멱 (path)
 *   · ○ 馬 ○ ·        가 = 도착 (to)
 *   가 · ○ · 가
 *   · 가 · 가 ·
 *
 * 코드로 좌표를 계산하는 대신 표로 적어두면,
 * 눈으로 보고 맞는지 확인하기 쉽고 실수가 줄어든다.
 */
const HORSE_PATTERNS: JumpPattern[] = [
    // 위로 한 칸 간 뒤 → 왼쪽 위 / 오른쪽 위
    { path: [[-1, 0]], to: [-2, -1] },
    { path: [[-1, 0]], to: [-2, 1] },
    // 아래로 한 칸 간 뒤 → 왼쪽 아래 / 오른쪽 아래
    { path: [[1, 0]], to: [2, -1] },
    { path: [[1, 0]], to: [2, 1] },
    // 왼쪽으로 한 칸 간 뒤 → 왼쪽 위 / 왼쪽 아래
    { path: [[0, -1]], to: [-1, -2] },
    { path: [[0, -1]], to: [1, -2] },
    // 오른쪽으로 한 칸 간 뒤 → 오른쪽 위 / 오른쪽 아래
    { path: [[0, 1]], to: [-1, 2] },
    { path: [[0, 1]], to: [1, 2] },
];

/**
 * 점프형 말의 공통 로직.
 * 패턴 표만 바꿔 넣으면 마와 상 모두 이 함수 하나로 처리할 수 있다.
 */
function getJumpMoves(board: Board, from: Position, patterns: JumpPattern[]): Move[] {
    const moves: Move[] = [];
    const me = getPiece(board, from)!; // 지금 움직이려는 말

    for (const pattern of patterns) {
        // 1. 도착 칸 좌표 계산 (출발점 + 변화량)
        const to: Position = {
            row: from.row + pattern.to[0],
            col: from.col + pattern.to[1],
        };

        // 2. 도착 칸이 판 밖이면 이 경우는 건너뛴다.
        //    getPiece는 판 밖이면 null을 돌려주기 때문에,
        //    이 검사가 없으면 "빈 칸"으로 착각해서 판 밖으로 가는 수가 생긴다.
        if (!inBounds(to)) continue;

        // 3. 지나가는 칸(멱) 중 하나라도 말이 있으면 막힌 것이다.
        //    some()은 "배열 중 하나라도 조건을 만족하면 true"를 돌려준다.
        //    C로 치면 for문 돌면서 하나라도 걸리면 blocked = 1 하는 것과 같다.
        const blocked = pattern.path.some(([dr, dc]) =>
            getPiece(board, { row: from.row + dr, col: from.col + dc }) !== null,
        );
        if (blocked) continue;

        // 4. 도착 칸이 비어 있거나 상대 말이면 갈 수 있다. 내 말이면 못 간다.
        if (canLandOn(board, me, to)) {
            moves.push({ from, to });
        }
    }

    return moves;
}

// 마가 갈 수 있는 수
function getHorseMoves(board: Board, from: Position): Move[] {
    return getJumpMoves(board, from, HORSE_PATTERNS);
}

// ───────────────────────────────────────────────
// 상(象)
// ───────────────────────────────────────────────

/**
 * 상은 "직선 한 칸 → 같은 쪽 대각선 두 칸"으로 움직인다.
 * 도착 칸은 진행 방향으로 3칸, 옆으로 2칸 떨어져 있고,
 * 지나가는 칸(멱)은 2개다. 둘 중 하나라도 막히면 못 간다.
 *
 * 위로 가는 경우 예시 (象이 출발점):
 *   가 · · · 가      가 = 도착 [-3, ±2]
 *   · ○ · ○ ·       ○ = 두 번째 멱 [-2, ±1]
 *   · · ○ · ·       ○ = 첫 번째 멱 [-1, 0]
 *   · · 象 · ·
 *
 * 마와 구조가 같아서 표만 새로 만들고 getJumpMoves를 그대로 쓴다.
 */
const ELEPHANT_PATTERNS: JumpPattern[] = [
    // 위로
    { path: [[-1, 0], [-2, -1]], to: [-3, -2] },
    { path: [[-1, 0], [-2, 1]], to: [-3, 2] },
    // 아래로
    { path: [[1, 0], [2, -1]], to: [3, -2] },
    { path: [[1, 0], [2, 1]], to: [3, 2] },
    // 왼쪽으로
    { path: [[0, -1], [-1, -2]], to: [-2, -3] },
    { path: [[0, -1], [1, -2]], to: [2, -3] },
    // 오른쪽으로
    { path: [[0, 1], [-1, 2]], to: [-2, 3] },
    { path: [[0, 1], [1, 2]], to: [2, 3] },
];

// 상이 갈 수 있는 수
function getElephantMoves(board: Board, from: Position): Move[] {
    return getJumpMoves(board, from, ELEPHANT_PATTERNS);
}

// ───────────────────────────────────────────────
// 궁(楚/漢), 사(士)
// ───────────────────────────────────────────────

/**
 * 궁과 사가 갈 수 있는 수. 둘은 움직임이 완전히 같다.
 * - 궁성 안에서만 움직인다.
 * - 선을 따라 한 칸: 상하좌우, 그리고 대각선이 그어진 곳에서는 대각선으로도 한 칸.
 */
function getPalaceStepMoves(board: Board, from: Position): Move[] {
    const moves: Move[] = [];
    const me = getPiece(board, from)!;

    // 후보 1: 상하좌우 한 칸
    const candidates: Position[] = [
        { row: from.row - 1, col: from.col },
        { row: from.row + 1, col: from.col },
        { row: from.row, col: from.col - 1 },
        { row: from.row, col: from.col + 1 },
    ];

    // 후보 2: 궁성 대각선 길의 "첫 칸"만 (한 칸만 가니까)
    for (const ray of getPalaceDiagonalRays(from)) {
        candidates.push(ray[0]);
    }

    for (const to of candidates) {
        // 궁성 밖으로는 못 나간다.
        // 한 칸 이동으로는 반대편 궁성에 닿을 수 없어서, isInPalace만으로 충분하다.
        if (isInPalace(to) && canLandOn(board, me, to)) {
            moves.push({ from, to });
        }
    }
    return moves;
}

// ───────────────────────────────────────────────
// 졸(卒), 병(兵)
// ───────────────────────────────────────────────

/**
 * 졸/병이 갈 수 있는 수.
 * - 앞으로 한 칸, 또는 옆으로 한 칸. 뒤로는 못 간다.
 * - "앞"은 진영마다 반대다. 초는 위(row가 줄어드는 쪽), 한은 아래(row가 늘어나는 쪽).
 * - 상대 궁성 안에서는 앞쪽 대각선 선을 따라서도 한 칸 갈 수 있다.
 * - 끝줄에 닿아도 승급하지 않는다. (앞 칸이 판 밖이 되어 자연스럽게 옆으로만 움직인다)
 */
function getSoldierMoves(board: Board, from: Position): Move[] {
    const moves: Move[] = [];
    const me = getPiece(board, from)!;
    const forward = me.team === 'cho' ? -1 : 1; // 앞 방향의 row 변화량

    const candidates: Position[] = [
        { row: from.row + forward, col: from.col }, // 앞
        { row: from.row, col: from.col - 1 },       // 왼쪽
        { row: from.row, col: from.col + 1 },       // 오른쪽
    ];

    // 궁성 대각선 중에서 "앞쪽으로 가는" 칸만 추가한다.
    // (졸은 뒤로 못 가니까 자기 진영 궁성에 들어갈 일이 없어서, 여기 궁성은 항상 상대 궁성이다)
    for (const ray of getPalaceDiagonalRays(from)) {
        const to = ray[0];
        if (to.row === from.row + forward) {
            candidates.push(to);
        }
    }

    for (const to of candidates) {
        if (canLandOn(board, me, to)) {
            moves.push({ from, to });
        }
    }
    return moves;
}
