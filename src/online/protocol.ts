// ───────────────────────────────────────────────
// 온라인 대전: 화면(브라우저)과 서버가 주고받는 메시지 모양
// 화면과 서버가 이 파일 하나를 같이 써서, 한쪽만 바뀌는 실수를 막는다.
// ───────────────────────────────────────────────
import type { AugmentPhase, DraftPick } from '../augments/registry';
import type { AugmentId, GameState, Move, Team } from '../game/types';

/** 시간 제한 (밀리초) */
export const SIDE_CHOICE_MS = 15_000;   // 진영 고르기
export const DRAFT_MS = 45_000;         // 증강 고르기
export const TURN_MS = 90_000;          // 한 차례
export const RECONNECT_MS = 60_000;     // 연결이 끊긴 뒤 돌아올 수 있는 시간
export const COIN_FLIP_MS = 3_000;      // 동전 던지기 애니메이션 시간

/** 로비 목록에 보이는 방 하나 */
export interface RoomSummary {
    roomId: string;
    name: string;
    hostNickname: string;
    createdAt: number;
}

/** 방 진행 단계 */
export type RoomPhase =
    | 'waiting'      // 상대를 기다리는 중
    | 'choosingSide' // 진영 고르는 중
    | 'coinFlip'     // 같은 진영을 골라서 동전을 던지는 중
    | 'playing'      // 대국 중 (드래프트 포함)
    | 'finished';    // 끝남

/** 대국이 끝난 이유 */
export type EndReason = 'general' | 'noMoves' | 'draw' | 'timeout' | 'disconnect' | 'resign' | 'march';

/** 서버가 각 플레이어에게 보내는 "지금 방 상태". 플레이어마다 볼 수 있는 것만 담는다. */
export interface RoomView {
    roomId: string;
    name: string;
    isPrivate: boolean;
    phase: RoomPhase;
    you: { nickname: string; team: Team | null; isHost: boolean };
    opponent: { nickname: string; connected: boolean } | null;
    /** 진영 고르기: 내가 고른 것, 상대가 골랐는지 여부만 (무엇을 골랐는지는 숨김) */
    sideChoice: { mine: Team | 'any' | null; opponentChosen: boolean; deadline: number } | null;
    /** 동전 던지기 결과 (나온 면) */
    coin: { face: Team; startedAt: number } | null;
    game: GameState | null;
    /** 직전에 둔 수 (판에 흔적으로 표시) */
    lastMove: Move | null;
    /** 드래프트: 내 카드만 보이고, 상대는 골랐는지 여부만 */
    draft: {
        phase: AugmentPhase;
        myOffers: AugmentId[];
        myPicked: boolean;
        opponentPicked: boolean;
        deadline: number;
    } | null;
    /** 지금 차례의 마감 시각 (드래프트 중에는 null) */
    turnDeadline: number | null;
    /** 상대 연결이 끊겼을 때, 돌아오지 않으면 내가 이기는 시각 */
    opponentReconnectDeadline: number | null;
    result: { winner: Team | null; reason: EndReason } | null;
    /** 서버 시계 (화면의 남은 시간 계산을 서버 기준으로 맞추기 위해) */
    serverTime: number;
}

/** 화면 → 서버 */
export type ClientMessage =
    | { type: 'chooseSide'; team: Team | 'any' }
    | { type: 'pick'; pick: DraftPick | null }
    | { type: 'move'; move: Move }
    | { type: 'resign' };

/** 서버 → 화면 */
export type ServerMessage =
    | { type: 'state'; view: RoomView }
    | { type: 'lobby'; rooms: RoomSummary[] }
    | { type: 'error'; message: string };
