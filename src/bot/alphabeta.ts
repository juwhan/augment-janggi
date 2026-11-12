// ───────────────────────────────────────────────
// 4~5단계 봇: 알파베타 가지치기 + 정지 탐색 + 수 정렬
//
// 3단계(minimax.ts)와 "찾는 답"은 같은데, 훨씬 적게 계산해서 더 깊이 볼 수 있다.
// minimax.ts는 공부용으로 그대로 두고, 여기에 개선판을 따로 만들었다.
// ───────────────────────────────────────────────
import { getLegalMoves } from '../game/moves';
import { applyMove } from '../game/apply';
import type { GameState, Move, Team } from '../game/types';
import { PIECE_VALUE } from './values';
import { pickRandom } from './random';
import type { Bot } from './types';

const WIN_SCORE = 100000;

// 정지 탐색에서 잡는 수를 최대 몇 번까지 연속으로 따라갈지.
// 장기는 차/포가 멀리서 잡을 수 있어서 연쇄가 길어질 수 있으니 상한을 둔다.
const MAX_QUIESCENCE_DEPTH = 6;

/** 판 점수 매기는 함수의 모양 (4단계는 말 점수만, 5단계는 위치 점수 포함) */
type Evaluator = (state: GameState, team: Team) => number;

/** 탐색에 필요한 설정을 한데 묶은 것. 재귀할 때마다 매개변수를 여러 개 넘기지 않으려고 만들었다. */
interface SearchContext {
    botTeam: Team;
    evaluate: Evaluator;
    deadline: number; // 이 시각(밀리초)이 지나면 탐색을 멈춘다. 제한 없으면 Infinity
    nodes: number;    // 지금까지 살펴본 판의 수 (시간 검사 간격용)
}

/** 제한 시간을 넘겼을 때 탐색을 한 번에 빠져나오기 위한 신호 */
class SearchTimeout extends Error {}

/**
 * 시간 검사. 매번 시계를 보면 그것도 느려서, 1024개 판마다 한 번만 본다.
 * (nodes & 1023) === 0 은 "nodes를 1024로 나눈 나머지가 0"과 같다.
 */
function checkTime(ctx: SearchContext) {
    ctx.nodes++;
    if ((ctx.nodes & 1023) === 0 && Date.now() > ctx.deadline) {
        throw new SearchTimeout();
    }
}

// ───────────────────────────────────────────────
// 1. 수 정렬 (Move Ordering)
// ───────────────────────────────────────────────

/** 이 수로 잡게 되는 말 (잡는 수가 아니면 null) */
function capturedBy(state: GameState, move: Move) {
    // 증강 사용과 넘기기는 "잡는 수"로 치지 않는다 (정지 탐색이 끝없이 길어지지 않도록)
    if (move.augment || move.pass) return null;
    return state.board[move.to.row][move.to.col];
}

/**
 * 좋은 수부터 먼저 보도록 순서를 정한다.
 * 알파베타는 "좋은 수를 먼저 볼수록" 가지를 많이 잘라낸다. (결과는 같고 속도만 빨라진다)
 *
 * 기준: MVV-LVA (Most Valuable Victim - Least Valuable Attacker)
 * - 비싼 말을 잡는 수를 먼저 (차 잡기 > 졸 잡기)
 * - 같은 말을 잡는다면 싼 말로 잡는 수를 먼저 (졸로 차 잡기 > 차로 차 잡기)
 * - 잡지 않는 수는 맨 뒤
 */
function orderMoves(state: GameState, moves: Move[]): Move[] {
    const priority = (move: Move): number => {
        const victim = capturedBy(state, move);
        if (victim === null) return 0;
        const attacker = state.board[move.from.row][move.from.col]!;
        return PIECE_VALUE[victim.type] * 100 - PIECE_VALUE[attacker.type];
    };
    // 원본 배열을 건드리지 않도록 복사([...moves])한 뒤, 우선순위가 높은 순으로 정렬
    return [...moves].sort((a, b) => priority(b) - priority(a));
}

// ───────────────────────────────────────────────
// 2. 정지 탐색 (Quiescence Search)
// ───────────────────────────────────────────────

