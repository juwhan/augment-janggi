import type { PieceType } from '../game/types';

/**
 * 말의 가치(점수).
 * 2단계 봇이 "어떤 말을 잡을지" 고를 때, 3단계부터는 판 점수를 매길 때 쓴다.
 * 궁은 잡히면 게임이 끝나니까 사실상 무한대지만, 계산 편의상 아주 큰 수로 둔다.
 */
export const PIECE_VALUE: Record<PieceType, number> = {
    general: 1000,
    chariot: 13,
    cannon: 7,
    horse: 5,
    elephant: 3,
    guard: 3,
    soldier: 2,
};
