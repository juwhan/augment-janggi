import type { GameState, Move } from '../game/types';

/**
 * 모든 봇의 공통 모양: 상태를 받아서 둘 수 하나를 돌려준다.
 * 둘 수 있는 수가 없으면 null.
 *
 * 화면은 난이도가 뭔지 몰라도 이 함수를 부르기만 하면 된다.
 * 그래서 난이도를 추가해도 화면 코드는 고칠 필요가 없다.
 */
export type Bot = (state: GameState) => Move | null;