/**
 * 정해진 깊이에 도달한 뒤, "잡는 수"만 계속 따라가서 판이 조용해졌을 때 평가한다.
 * 수평선 효과(계산이 끊긴 바로 다음에 말을 잃는 걸 못 보는 문제)를 줄인다.
 *
 * 스탠드팻(stand pat): 매 단계에서 "안 잡고 여기서 멈추기"도 선택지다.
 * 잡는 게 오히려 손해일 수 있기 때문이다. 그래서 지금 판의 점수를 기본값으로 두고,
 * 잡는 수들이 그보다 나을 때만 점수를 바꾼다.
 */
function quiescence(
    state: GameState, alpha: number, beta: number, qDepth: number, ctx: SearchContext,
): number {
    checkTime(ctx);
    if (state.winner !== null) {
        return state.winner === ctx.botTeam ? WIN_SCORE : -WIN_SCORE;
    }
    if (state.isDraw) return 0; // 무승부는 0점

    // 스탠드팻: 여기서 멈췄을 때의 점수
    const standPat = ctx.evaluate(state, ctx.botTeam);
    if (qDepth === 0) return standPat;

    // 잡는 수만 골라서, 비싼 말을 잡는 순서로 정렬
    const captures = orderMoves(
        state, getLegalMoves(state).filter((m) => capturedBy(state, m) !== null),
    );

    if (state.turn === ctx.botTeam) {
        // ── 봇 차례 (Max) ──
        let best = standPat;
        if (best >= beta) return best;      // 안 잡아도 이미 충분히 좋다 → 상대가 이 길을 안 줄 것
        alpha = Math.max(alpha, best);
        for (const move of captures) {
            const score = quiescence(applyMove(state, move, false), alpha, beta, qDepth - 1, ctx);
            best = Math.max(best, score);
            alpha = Math.max(alpha, best);
            if (alpha >= beta) break;       // 가지치기
        }
        return best;
    } else {
        // ── 상대 차례 (Min) ──
        let best = standPat;
        if (best <= alpha) return best;
        beta = Math.min(beta, best);
        for (const move of captures) {
            const score = quiescence(applyMove(state, move, false), alpha, beta, qDepth - 1, ctx);
            best = Math.min(best, score);
            beta = Math.min(beta, best);
            if (alpha >= beta) break;
        }
        return best;
    }
}

// ───────────────────────────────────────────────
// 3. 알파베타 (Alpha-Beta Pruning)
// ───────────────────────────────────────────────

/**
 * 네가 짠 minimax와 구조가 똑같다. 달라진 건 세 가지뿐:
 *
 * (1) 매개변수 alpha, beta가 추가됐다.
 *     alpha = "봇이 지금까지 찾은 경로로 최소한 이만큼은 확보했다" (봇의 하한선)
 *     beta  = "상대가 지금까지 찾은 경로로 봇을 최대 이만큼으로 묶을 수 있다" (봇의 상한선)
 *
 * (2) alpha >= beta가 되면 남은 수를 보지 않고 break 한다. (가지치기)
 *     예: 봇 차례에서 점수 10짜리 수를 찾았는데, 상대는 이미 다른 경로로
 *     봇을 8 이하로 묶을 수 있다(beta = 8). 그럼 상대는 이 경로를 절대 허락하지 않으니,
 *     이 아래 나머지 수를 더 볼 필요가 없다.
 *
 * (3) depth가 0이면 evaluate 대신 quiescence(정지 탐색)로 넘어간다.
 */
function alphaBeta(
    state: GameState, depth: number, alpha: number, beta: number, ctx: SearchContext,
): number {
    checkTime(ctx);
    if (state.isDraw) return 0; // 무승부는 0점
    if (state.winner !== null) {
        // depth를 더하는 이유는 minimax.ts와 같다: 빨리 이기고, 늦게 진다.
        return state.winner === ctx.botTeam ? WIN_SCORE + depth : -WIN_SCORE - depth;
    }
    if (depth === 0) {
        return quiescence(state, alpha, beta, MAX_QUIESCENCE_DEPTH, ctx);
    }

    const moves = orderMoves(state, getLegalMoves(state));

    // 둘 수 있는 수가 없으면 지금 차례인 쪽이 진다. (apply.ts의 6번 규칙을 여기서 직접 처리)
    if (moves.length === 0) {
        return state.turn === ctx.botTeam ? -WIN_SCORE - depth : WIN_SCORE + depth;
    }

    if (state.turn === ctx.botTeam) {
        // ── 봇 차례 (Max) ──
        let best = -Infinity;
        for (const move of moves) {
            const score = alphaBeta(applyMove(state, move, false), depth - 1, alpha, beta, ctx);
            best = Math.max(best, score);
            alpha = Math.max(alpha, best);   // 봇의 하한선 끌어올리기
            if (alpha >= beta) break;        // 가지치기
        }
        return best;
    } else {
        // ── 상대 차례 (Min) ──
        let best = Infinity;
        for (const move of moves) {
            const score = alphaBeta(applyMove(state, move, false), depth - 1, alpha, beta, ctx);
            best = Math.min(best, score);
            beta = Math.min(beta, best);     // 봇의 상한선 끌어내리기
            if (alpha >= beta) break;        // 가지치기
        }
        return best;
    }
}

