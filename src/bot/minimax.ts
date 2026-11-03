import { getLegalMoves } from '../game/moves';
import { applyMove } from '../game/apply';
import type { GameState, Move, Team } from '../game/types';
import { evaluate } from './evaluate';
import { pickRandom } from './random';
import type { Bot } from './types';

// 궁을 잡았을 때의 점수. 말 점수 합(최대 100 정도)보다 훨씬 커야 한다.
const WIN_SCORE = 100000;

/**
 * 미니맥스: 이 상태에서 depth수 앞까지 서로 최선을 둔다고 가정했을 때의 점수.
 * 점수는 항상 botTeam(봇) 입장이다. 높을수록 봇에게 유리하다.
 *
 * - 봇 차례: 봇은 점수가 가장 "높은" 수를 고른다 (Max)
 * - 상대 차례: 상대는 봇의 점수가 가장 "낮은" 수를 고른다고 가정한다 (Min)
 *
 * 자기 자신을 부르면서 depth를 1씩 줄이고, depth가 0이 되면 멈춘다. (재귀)
 */
function minimax(state: GameState, depth: number, botTeam: Team): number {
    // ── 멈추는 조건 1: 게임이 끝났다 ──
    // 이기면 아주 큰 점수, 지면 아주 작은 점수.
    // depth를 더해주는 이유: depth가 많이 남았다 = 더 빨리 끝났다.
    // 그래서 같은 승리라도 빨리 이기는 쪽을, 같은 패배라도 늦게 지는 쪽을 고르게 된다.
    if (state.winner !== null) {
        return state.winner === botTeam ? WIN_SCORE + depth : -WIN_SCORE - depth;
    }

    // ── 멈추는 조건 2: 정해둔 깊이까지 다 봤다 ──
    // TODO 1: depth가 0이면 더 내려가지 말고, 지금 판의 점수를 돌려준다.
    //         (방금 만든 evaluate를 봇 입장으로 부른다)
    if (depth===0){
        return evaluate(state, botTeam);
    }


    const moves = getLegalMoves(state);

    if (state.turn === botTeam) {
        // ── 봇 차례 (Max): 가장 높은 점수를 찾는다 ──
        let best = -Infinity; // 아직 아무것도 안 봤으니 "가장 낮은 값"에서 시작

        for (const move of moves) {
            // 1) 이 수를 둔 다음 상태
            const next = applyMove(state, move);

            // 2) 그 상태의 점수 (재귀)
            const score = minimax(next, depth-1, botTeam);

            // 3) 더 크면 best 바꾸기
            if(score>best) best = score;
        }
        // TODO 2: moves를 하나씩 돌면서
        //   1) applyMove로 그 수를 둔 다음 상태를 만들고
        //   2) 그 상태로 minimax를 다시 부른다 (depth는 1 줄여서)
        //   3) 나온 점수가 best보다 크면 best를 바꾼다
        //   (C에서 배열 최댓값 찾기랑 같다. Math.max(a, b)를 써도 된다)


        return best;
    } else {
        // ── 상대 차례 (Min): 가장 낮은 점수를 찾는다 ──
        let best = Infinity; // "가장 높은 값"에서 시작

        // TODO 3: TODO 2와 똑같은데, 이번엔 더 "작은" 점수를 찾는다
        for (const move of moves) {
            // 1) 이 수를 둔 다음 상태
            const next = applyMove(state, move);

            // 2) 그 상태의 점수 (재귀)
            const score = minimax(next, depth-1, botTeam);

            // 3) 더 작으면 best 바꾸기
            if(score<best) best = score;
        }

        return best;
    }
}

/**
 * 미니맥스 봇 만들기.
 * depth를 정해서 부르면, 그 깊이로 생각하는 봇 함수를 돌려준다.
 * 예: createMinimaxBot(2) → 내 수와 상대 응수까지 보는 봇
 */
export function createMinimaxBot(depth: number): Bot {
    return (state) => {
        const moves = getLegalMoves(state);
        if (moves.length === 0) return null;

        const me = state.turn; // 봇의 진영
        let bestScore = -Infinity;
        let bestMoves: Move[] = [];

        // 내가 둘 수 있는 수마다, 그 뒤를 미니맥스로 계산해서 점수를 매긴다.
        // 이 수 자체가 1수니까 나머지는 depth - 1수만큼 본다.
        for (const move of moves) {
            const score = minimax(applyMove(state, move), depth - 1, me);
            if (score > bestScore) {
                bestScore = score;
                bestMoves = [move];
            } else if (score === bestScore) {
                bestMoves.push(move); // 같은 점수면 후보에 추가
            }
        }

        // 점수가 같은 수가 여러 개면 무작위로 골라서, 매 판 똑같이 두지 않게 한다.
        return pickRandom(bestMoves);
    };
}