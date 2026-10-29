import type { GameState, Move, Position, Board } from './types';
import { inBounds, getPiece } from './board';

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
    const moves: Move[] = [];
    // TODO: 판 전체를 돌면서 내 말이면 getPieceMoves 결과를 모으기
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
            // TODO 1: 빈 칸 → moves에 { from, to: { row, col } } 추가
        } else if (target.team !== me.team) {
            // TODO 2: 상대 말 → moves에 추가하고 반복 멈추기 (break)
        } else {
            // TODO 3: 내 말 → 추가하지 않고 반복 멈추기
        }

        // TODO 4: 같은 방향으로 한 칸 더 나아가기 (row, col에 dr, dc 더하기)
        }
    }

    return moves;
}