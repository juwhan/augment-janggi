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

/**
 * 한 수.
 * - 보통 이동: from에서 to로 말을 옮긴다.
 * - 액티브 증강 사용: augment에 증강 id가 들어간다. from/to의 뜻은 증강마다 다르다.
 *   (예: 저격은 from = to = 노리는 상대 말 위치, 자리 바꾸기는 from과 to = 바꿀 두 말 위치)
 * - 넘기기: 추가 이동(연속 행동, 돌격졸 등)을 쓰지 않고 차례를 넘길 때. pass가 true.
 */
export interface Move {
    from: Position;
    to: Position;
    augment?: AugmentId;
    /** 부활처럼 "어떤 종류의 말을" 고르는 증강에서 쓴다 */
    pieceType?: PieceType;
    pass?: boolean;
}

/** 일정 시간 동안 이어지는 효과 (빙결, 수호) */
export interface TimedEffect {
    kind: 'freeze' | 'protect';
    pieceId: string;
    /** moveCount가 이 값이 되면 효과가 끝난다 */
    until: number;
}

/** 판 위에 설치된 함정 */
export interface Trap {
    owner: Team;
    pos: Position;
}

/**
 * 추가 이동 (차례를 넘기지 않고 한 번 더 두는 상태).
 * 연속 행동, 시간 정지, 돌격졸이 만든다.
 */
export interface BonusMove {
    /** 움직일 수 있는 말의 id. null이면 내 말 아무거나 */
    pieceId: string | null;
    /** 상대 말을 잡을 수 있는지 */
    canCapture: boolean;
    /** 궁을 잡을 수 있는지 */
    canCaptureGeneral: boolean;
}

/**
 * 증강 id. 실제 목록은 src/augments/registry.ts에 있다.
 * 여기서는 그냥 문자열로 둔다. (game 폴더가 augments 폴더를 몰라도 되도록)
 */
export type AugmentId = string;

/** 게임 전체 상태. getLegalMoves / applyMove / evaluate 가 이걸 주고받는다. */
export interface GameState {
    board: Board;
    /** 지금 둘 차례인 진영 */
    turn: Team;
    /** 지금까지 넘어간 차례 수 (추가 이동은 세지 않는다) */
    moveCount: number;
    /** 승자. 아직 안 끝났으면 null */
    winner: Team | null;
    /** 무승부로 끝났는지 */
    isDraw: boolean;

    // ── 증강 ──
    /** 진영별로 가진 증강 */
    augments: Record<Team, AugmentId[]>;
    /** 지금까지 끝난 드래프트 수 (0: 아직 없음, 1: 초반 끝, 2: 중반 끝, 3: 종반 끝) */
    draftsDone: number;
    /** 잡힌 주요 기물(차·포·마·상) 수, 양 진영 합계. 중반/종반 드래프트 타이밍에 쓴다 */
    majorCaptured: number;

    /** 진영별로 이미 쓴 액티브 증강 (한 판에 한 번만 쓸 수 있다) */
    usedAugments: Record<Team, AugmentId[]>;
    /** 진영별로 잃은 말 종류 (병력 보충, 부활에 쓴다) */
    captured: Record<Team, PieceType[]>;
    /** 이어지는 효과 (빙결, 수호) */
    effects: TimedEffect[];
    /** 설치된 함정 */
    traps: Trap[];
    /** 발동 대기 중인 증강 (연속 행동, 시간 정지: 다음 수를 둔 뒤 추가 이동이 생긴다) */
    armed: AugmentId | null;
    /** 지금 추가 이동 중이면 그 조건. 아니면 null */
    bonus: BonusMove | null;

    // ── 무승부 판정 ──
    /** 마지막으로 말이 잡힌 뒤 둔 수 (양쪽 합계). 100이 되면(각자 50수) 무승부 */
    quietMoves: number;
    /** 판 모양별로 몇 번 나왔는지. 같은 판이 3번 나오면 무승부 */
    positionCounts: Record<string, number>;
}

export const ROWS = 10;
export const COLS = 9;
