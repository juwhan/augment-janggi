// ───────────────────────────────────────────────
// 위치 점수 (5단계 전용)
// 말 점수만으로는 "같은 말이라도 어디 있느냐"를 구분하지 못한다.
// 그래서 좋은 자리에 있는 말에 작은 가산점을 준다.
// 말 점수(졸 2 ~ 차 13)보다 훨씬 작게 둬서, 말을 잃으면서까지 자리를 탐내지는 않게 한다.
// ───────────────────────────────────────────────
import { ROWS, COLS } from '../game/types';
import type { GameState, Piece, Team } from '../game/types';
import { evaluate } from './evaluate';

/** 말 하나의 위치 보너스 */
function positionBonus(piece: Piece, row: number, col: number): number {
    // 진영마다 "앞"이 반대라서, 몇 줄이나 전진했는지를 진영 기준으로 센다.
    // 초는 아래(9행)에서 위로, 한은 위(0행)에서 아래로 나아간다.
    const advanced = piece.team === 'cho' ? 9 - row : row;

    switch (piece.type) {
        case 'soldier': {
            // 졸은 시작 위치(3줄 전진한 곳)보다 앞으로 나갈수록 위협적이다.
            let bonus = Math.max(0, advanced - 3) * 0.2;
            // 상대 궁성(가운데 3열, 상대 쪽 3줄) 안에 들어가면 궁을 직접 위협한다.
            if (advanced >= 7 && col >= 3 && col <= 5) bonus += 0.5;
            return bonus;
        }
        case 'horse':
        case 'elephant':
            // 마와 상은 맨 뒷줄에 머물러 있으면 아직 "개발"이 안 된 것이다.
            return advanced > 0 ? 0.3 : 0;
        case 'chariot':
            // 차는 강을 건너 상대 진영에 들어가면 활동 범위가 넓어진다.
            return advanced >= 5 ? 0.4 : 0;
        case 'cannon':
            // 포는 가운데 줄(4열)에 있으면 상대 궁을 노리기 좋다.
            return col === 4 ? 0.3 : 0;
        default:
            return 0;
    }
}

/**
 * 5단계용 평가 함수: 말 점수(evaluate) + 위치 점수
 * team 입장 점수다. 내 말의 보너스는 더하고 상대 말의 보너스는 뺀다.
 */
export function evaluatePositional(state: GameState, team: Team): number {
    let score = evaluate(state, team);

    for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
            const piece = state.board[row][col];
            if (piece === null) continue;
            const bonus = positionBonus(piece, row, col);
            score += piece.team === team ? bonus : -bonus;
        }
    }
    return score;
}
