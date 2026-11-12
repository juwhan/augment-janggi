// ───────────────────────────────────────────────
// 증강 목록 (등록표)
//
// 증강 하나 = 이름, 설명, 단계, 유형 + (즉시형이면) 고르는 순간 판을 바꾸는 함수.
// 이동이 바뀌는 증강(패시브)은 game/moves.ts의 "[증강]" 구역에서,
// 수를 둔 뒤 일어나는 효과(발동형)는 game/apply.ts의 "[증강]" 구역에서 처리한다.
// 새 증강을 만들면: 1) game/augmentIds.ts에 id 추가 2) 여기 등록 3) 규칙 코드에 효과 추가
// ───────────────────────────────────────────────
import { AUG } from '../game/augmentIds';
import { toBoardRow } from '../game/board';
import type { AugmentId, Board, GameState, PieceType, Team } from '../game/types';

/** 드래프트 단계 */
export type AugmentPhase = 'opening' | 'middle' | 'end';

/** 증강 유형 (화면 표시용) */
/**
 * 증강 유형 (카드에 표시된다)
 * - 시작 시 적용: 고르는 순간 판이 바뀐다
 * - 항상 적용: 고른 뒤 계속 효과가 있다
 * - 조건 발동: 정해진 상황이 되면 저절로 효과가 생긴다
 * - 한 번 사용: 원하는 내 차례에 "사용" 버튼을 눌러 한 판에 한 번 쓴다
 * - 승리 조건: 궁을 잡는 것 말고 이기는 방법이 하나 더 생긴다
 */
export type AugmentKind = '시작 시 적용' | '항상 적용' | '조건 발동' | '한 번 사용' | '승리 조건';

export interface AugmentDef {
    id: AugmentId;
    name: string;
    description: string;
    phase: AugmentPhase;
    kind: AugmentKind;
    /**
     * 봇이 드래프트에서 고를 때 쓰는 점수 (높을수록 좋다고 판단).
     * 대략 "말 몇 점 정도의 가치인가"로 매겼다. 밸런스를 보며 조정한다.
     */
    botValue: number;
    /**
     * 시작 시 적용: 고르는 순간 내 진영의 판을 바꾼다 (board는 이미 복사본이라 직접 고쳐도 된다)
     * choice: 선택지가 있는 증강(자유 상차림)에서 고른 선택지 번호
     */
    onPick?: (board: Board, team: Team, choice: number) => void;
    /** 고른 뒤 한 번 더 고르는 선택지 (예: 자유 상차림의 배치 4가지). 없으면 바로 적용 */
    choices?: string[];
}

/** 드래프트에서 한 사람이 고른 것: 증강 + (선택지가 있으면) 선택지 번호 */
export interface DraftPick {
    id: AugmentId;
    choice: number;
}

// ── 판 바꾸기 도우미 ──
// 모두 "플레이어 기준 행 번호(1~10)"로 받는다. 10행이 내 맨 뒷줄이다.

/** 내 말을 플레이어 기준 (행, 열)에서 (행, 열)로 옮긴다 (원래 자리에 그 말이 있고 도착 칸이 비었을 때만) */
function shift(board: Board, team: Team, type: PieceType, fromRow: number, toRow: number, col: number) {
    const r1 = toBoardRow(team, fromRow);
    const r2 = toBoardRow(team, toRow);
    const piece = board[r1][col];
    if (piece && piece.team === team && piece.type === type && board[r2][col] === null) {
        board[r2][col] = piece;
        board[r1][col] = null;
    }
}

/** 빈 칸이면 새 말을 놓는다. id는 겹치지 않게 증강 이름과 위치를 붙여 만든다 */
function place(board: Board, team: Team, type: PieceType, playerRow: number, col: number, tag: string) {
    const r = toBoardRow(team, playerRow);
    if (board[r][col] === null) {
        board[r][col] = { team, type, id: `${team}-${tag}-${playerRow}-${col}` };
    }
}

