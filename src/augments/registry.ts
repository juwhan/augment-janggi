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
export type AugmentKind = '즉시' | '패시브' | '발동형' | '승리 조건';

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
    /** 즉시형: 고르는 순간 내 진영의 판을 바꾼다 (board는 이미 복사본이라 직접 고쳐도 된다) */
    onPick?: (board: Board, team: Team) => void;
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

export const AUGMENTS: AugmentDef[] = [
    // ─────────── 초반 ───────────
    {
        id: AUG.PAWN_ADVANCE, name: '졸 전진', phase: 'opening', kind: '즉시', botValue: 1,
        description: '가운데 졸 3개가 한 칸 앞에서 시작한다',
        onPick: (board, team) => {
            for (const col of [2, 4, 6]) shift(board, team, 'soldier', 7, 6, col);
        },
    },
    {
        id: AUG.VANGUARD_CHARIOT, name: '선봉 차', phase: 'opening', kind: '즉시', botValue: 1.5,
        description: '내 차 두 개가 한 칸 앞에서 시작한다',
        onPick: (board, team) => {
            for (const col of [0, 8]) shift(board, team, 'chariot', 10, 9, col);
        },
    },
    {
        id: AUG.SPARE_CANNON, name: '예비 포', phase: 'opening', kind: '즉시', botValue: 7,
        description: '궁 바로 뒤 빈 칸에 포를 하나 더 놓는다',
        onPick: (board, team) => place(board, team, 'cannon', 10, 4, 'spare'),
    },
    {
        id: AUG.SPARE_SOLDIER, name: '예비 졸', phase: 'opening', kind: '즉시', botValue: 2,
        description: '궁성 앞 가운데 빈 칸에 졸을 하나 더 놓는다',
        onPick: (board, team) => place(board, team, 'soldier', 8, 4, 'spare'),
    },
    {
        id: AUG.SOLDIER_ARMY, name: '졸 대군', phase: 'opening', kind: '즉시', botValue: 0,
        description: '궁만 남기고 내 기물을 모두 치운 뒤, 내 진영 전체(6~10행)에 졸을 체크무늬로 23개 놓는다',
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
        id: AUG.CANNON_BRIDGE, name: '포의 다리', phase: 'opening', kind: '패시브', botValue: 2,
        description: '내 포는 포를 넘을 수 있다 (포를 잡는 건 여전히 불가)',
    },
    {
        id: AUG.ARMORED_HORSE, name: '철갑마', phase: 'opening', kind: '패시브', botValue: 3,
        description: '내 마는 멱이 막혀도 이동할 수 있다',
    },

    // ─────────── 중반 ───────────
    {
        id: AUG.SWIFT_HORSE, name: '질주마', phase: 'middle', kind: '패시브', botValue: 2,
        description: '내 마는 직선 두 칸 이동도 할 수 있다 (중간 칸이 막히면 불가)',
    },
    {
        id: AUG.WIDE_ELEPHANT, name: '넓은 상', phase: 'middle', kind: '패시브', botValue: 2,
        description: '내 상은 대각선 한 칸 이동도 할 수 있다',
    },
    {
        id: AUG.CHARIOT_LEAP, name: '차의 도약', phase: 'middle', kind: '패시브', botValue: 3,
        description: '내 차는 내 말 하나를 뛰어넘을 수 있다',
    },
    {
        id: AUG.REVENGE, name: '반격', phase: 'middle', kind: '발동형', botValue: 4,
        description: '내 차가 잡히면 잡은 상대 말도 함께 사라진다 (궁 제외)',
    },
    {
        id: AUG.BLAST_CANNON, name: '폭렬포', phase: 'middle', kind: '패시브', botValue: 4,
        description: '내 포가 잡지 않고 이동하면 도착 칸 상하좌우의 말이 피아 구분 없이 사라진다. 궁성 안 칸과 궁은 피해가 없다',
    },

    // ─────────── 종반 ───────────
    {
        id: AUG.GENERAL_SORTIE, name: '궁의 출정', phase: 'end', kind: '패시브', botValue: 1,
        description: '내 궁이 궁성 밖으로 나갈 수 있다',
    },
    {
        id: AUG.SOLDIER_RETREAT, name: '결사대', phase: 'end', kind: '패시브', botValue: 2,
        description: '내 졸은 뒤로도 한 칸 이동할 수 있다',
    },
    {
        id: AUG.CANNON_STEP, name: '포의 각성', phase: 'end', kind: '패시브', botValue: 2,
        description: '내 포는 받침 없이 한 칸 이동할 수 있다 (잡기는 받침 필요)',
    },
    {
        id: AUG.GUARD_HORSE, name: '사의 각성', phase: 'end', kind: '패시브', botValue: 2,
        description: '내 사는 궁성 안에서 마처럼도 이동할 수 있다',
    },
    {
        id: AUG.MARCH_VICTORY, name: '진군 승리', phase: 'end', kind: '승리 조건', botValue: 5,
        description: '내 졸 하나가 상대 맨 끝 줄(1행)에 도착하면 승리한다',
    },
];

/** id로 증강 찾기 */
export function getAugment(id: AugmentId): AugmentDef {
    return AUGMENTS.find((a) => a.id === id)!;
}

/** 드래프트 순서 (draftsDone 값 → 다음 단계) */
export const PHASE_ORDER: AugmentPhase[] = ['opening', 'middle', 'end'];
export const PHASE_NAME: Record<AugmentPhase, string> = { opening: '초반', middle: '중반', end: '종반' };

/** (참고용) 상태를 받아 즉시형 증강의 효과를 적용한 새 상태를 돌려준다 */
export function applyPick(state: GameState, team: Team, id: AugmentId): GameState {
    const def = getAugment(id);
    const board = state.board.map((row) => [...row]);
    def.onPick?.(board, team);
    return {
        ...state,
        board,
        augments: { ...state.augments, [team]: [...state.augments[team], id] },
    };
}
