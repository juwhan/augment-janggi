// ───────────────────────────────────────────────
// 수 적용하기
// getLegalMoves가 "둘 수 있는 수 목록"을 만든다면,
// applyMove는 그중 하나를 골랐을 때 판을 실제로 바꾼다.
// ───────────────────────────────────────────────
import { inBounds, isInPalace, opponent, positionKey } from './board';
import { getLegalMoves } from './moves';
import { AUG } from './augmentIds';
import type { GameState, Move, Piece, PieceType } from './types';

/** 주요 기물: 잡힌 개수로 중반/종반 드래프트 시점을 정한다 */
const MAJOR_PIECES: PieceType[] = ['chariot', 'cannon', 'horse', 'elephant'];
const isMajor = (p: Piece) => MAJOR_PIECES.includes(p.type);

/** 잡지 않고 이만큼 두면 무승부 (양쪽 합계 100수 = 각자 50수) */
const QUIET_MOVE_LIMIT = 100;

/** 같은 판이 이만큼 나오면 무승부 */
const REPETITION_LIMIT = 3;

/**
 * 수 하나를 적용한 "새" 상태를 돌려준다.
 *
 * 원래 state는 절대 고치지 않는다. 이유는 두 가지:
 * 1. React는 "새 객체"를 받아야 화면이 바뀐 걸 알아챈다.
 * 2. 봇(미니맥스)은 수많은 수를 "머릿속으로" 시험해본다.
 *    시험할 때마다 진짜 판이 바뀌면 안 되니까, 항상 복사본을 만들어서 쓴다.
 *
 * 주의: 이 함수는 move가 규칙상 가능한지 검사하지 않는다.
 *       getLegalMoves에서 나온 수만 넣는다고 가정한다.
 *
 * isRealMove: 실제 대국에서 둔 수인지 (기본값 true)
 *   true면 비싼 검사 두 가지를 추가로 한다.
 *   - 상대가 둘 수 있는 수가 없으면 패배 (상대의 모든 수를 한 번 더 계산)
 *   - 같은 판 3번 반복이면 무승부 (판 기록을 복사)
 *   봇은 탐색 중에 이 함수를 수십만 번 부르니까 false로 끄고,
 *   "둘 수 없음"은 탐색 안에서 직접 처리한다.
 */
export function applyMove(state: GameState, move: Move, isRealMove = true): GameState {
    // 이미 끝난 게임이면 아무것도 바꾸지 않는다.
    if (state.winner !== null || state.isDraw) return state;

    // 1. 판 복사하기 (행마다 새 배열을 만든다)
    const board = state.board.map((row) => [...row]);

    // 2. 움직일 말과, 도착 칸에 원래 있던 말(잡힐 말)을 꺼내둔다.
    const piece = board[move.from.row][move.from.col]!;
    const captured = board[move.to.row][move.to.col]; // 빈 칸이면 null
    const mover = state.turn;
    const myAugs = state.augments[mover];

    // 3. 말 옮기기. 도착 칸에 덮어쓰면 원래 있던 상대 말은 판에서 사라진다. 이게 "잡기"다.
    board[move.to.row][move.to.col] = piece;
    board[move.from.row][move.from.col] = null;

    // 이번 수로 판에서 사라진 말들 (잡힘 + 증강 효과). 주요 기물 수와 무승부 판정에 쓴다.
    const removed: Piece[] = [];
    if (captured) removed.push(captured);

    // 4. [증강] 수를 둔 뒤 일어나는 효과
    // 4-1. 반격: 상대의 차를 잡으면, 잡은 내 말도 함께 사라진다 (궁은 예외)
    if (captured && captured.type === 'chariot' && piece.type !== 'general'
        && state.augments[captured.team].includes(AUG.REVENGE)) {
        board[move.to.row][move.to.col] = null;
        removed.push(piece);
    }

    // 4-2. 폭렬포: 잡지 않고 이동한 포 주변 상하좌우 4칸의 말을 피아 구분 없이 제거
    //      궁성 안 칸은 피해가 없고, 궁은 어디서든 폭발로 잡히지 않는다.
    if (piece.type === 'cannon' && captured === null && myAugs.includes(AUG.BLAST_CANNON)) {
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const pos = { row: move.to.row + dr, col: move.to.col + dc };
            if (!inBounds(pos) || isInPalace(pos)) continue;
            const target = board[pos.row][pos.col];
            if (target === null || target.type === 'general') continue;
            board[pos.row][pos.col] = null;
            removed.push(target);
        }
    }

    // 5. 승패 판정
    //    우리 게임은 외통 대신 "궁을 잡으면 승리"다.
    let winner = captured !== null && captured.type === 'general' ? mover : null;

    // 5-1. [증강] 진군 승리: 내 졸이 상대 맨 끝 줄에 도착하면 승리
    if (winner === null && piece.type === 'soldier' && myAugs.includes(AUG.MARCH_VICTORY)
        && board[move.to.row][move.to.col] === piece) {
        const lastRow = mover === 'cho' ? 0 : 9;
        if (move.to.row === lastRow) winner = mover;
    }

    // 6. 새 상태 만들기
    const next: GameState = {
        ...state,                                    // 증강, 드래프트 기록 등은 그대로 이어받는다
        board,
        turn: opponent(mover),                       // 차례 넘기기 (초 → 한, 한 → 초)
        moveCount: state.moveCount + 1,
        winner,
        majorCaptured: state.majorCaptured + removed.filter(isMajor).length,
        // 말이 하나라도 사라졌으면 0으로, 아니면 1 증가
        quietMoves: removed.length > 0 ? 0 : state.quietMoves + 1,
    };

    // 7. 무승부 판정 1: 잡지 않고 각자 50수
    if (next.winner === null && next.quietMoves >= QUIET_MOVE_LIMIT) {
        next.isDraw = true;
    }

    if (isRealMove && next.winner === null && !next.isDraw) {
        // 8. 무승부 판정 2: 같은 판이 3번 나오면 무승부
        //    기록을 복사해서 이번 판의 횟수를 1 늘린다.
        const key = positionKey(next);
        next.positionCounts = { ...state.positionCounts, [key]: (state.positionCounts[key] ?? 0) + 1 };
        if (next.positionCounts[key] >= REPETITION_LIMIT) next.isDraw = true;

        // 9. 상대가 둘 수 있는 수가 하나도 없으면, 지금 둔 쪽이 이긴다.
        if (!next.isDraw && getLegalMoves(next).length === 0) {
            next.winner = mover;
        }
    }

    return next;
}
