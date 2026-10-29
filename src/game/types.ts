// ───────────────────────────────────────────────
// 증강 장기 - 기본 타입 정의
// 게임의 "상태"를 어떻게 표현할지 정하는 파일이다.
// 화면(React)과 무관한 순수 데이터 구조만 둔다.
// ───────────────────────────────────────────────

/** 진영. 초(cho)가 먼저 둔다. */
export type Team = 'cho' | 'han';

/** 말 종류 (7종) */
export type PieceType =
    | 'general'  // 궁(將/帥)
    | 'guard'    // 사(士)
    | 'elephant' // 상(象)
    | 'horse'    // 마(馬)
    | 'chariot'  // 차(車)
    | 'cannon'   // 포(包)
    | 'soldier'; // 졸(卒)/병(兵)

/** 판 위의 말 하나 */
export interface Piece {
    type: PieceType;
    team: Team;
    /** 말마다 고유한 id. 나중에 증강이 "이 말"에 붙을 때 필요하다. 예: 'cho-horse-1' */
    id: string;
}

/** 칸 하나: 말이 있거나(Piece) 비어 있다(null) */
export type Cell = Piece | null;

/**
 * 장기판: 10행 x 9열 2차원 배열.
 * board[row][col] 로 접근한다.
 * row 0 = 위쪽(한 진영), row 9 = 아래쪽(초 진영)
 * col 0 = 왼쪽, col 8 = 오른쪽
 */
export type Board = Cell[][];

/** 판 위의 좌표 */
export interface Position {
    row: number;
    col: number;
}

/** 한 수 (지금은 이동만. 나중에 '증강 사용'도 여기에 추가된다) */
export interface Move {
    from: Position;
    to: Position;
}

/** 게임 전체 상태. getLegalMoves / applyMove / evaluate 가 이걸 주고받는다. */
export interface GameState {
    board: Board;
    /** 지금 둘 차례인 진영 */
    turn: Team;
    /** 지금까지 둔 수의 개수 (드래프트 타이밍 계산용) */
    moveCount: number;
    /** 승자. 아직 안 끝났으면 null */
    winner: Team | null;
}

export const ROWS = 10;
export const COLS = 9;
