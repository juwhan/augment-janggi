import { getLegalMoves } from '../game/moves';
import type { Bot } from './types';

/**
 * 배열에서 아무거나 하나 고른다.
 * Math.random()은 0 이상 1 미만의 실수를 돌려준다. 길이를 곱하고 내림하면 0 ~ 길이-1 사이 정수가 된다.
 * C의 rand() % n 과 같은 역할이다.
 */
export function pickRandom<T>(items: T[]): T {
    return items[Math.floor(Math.random() * items.length)];
}

/**
 * 1단계 봇: 둘 수 있는 수 중 아무거나.
 * 잡을 수 있는 말도 무시하고, 궁이 위험해도 신경 안 쓴다. 완전 초보.
 */
export const randomBot: Bot = (state) => {
    const moves = getLegalMoves(state);
    if (moves.length === 0) return null;
    return pickRandom(moves);
};