/**
 * 자유 상차림의 배치 4가지.
 * 내 쪽에서 바라본 맨 뒷줄의 왼쪽 두 칸(2·3번째 칸)과 오른쪽 두 칸(7·8번째 칸)에 놓을 말.
 */
const SETUPS: { label: string; left: [PieceType, PieceType]; right: [PieceType, PieceType] }[] = [
    { label: '마상 · 상마 (기본)', left: ['horse', 'elephant'], right: ['elephant', 'horse'] },
    { label: '상마 · 마상', left: ['elephant', 'horse'], right: ['horse', 'elephant'] },
    { label: '마상 · 마상', left: ['horse', 'elephant'], right: ['horse', 'elephant'] },
    { label: '상마 · 상마', left: ['elephant', 'horse'], right: ['elephant', 'horse'] },
];

/** 내 쪽에서 본 열 번호(0~8, 왼쪽부터) → 코드의 열 번호. 한은 판 반대편에 앉아 있어서 좌우가 뒤집힌다 */
const toBoardCol = (team: Team, playerCol: number) => (team === 'cho' ? playerCol : 8 - playerCol);

export const AUGMENTS: AugmentDef[] = [
    // ─────────── 초반 ───────────
    {
        id: AUG.PAWN_ADVANCE, name: '졸 전진', phase: 'opening', kind: '시작 시 적용', botValue: 1,
        description: '가운데 졸 3개가 한 칸 앞으로 나간 자리에서 시작한다',
        onPick: (board, team) => {
            for (const col of [2, 4, 6]) shift(board, team, 'soldier', 7, 6, col);
        },
    },
    {
        id: AUG.VANGUARD_CHARIOT, name: '선봉 차', phase: 'opening', kind: '시작 시 적용', botValue: 1.5,
        description: '양쪽 끝의 내 차 2개가 한 칸 앞으로 나간 자리에서 시작한다',
        onPick: (board, team) => {
            for (const col of [0, 8]) shift(board, team, 'chariot', 10, 9, col);
        },
    },
    {
        id: AUG.SPARE_CANNON, name: '예비 포', phase: 'opening', kind: '시작 시 적용', botValue: 7,
        description: '내 궁 바로 뒤의 빈 칸(맨 뒷줄 가운데)에 포를 하나 더 놓고 시작한다',
        onPick: (board, team) => place(board, team, 'cannon', 10, 4, 'spare'),
    },
    {
        id: AUG.SPARE_SOLDIER, name: '예비 졸', phase: 'opening', kind: '시작 시 적용', botValue: 2,
        description: '내 궁성 바로 앞 가운데 빈 칸에 졸을 하나 더 놓고 시작한다',
        onPick: (board, team) => place(board, team, 'soldier', 8, 4, 'spare'),
    },
    {
        id: AUG.SOLDIER_ARMY, name: '졸 대군', phase: 'opening', kind: '시작 시 적용', botValue: 0,
        description: '궁만 남기고 내 말을 모두 없앤 뒤, 내 진영 전체(6~10행)에 졸 23개를 한 칸씩 띄운 체크무늬로 놓는다',
        onPick: (board, team) => {
            // 1. 궁을 뺀 내 말을 모두 치운다
            for (const row of board) {
                for (let c = 0; c < row.length; c++) {
                    const p = row[c];
                    if (p && p.team === team && p.type !== 'general') row[c] = null;
                }
            }
            // 2. 6~10행에 체크무늬로 졸을 놓는다.
            //    10·8·6행은 0,2,4,6,8열, 9·7행은 1,3,5,7열 (9행 가운데는 궁 자리라 비어 있다)
            for (let playerRow = 6; playerRow <= 10; playerRow++) {
                const startCol = playerRow % 2 === 0 ? 0 : 1;
                for (let col = startCol; col < 9; col += 2) place(board, team, 'soldier', playerRow, col, 'army');
            }
        },
    },
    {
        id: AUG.FREE_SETUP, name: '자유 상차림', phase: 'opening', kind: '시작 시 적용', botValue: 0.5,
        description: '게임 시작 전에 내 마와 상의 위치를 4가지 배치 중 하나로 다시 고른다',
        choices: SETUPS.map((s) => s.label),
        onPick: (board, team, choice) => {
            const setup = SETUPS[choice] ?? SETUPS[0];
            const row = toBoardRow(team, 10);
            const slots: [number, PieceType][] = [
                [1, setup.left[0]], [2, setup.left[1]], [6, setup.right[0]], [7, setup.right[1]],
            ];
            // 그 자리에 있는 내 마·상만 종류를 바꾼다 (졸 대군 등으로 이미 비어 있으면 건드리지 않는다)
            for (const [playerCol, type] of slots) {
                const col = toBoardCol(team, playerCol);
                const p = board[row][col];
                if (p && p.team === team && (p.type === 'horse' || p.type === 'elephant')) {
                    board[row][col] = { ...p, type };
                }
            }
        },
    },
    {
        id: AUG.NIMBLE_ELEPHANT, name: '날랜 상', phase: 'opening', kind: '항상 적용', botValue: 1.5,
        description: '원래 상은 지나가는 두 칸 중 하나라도 막히면 못 가지만, 내 상은 첫 번째 칸이 막혀 있어도 이동할 수 있다 (두 번째 칸은 비어 있어야 함)',
    },
    {
        id: AUG.ROYAL_GUARD, name: '근위대', phase: 'opening', kind: '항상 적용', botValue: 1,
        description: '원래 사는 궁성(궁이 있는 3×3 구역) 안에서만 움직이지만, 내 사는 궁성 바로 바깥의 한 칸까지 나갈 수 있다',
    },
    {
        id: AUG.GENERAL_SPIRIT, name: '장수의 기백', phase: 'opening', kind: '항상 적용', botValue: 1,
        description: '내 궁이 궁성 안에서 차처럼 한 방향으로 여러 칸을 이동할 수 있다 (궁성 밖으로는 못 나감)',
    },
    {
        id: AUG.IRON_PALACE, name: '철벽 궁성', phase: 'opening', kind: '항상 적용', botValue: 1.5,
        description: '내 궁성 안에 있는 내 말은 상대 포에게 잡히지 않는다',
    },
    {
        id: AUG.MOBILE_SOLDIER, name: '기동졸', phase: 'opening', kind: '항상 적용', botValue: 1,
        description: '아직 처음 줄(7행)에 있는 내 졸은 앞으로 두 칸 이동할 수 있다 (바로 앞 칸이 비어 있어야 함)',
    },
    {
        id: AUG.CANNON_BRIDGE, name: '포의 다리', phase: 'opening', kind: '항상 적용', botValue: 2,
        description: '원래 포는 다른 포를 뛰어넘을 수 없지만, 내 포는 포도 뛰어넘을 수 있다. 포를 잡는 것은 여전히 안 된다',
    },
    {
        id: AUG.ARMORED_HORSE, name: '철갑마', phase: 'opening', kind: '항상 적용', botValue: 3,
        description: '원래 마는 처음 한 칸 가는 길에 다른 말이 있으면 못 가지만, 내 마는 그 길이 막혀 있어도 이동할 수 있다',
    },

    // ─────────── 중반 ───────────
    {
        id: AUG.SWIFT_HORSE, name: '질주마', phase: 'middle', kind: '항상 적용', botValue: 2,
        description: '내 마는 원래 이동 외에 앞뒤좌우로 곧장 두 칸도 갈 수 있다 (바로 앞 칸은 비어 있어야 함)',
    },
    {
        id: AUG.WIDE_ELEPHANT, name: '넓은 상', phase: 'middle', kind: '항상 적용', botValue: 2,
        description: '내 상은 원래 이동 외에 대각선으로 한 칸도 갈 수 있다',
    },
    {
        id: AUG.CHARIOT_LEAP, name: '차의 도약', phase: 'middle', kind: '항상 적용', botValue: 3,
        description: '원래 차는 다른 말을 넘을 수 없지만, 내 차는 내 말 하나를 뛰어넘어 계속 갈 수 있다 (상대 말은 못 넘음)',
    },
    {
        id: AUG.REVENGE, name: '반격', phase: 'middle', kind: '조건 발동', botValue: 4,
        description: '상대가 내 차를 잡으면, 잡으러 온 상대 말도 함께 사라진다 (상대 궁이 잡은 경우는 제외)',
    },
    {
        id: AUG.BLAST_CANNON, name: '폭렬포', phase: 'middle', kind: '항상 적용', botValue: 4,
        description: '내 포가 상대 말을 잡지 않고 빈 칸으로 이동하면, 도착한 칸의 위·아래·왼쪽·오른쪽 4칸에 있는 말이 내 말·상대 말 상관없이 모두 사라진다. 궁성 안의 칸과 궁은 피해를 입지 않는다',
    },
    {
        id: AUG.CANNON_STRIKE, name: '포격', phase: 'middle', kind: '한 번 사용', botValue: 3,
        description: '내 포 하나가 다른 말을 뛰어넘지 않고 차처럼 곧장 이동하거나 상대 말을 잡는다 (포와 궁은 잡을 수 없음)',
    },
    {
        id: AUG.FREEZE, name: '빙결', phase: 'middle', kind: '한 번 사용', botValue: 2,
        description: '상대 말 하나(궁 제외)를 골라, 상대의 바로 다음 차례에 그 말을 움직일 수 없게 한다',
    },
    {
        id: AUG.PROTECT, name: '수호', phase: 'middle', kind: '한 번 사용', botValue: 2,
        description: '내 말 하나를 골라, 상대가 앞으로 두 번 두는 동안 그 말이 잡히지 않게 한다',
    },
    {
        id: AUG.SWAP, name: '자리 바꾸기', phase: 'middle', kind: '한 번 사용', botValue: 2,
        description: '궁이 아닌 내 말 두 개를 골라 서로 위치를 바꾼다',
    },
    {
        id: AUG.PROMOTE, name: '승급', phase: 'middle', kind: '한 번 사용', botValue: 3,
        description: '판 가운데를 넘어 상대 진영(1~5행)에 들어간 내 졸 하나를 차로 바꾼다',
    },
    {
        id: AUG.REINFORCE, name: '병력 보충', phase: 'middle', kind: '한 번 사용', botValue: 1.5,
        description: '잡혔던 내 졸 하나를 졸이 처음 서 있던 줄(7행)의 빈 칸에 다시 놓는다',
    },
    {
        id: AUG.TRAP, name: '함정', phase: 'middle', kind: '한 번 사용', botValue: 2,
        description: '빈 칸 하나에 함정을 놓는다. 함정은 양쪽 모두에게 보이고, 상대 말이 그 칸에 들어오면 그 말이 사라진다',
    },
    {
        id: AUG.DOUBLE_MOVE, name: '연속 행동', phase: 'middle', kind: '한 번 사용', botValue: 3,
        description: '이번 차례에 말 하나를 움직인 뒤, 같은 말로 한 번 더 움직인다. 두 번째 이동으로는 상대 말을 잡을 수 없다',
    },
    {
        id: AUG.ASSAULT_SOLDIER, name: '돌격졸', phase: 'middle', kind: '조건 발동', botValue: 3,
        description: '내 졸이 상대 말을 잡으면 그 졸이 바로 한 번 더 움직일 수 있다. 한 차례에 한 번만 생기고, 더 움직이며 또 잡아도 이어지지 않는다',
    },

    // ─────────── 종반 ───────────
    {
        id: AUG.GENERAL_SORTIE, name: '궁의 출정', phase: 'end', kind: '항상 적용', botValue: 1,
        description: '원래 궁은 궁성 밖으로 못 나가지만, 내 궁은 궁성 밖으로도 한 칸씩 이동할 수 있다',
    },
    {
        id: AUG.SOLDIER_RETREAT, name: '결사대', phase: 'end', kind: '항상 적용', botValue: 2,
        description: '원래 졸은 뒤로 못 가지만, 내 졸은 뒤로도 한 칸 이동할 수 있다',
    },
    {
        id: AUG.CANNON_STEP, name: '포의 각성', phase: 'end', kind: '항상 적용', botValue: 2,
        description: '원래 포는 다른 말을 뛰어넘어야만 움직이지만, 내 포는 뛰어넘지 않고 앞뒤좌우 빈 칸으로 한 칸 이동할 수 있다 (잡을 때는 원래처럼 뛰어넘어야 함)',
    },
    {
        id: AUG.GUARD_HORSE, name: '사의 각성', phase: 'end', kind: '항상 적용', botValue: 2,
        description: '내 사는 궁성 안에서 마와 같은 방식으로도 이동할 수 있다 (마처럼 처음 한 칸 가는 길은 비어 있어야 함)',
    },
    {
        id: AUG.MARCH_VICTORY, name: '진군 승리', phase: 'end', kind: '승리 조건', botValue: 5,
        description: '내 졸 하나가 상대 맨 뒷줄(1행)에 도착하면 그 즉시 승리한다',
    },
    {
        id: AUG.SNIPE, name: '저격', phase: 'end', kind: '한 번 사용', botValue: 4,
        description: '상대 말 하나(궁과 차 제외)를 판에서 없앤다',
    },
    {
        id: AUG.BARRAGE, name: '일제 포격', phase: 'end', kind: '한 번 사용', botValue: 3,
        description: '가로 한 줄을 골라, 그 줄에 있는 상대 졸을 모두 없앤다',
    },
    {
        id: AUG.REVIVE, name: '부활', phase: 'end', kind: '한 번 사용', botValue: 3,
        description: '잡혔던 내 말 하나(차 제외)를 내 궁성 안의 빈 칸에 다시 놓는다',
    },
    {
        id: AUG.CHARIOT_CLONE, name: '차 분신', phase: 'end', kind: '한 번 사용', botValue: 5,
        description: '내 차 하나 바로 옆(위·아래·왼쪽·오른쪽) 빈 칸에 차를 하나 더 놓는다',
    },
    {
        id: AUG.TIME_STOP, name: '시간 정지', phase: 'end', kind: '한 번 사용', botValue: 4,
        description: '이번 차례에 수를 두 번 둔다. 두 번째 수로는 상대 궁을 잡을 수 없다',
    },
    {
        id: AUG.STAND_IN, name: '대역', phase: 'end', kind: '조건 발동', botValue: 4,
        description: '상대가 내 궁을 처음 잡을 때, 궁은 그대로 남고 잡으러 온 상대 말이 대신 사라진다 (한 번만 발동)',
    },
];

/** id로 증강 찾기 */
export function getAugment(id: AugmentId): AugmentDef {
    return AUGMENTS.find((a) => a.id === id)!;
}

/** 드래프트 순서 (draftsDone 값 → 다음 단계) */
export const PHASE_ORDER: AugmentPhase[] = ['opening', 'middle', 'end'];
export const PHASE_NAME: Record<AugmentPhase, string> = { opening: '초반', middle: '중반', end: '종반' };

/** 증강을 가진 증강 목록에 넣고, 시작 시 적용 증강이면 판도 바꾼 새 상태를 돌려준다 */
export function applyPick(state: GameState, team: Team, id: AugmentId, choice = 0): GameState {
    const def = getAugment(id);
    const board = state.board.map((row) => [...row]);
    def.onPick?.(board, team, choice);
    return {
        ...state,
        board,
        augments: { ...state.augments, [team]: [...state.augments[team], id] },
    };
}
