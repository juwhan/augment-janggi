// ───────────────────────────────────────────────
// 봇 전용 백그라운드 작업자 (Web Worker)
//
// 브라우저는 화면 그리기와 자바스크립트 계산을 같은 줄(메인 스레드)에서 처리한다.
// 그래서 봇이 1~2초 계산하는 동안 화면이 얼어붙는다. (버튼도 안 눌리고, "생각 중" 글자도 안 바뀜)
// Web Worker는 별도의 줄에서 계산하게 해줘서, 봇이 오래 생각해도 화면은 멀쩡하다.
//
// 대화 방식: 화면(Game.tsx)이 메시지로 "이 상태에서 N단계 봇의 수를 알려줘"라고 보내면,
//           여기서 계산해서 답장을 보낸다. 서로의 변수는 직접 볼 수 없고 메시지만 주고받는다.
// ───────────────────────────────────────────────
import { BOT_LEVELS } from './index';
import type { GameState, Move } from '../game/types';

/** 화면 → 작업자 */
export interface BotRequest {
    id: number;        // 요청 번호. 답장이 어느 요청에 대한 것인지 구분한다.
    level: number;
    state: GameState;
}

/** 작업자 → 화면 */
export interface BotResponse {
    id: number;
    move: Move | null;
}

self.onmessage = (event: MessageEvent<BotRequest>) => {
    const { id, level, state } = event.data;
    const bot = BOT_LEVELS.find((l) => l.level === level)?.bot;
    const move = bot ? bot(state) : null;
    const response: BotResponse = { id, move };
    self.postMessage(response);
};
