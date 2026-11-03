import { ROWS, COLS } from '../game/types';
import type { GameState, Team } from '../game/types';
import { PIECE_VALUE } from './values';
import { getPiece} from '../game/board';

/**
 * 판 점수 매기기.
 * team 입장에서 얼마나 유리한지를 숫자로 돌려준다.
 * - 양수: team이 유리
 * - 음수: team이 불리
 * - 0: 비슷함
 *
 * 지금은 가장 단순한 방식: (내 말 점수 합) - (상대 말 점수 합)
 */
export function evaluate(state: GameState, team: Team): number {
    let score = 0;

    for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
            // TODO 1: 이 칸의 말을 꺼낸다.
            const piece = getPiece(state.board,{row,col});

            // TODO 2: 빈 칸이면 건너뛴다.
            if(piece===null){
                continue
            }

            // TODO 3: 그 말의 점수(PIECE_VALUE)를
            //         내 말(team과 같은 진영)이면 score에 더하고,
            //         상대 말이면 score에서 뺀다.
            if(piece.team===team){
                score+=PIECE_VALUE[piece.type];
            }
            else{
                score-=PIECE_VALUE[piece.type];
            }
        }
    }

    return score;
}