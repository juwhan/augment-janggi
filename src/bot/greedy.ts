import { getLegalMoves } from '../game/moves';
import { getPiece } from '../game/board';
import type { Move } from '../game/types';
import { PIECE_VALUE } from './values';
import { pickRandom } from './random';
import type { Bot } from './types';

/**
 * 2단계 봇: 눈앞의 이득만 본다.
 * - 잡을 수 있는 말이 있으면, 그중 가장 비싼 말을 잡는다. (궁을 잡을 수 있으면 무조건 잡는다)
 * - 잡을 게 없으면 아무 수나 둔다.
 * - 상대가 다음 수에 뭘 할지는 전혀 생각하지 않는다. 그래서 비싼 말을 잡으려다 자기 차를 내주기도 한다.
 */
export const greedyBot: Bot = (state) => {
    const moves = getLegalMoves(state);
    if (moves.length === 0) return null;

    let bestValue = 0;          // 지금까지 찾은 가장 비싼 잡기의 점수
    let bestMoves: Move[] = []; // 그 점수를 내는 수들 (같은 점수가 여러 개일 수 있다)

    for (const move of moves) {
        const target = getPiece(state.board, move.to);
        if (target === null) continue; // 잡는 수가 아니면 건너뛴다

        const value = PIECE_VALUE[target.type];
        if (value > bestValue) {
            // 더 비싼 걸 찾았다 → 목록을 새로 시작
            bestValue = value;
            bestMoves = [move];
        } else if (value === bestValue) {
            // 같은 가치 → 후보에 추가 (나중에 이 중 무작위로 고른다)
            bestMoves.push(move);
        }
    }

    // 잡을 게 있으면 그중에서, 없으면 전체에서 무작위
    return pickRandom(bestMoves.length > 0 ? bestMoves : moves);
};
