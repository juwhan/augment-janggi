// ───────────────────────────────────────────────
// 수 적용하기
// getLegalMoves가 "둘 수 있는 수 목록"을 만든다면,
// applyMove는 그중 하나를 골랐을 때 판을 실제로 바꾼다.
// ───────────────────────────────────────────────
import { opponent } from './board';
import type { GameState, Move } from './types';

/**
 * 수 하나를 적용한 "새" 상태를 돌려준다.
 *
 * 원래 state는 절대 고치지 않는다. 이유는 두 가지:
 * 1. React는 "새 객체"를 받아야 화면이 바뀐 걸 알아챈다.
 *    원본을 고친 뒤 같은 객체를 넘기면 바뀐 게 없다고 보고 화면을 다시 그리지 않는다.
 * 2. 봇(미니맥스)은 수많은 수를 "머릿속으로" 시험해본다.
 *    시험할 때마다 진짜 판이 바뀌면 안 되니까, 항상 복사본을 만들어서 쓴다.
 *
 * 주의: 이 함수는 move가 규칙상 가능한지 검사하지 않는다.
 *       getLegalMoves에서 나온 수만 넣는다고 가정한다.
 */
export function applyMove(state: GameState, move: Move): GameState {
    // 이미 끝난 게임이면 아무것도 바꾸지 않는다.
    if (state.winner !== null) return state;

    // 1. 판 복사하기
    //    state.board.map(...)은 각 행을 돌면서 새 배열을 만든다.
    //    [...row]는 그 행을 통째로 복사한 새 배열이다. (C로 치면 memcpy로 행마다 복사)
    //    그냥 const board = state.board 라고 쓰면 복사가 아니라 "같은 판을 가리키는 것"이라
    //    아래에서 고치는 순간 원본도 같이 바뀐다.
    const board = state.board.map((row) => [...row]);

    // 2. 움직일 말과, 도착 칸에 원래 있던 말(잡힐 말)을 꺼내둔다.
    const piece = board[move.from.row][move.from.col];
    const captured = board[move.to.row][move.to.col]; // 빈 칸이면 null

    // 3. 말 옮기기
    //    도착 칸에 덮어쓰면 원래 있던 상대 말은 판에서 사라진다. 이게 "잡기"다.
    board[move.to.row][move.to.col] = piece;
    board[move.from.row][move.from.col] = null;

    // 4. 승패 판정
    //    우리 게임은 외통 대신 "궁을 잡으면 승리"다.
    //    잡힌 말이 궁이면, 지금 둔 쪽(state.turn)이 이긴다.
    const winner = captured !== null && captured.type === 'general' ? state.turn : null;

    // 5. 새 상태 만들어서 돌려주기
    return {
        board,
        turn: opponent(state.turn),      // 차례 넘기기 (초 → 한, 한 → 초)
        moveCount: state.moveCount + 1,  // 둔 수 +1 (나중에 증강 드래프트 타이밍에 쓴다)
        winner,
    };
}
