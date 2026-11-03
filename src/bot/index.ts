import { greedyBot } from './greedy';
import { randomBot } from './random';
import { createMinimaxBot } from './minimax';
import { createAlphaBetaBot } from './alphabeta';
import { evaluate } from './evaluate';
import { evaluatePositional } from './positional';
import type { Bot } from './types';

/** 난이도 정보 */
export interface BotLevel {
    level: number;
    name: string;
    description: string;
    bot: Bot | null; // 아직 안 만든 난이도는 null
}

/**
 * 난이도 번호 → 봇 연결표.
 * 새 난이도를 만들면 여기 bot 칸만 채우면 시작 화면에 자동으로 열린다.
 */
export const BOT_LEVELS: BotLevel[] = [
    { level: 1, name: '입문', description: '아무 수나 둬요', bot: randomBot },
    { level: 2, name: '초급', description: '눈앞의 말만 잡아요', bot: greedyBot },
    // 3단계: 미니맥스 깊이 2 = 내 수 + 상대의 응수까지 본다
    { level: 3, name: '중급', description: '상대의 응수까지 봐요', bot: createMinimaxBot(2) },
    // 4단계: 알파베타 깊이 3 + 정지 탐색(잡고 잡히는 수는 끝까지)
    { level: 4, name: '고급', description: '주고받기를 끝까지 계산해요', bot: createAlphaBetaBot(3, evaluate, 3000) },
    // 5단계: 시간(1.5초)이 허락하는 만큼 깊게(최대 6수) + 정지 탐색 + 위치 점수
    { level: 5, name: '고수', description: '깊게 읽고 자리까지 따져요', bot: createAlphaBetaBot(6, evaluatePositional, 1500) },
];

export type { Bot } from './types';