// ───────────────────────────────────────────────
// 4. 봇 만들기
// ───────────────────────────────────────────────

/** 같은 점수로 취급할 오차. 점수는 0.1 단위라서 이보다 작은 차이는 생기지 않는다. */
const EPSILON = 0.001;

/**
 * 맨 위(지금 둘 수 고르기) 탐색. 정해진 깊이로 모든 수의 점수를 매겨서
 * 가장 좋은 점수의 수들을 돌려준다. (같은 점수가 여러 개일 수 있다)
 */
function searchRoot(state: GameState, moves: Move[], depth: number, ctx: SearchContext): Move[] {
    let bestScore = -Infinity;
    let bestMoves: Move[] = [];

    for (const move of moves) {
        // 맨 위에서도 가지치기를 쓰되, 지금까지의 최고 점수와 "같은" 수는 정확한 점수를 받도록
        // alpha를 최고 점수보다 아주 살짝 낮게 둔다.
        // - 최고 점수보다 나쁜 수: alpha 이하로 잘려서 빨리 끝난다 (정확한 점수는 몰라도 됨)
        // - 최고 점수와 같거나 좋은 수: 정확한 점수가 나온다
        // 그래서 속도는 빨라지고, 같은 점수의 수들 중 무작위로 고르는 것도 유지된다.
        const alpha = bestScore - EPSILON;
        const score = alphaBeta(applyMove(state, move, false), depth - 1, alpha, Infinity, ctx);
        if (score > bestScore + EPSILON) {
            bestScore = score;
            bestMoves = [move];
        } else if (Math.abs(score - bestScore) <= EPSILON) {
            bestMoves.push(move);
        }
    }
    return bestMoves;
}

/**
 * 알파베타 봇 만들기.
 * @param maxDepth     최대 몇 수 앞까지 볼지 (정지 탐색은 이 뒤에 추가로 붙는다)
 * @param evaluate     판 점수 매기는 함수
 * @param timeLimitMs  생각할 수 있는 최대 시간 (밀리초). 생략하면 제한 없음
 *
 * 반복 심화(iterative deepening):
 *   바로 maxDepth로 계산하지 않고, 깊이 1 → 2 → 3 → ... 순서로 점점 깊게 계산한다.
 *   시간이 다 되면 그때까지 "끝까지 계산한" 가장 깊은 결과를 쓴다.
 *   그래서 복잡한 판에서도 봇이 몇 초씩 멈춰 있지 않고, 단순한 판에서는 끝까지 깊게 본다.
 *   덤으로, 앞 깊이에서 찾은 최선의 수를 다음 깊이에서 가장 먼저 보니까 가지치기도 더 잘 된다.
 */
export function createAlphaBetaBot(maxDepth: number, evaluate: Evaluator, timeLimitMs = Infinity): Bot {
    return (state) => {
        let moves = orderMoves(state, getLegalMoves(state));
        if (moves.length === 0) return null;

        const ctx: SearchContext = {
            botTeam: state.turn,
            evaluate,
            deadline: Date.now() + timeLimitMs,
            nodes: 0,
        };

        let bestMoves: Move[] = [moves[0]]; // 혹시 깊이 1도 못 끝내면 쓸 기본값

        for (let depth = 1; depth <= maxDepth; depth++) {
            try {
                bestMoves = searchRoot(state, moves, depth, ctx);
            } catch (e) {
                if (e instanceof SearchTimeout) break; // 시간 초과: 직전 깊이의 결과를 쓴다
                throw e;                               // 다른 오류는 그대로 알린다
            }
            // 이번 깊이의 최선 수들을 맨 앞으로 옮겨서, 다음 깊이에서 먼저 보게 한다.
            moves = [...bestMoves, ...moves.filter((m) => !bestMoves.includes(m))];
        }

        return pickRandom(bestMoves);
    };
}
