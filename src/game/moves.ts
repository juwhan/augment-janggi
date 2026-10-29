import type { GameState, Move, Position, Board } from './types';
import { inBounds, getPiece } from './board';
import { ROWS, COLS } from './types';

// 말 하나가 갈 수 있는 수
function getPieceMoves(board: Board, from: Position): Move[] {
    const piece = getPiece(board, from);
    if (!piece) return [];
    switch (piece.type) {
        case 'chariot': return getChariotMoves(board, from);
        // 나머지 말은 하나씩 추가
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

    return moves;
}