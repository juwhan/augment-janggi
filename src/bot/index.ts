import { greedyBot } from './greedy';
import { randomBot } from './random';
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
    { level: 3, name: '중급', description: '한 수 앞을 봐요', bot: null },
    { level: 4, name: '고급', description: '몇 수 앞을 계산해요', bot: null },
    { level: 5, name: '고수', description: '위치까지 따져요', bot: null },
];

export type { Bot } from './types';
