// ───────────────────────────────────────────────
// 드래프트 규칙
//
// 언제 열리나
//   1. 초반: 게임 시작 시
//   2. 중반: 주요 기물(차·포·마·상)이 양쪽 합쳐 6개 잡힌 뒤
//   3. 종반: 주요 기물이 10개 잡힌 뒤 (= 처음 16개 중 6개 남았을 때)
//   중반/종반은 조건이 채워진 턴에서 "한의 차례까지 끝난 뒤", 즉 다시 초의 차례가 됐을 때 연다.
//   그래서 두 사람이 항상 같은 수만큼 둔 상태에서 고른다.
//
// 어떻게 고르나
//   그 단계의 증강 중 아직 아무도 안 가진 것에서, 두 사람에게 3장씩 겹치지 않게 나눠준다.
//   45초 안에 동시에 1장씩 고르고, 시간이 지나면 무작위로 1장.
// ───────────────────────────────────────────────
import { AUGMENTS, PHASE_ORDER, applyPick, getAugment } from './registry';
import type { AugmentPhase } from './registry';
import type { AugmentId, GameState, Team } from '../game/types';

/** 중반/종반 드래프트가 열리는 "잡힌 주요 기물 수" */
export const DRAFT_THRESHOLDS: Record<AugmentPhase, number> = { opening: 0, middle: 6, end: 10 };

/** 한 사람에게 보여줄 카드 수 */
const CARDS_PER_PLAYER = 3;

/** 지금 열려야 하는 드래프트 단계. 없으면 null */
export function pendingDraftPhase(state: GameState): AugmentPhase | null {
    if (state.winner !== null || state.isDraw) return null;
    if (state.draftsDone >= PHASE_ORDER.length) return null;

    const phase = PHASE_ORDER[state.draftsDone];
    if (phase === 'opening') return 'opening';

    // 중반/종반: 한의 차례가 끝나서 초의 차례가 됐을 때만
    if (state.turn !== 'cho') return null;
    return state.majorCaptured >= DRAFT_THRESHOLDS[phase] ? phase : null;
}

/** 배열을 무작위로 섞은 새 배열 (피셔-예이츠 셔플) */
function shuffle<T>(items: T[]): T[] {
    const a = [...items];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

/**
 * 두 사람에게 줄 카드 뽑기. 서로 겹치지 않고, 이미 누가 가진 증강도 나오지 않는다.
 * 그 단계의 증강이 6장보다 적으면 사람마다 그 절반씩만 준다.
 */
export function drawOffers(state: GameState, phase: AugmentPhase): Record<Team, AugmentId[]> {
    const owned = new Set([...state.augments.cho, ...state.augments.han]);
    const pool = shuffle(AUGMENTS.filter((a) => a.phase === phase && !owned.has(a.id)).map((a) => a.id));
    const n = Math.min(CARDS_PER_PLAYER, Math.floor(pool.length / 2));
    return { cho: pool.slice(0, n), han: pool.slice(n, n * 2) };
}

/**
 * 두 사람이 고른 증강을 적용하고 드래프트를 끝낸다.
 * 초의 증강을 먼저 적용하고 한의 증강을 적용한다. (즉시형은 각자 자기 진영만 바꾸므로 순서가 결과에 영향이 없다)
 */
export function finishDraft(state: GameState, picks: Record<Team, AugmentId | null>): GameState {
    let next = state;
    for (const team of ['cho', 'han'] as Team[]) {
        const id = picks[team];
        if (id) next = applyPick(next, team, id);
    }
    return { ...next, draftsDone: next.draftsDone + 1 };
}

/** 봇의 드래프트 선택. 1~2단계는 무작위, 3단계부터는 botValue가 가장 높은 것 */
export function botPickAugment(offers: AugmentId[], level: number): AugmentId | null {
    if (offers.length === 0) return null;
    if (level <= 2) return offers[Math.floor(Math.random() * offers.length)];
    return [...offers].sort((a, b) => getAugment(b).botValue - getAugment(a).botValue)[0];
}

/** 시간 초과 등으로 무작위 선택 */
export function randomPick(offers: AugmentId[]): AugmentId | null {
    return offers.length === 0 ? null : offers[Math.floor(Math.random() * offers.length)];
}
