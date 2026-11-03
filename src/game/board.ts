// ───────────────────────────────────────────────
// 장기판 생성과 기본 도우미 함수
// ───────────────────────────────────────────────
import { COLS, ROWS } from './types';
import type { Board, GameState, Piece, PieceType, Position, Team } from './types';

/** 빈 판 만들기 */
export function createEmptyBoard(): Board {
    return Array.from({ length: ROWS }, () => Array<Piece | null>(COLS).fill(null));
}

/**
 * 맨 뒷줄 배치 (왼쪽 → 오른쪽).
 * 실제 장기에서는 양쪽 마/상 위치를 4가지(마상마상, 상마상마 등)로 고를 수 있는데,
 * 지금은 '마상' 배치 하나로 고정하고 나중에 선택 기능을 붙인다.
 */
const BACK_RANK: (PieceType | null)[] = [
    'chariot', 'horse', 'elephant', 'guard', null, 'guard', 'elephant', 'horse', 'chariot',
];

/** 게임 시작 상태 만들기 */
export function createInitialState(): GameState {
    const board = createEmptyBoard();
    const counter: Record<string, number> = {};

    // 같은 종류 말에 번호를 붙여 고유 id를 만든다. (cho-horse-1, cho-horse-2 ...)
    const place = (team: Team, type: PieceType, row: number, col: number) => {
        const key = `${team}-${type}`;
        counter[key] = (counter[key] ?? 0) + 1;
        board[row][col] = { team, type, id: `${key}-${counter[key]}` };
    };

    // 한(han)은 위쪽(row 0~3), 초(cho)는 아래쪽(row 6~9)에 대칭으로 놓는다.
    const setup = (team: Team, backRow: number, generalRow: number, cannonRow: number, soldierRow: number) => {
        BACK_RANK.forEach((type, col) => {
            if (type) place(team, type, backRow, col);
        });
        place(team, 'general', generalRow, 4);
        place(team, 'cannon', cannonRow, 1);
        place(team, 'cannon', cannonRow, 7);
        for (const col of [0, 2, 4, 6, 8]) place(team, 'soldier', soldierRow, col);
    };

    setup('han', 0, 1, 2, 3);
    setup('cho', 9, 8, 7, 6);

    const state: GameState = {
        board,
        turn: 'cho',
        moveCount: 0,
        winner: null,
        isDraw: false,
        augments: { cho: [], han: [] },
        draftsDone: 0,
        majorCaptured: 0,
        quietMoves: 0,
        positionCounts: {},
    };
    // 시작 판도 "한 번 나온 판"으로 기록해둔다 (반복 무승부 판정용)
    state.positionCounts[positionKey(state)] = 1;
    return state;
}

/**
 * 판 모양을 문자열 하나로 만든다. 같은 판이면 같은 문자열이 나온다.
 * 반복 무승부 판정에 쓴다. 차례도 포함한다. (같은 배치라도 누구 차례냐에 따라 다른 판이다)
 */
export function positionKey(state: GameState): string {
    let key = state.turn;
    for (const row of state.board) {
        for (const p of row) {
            key += p ? (p.team === 'cho' ? 'c' : 'h') + p.type[0] + p.type[1] : '.';
        }
    }
    return key;
}

/**
 * 플레이어 기준 행 번호(1~10) → 코드의 행 번호(0~9).
 * 플레이어 기준: 1~5행이 상대 진영, 6~10행이 내 진영, 10행이 내 맨 뒷줄.
 * 초는 아래쪽(코드 9행)이 맨 뒷줄, 한은 위쪽(코드 0행)이 맨 뒷줄이라 계산이 반대다.
 */
export function toBoardRow(team: Team, playerRow: number): number {
    return team === 'cho' ? playerRow - 1 : ROWS - playerRow;
}

/** 좌표가 판 안에 있는지 */
export function inBounds({ row, col }: Position): boolean {
    return row >= 0 && row < ROWS && col >= 0 && col < COLS;
}

/** 해당 좌표의 말 (판 밖이면 null) */
export function getPiece(board: Board, pos: Position): Piece | null {
    return inBounds(pos) ? board[pos.row][pos.col] : null;
}

/**
 * 궁성 안인지 확인.
 * 궁성 = 가운데 3열(col 3~5) x 위/아래 각 3행.
 * 궁과 사는 궁성 밖으로 못 나가고, 궁성 안에서는 대각선 이동이 생긴다.
 */
export function isInPalace({ row, col }: Position): boolean {
    const inCols = col >= 3 && col <= 5;
    const inRows = (row >= 0 && row <= 2) || (row >= 7 && row <= 9);
    return inCols && inRows;
}

/** 상대 진영 */
export function opponent(team: Team): Team {
    return team === 'cho' ? 'han' : 'cho';
}

/** 화면/디버깅용 한자 표시 */
export const PIECE_LABEL: Record<Team, Record<PieceType, string>> = {
    cho: { general: '楚', guard: '士', elephant: '象', horse: '馬', chariot: '車', cannon: '包', soldier: '卒' },
    han: { general: '漢', guard: '士', elephant: '象', horse: '馬', chariot: '車', cannon: '包', soldier: '兵' },
};

/** 콘솔에서 판을 확인하기 위한 문자열 출력 */
export function boardToString(board: Board): string {
    return board
        .map((row) => row.map((p) => (p ? PIECE_LABEL[p.team][p.type] : '·')).join(' '))
        .join('\n');
}
