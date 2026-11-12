// ───────────────────────────────────────────────
// 증강 id 모음
// 규칙 코드(moves.ts, apply.ts)와 증강 목록(augments/registry.ts)이 같은 이름을 쓰도록
// 문자열을 한곳에 모아둔다. 오타가 나면 TypeScript가 바로 잡아준다.
// ───────────────────────────────────────────────
export const AUG = {
    // 초반
    PAWN_ADVANCE: 'pawn-advance',         // 졸 전진
    VANGUARD_CHARIOT: 'vanguard-chariot', // 선봉 차
    SPARE_CANNON: 'spare-cannon',         // 예비 포
    SPARE_SOLDIER: 'spare-soldier',       // 예비 졸
    SOLDIER_ARMY: 'soldier-army',         // 졸 대군
    CANNON_BRIDGE: 'cannon-bridge',       // 포의 다리
    ARMORED_HORSE: 'armored-horse',       // 철갑마
    FREE_SETUP: 'free-setup',             // 자유 상차림
    NIMBLE_ELEPHANT: 'nimble-elephant',   // 날랜 상
    ROYAL_GUARD: 'royal-guard',           // 근위대
    GENERAL_SPIRIT: 'general-spirit',     // 장수의 기백
    IRON_PALACE: 'iron-palace',           // 철벽 궁성
    MOBILE_SOLDIER: 'mobile-soldier',     // 기동졸
    // 중반
    SWIFT_HORSE: 'swift-horse',           // 질주마
    WIDE_ELEPHANT: 'wide-elephant',       // 넓은 상
    CHARIOT_LEAP: 'chariot-leap',         // 차의 도약
    REVENGE: 'revenge',                   // 반격
    BLAST_CANNON: 'blast-cannon',         // 폭렬포
    CANNON_STRIKE: 'cannon-strike',       // 포격 (액티브)
    FREEZE: 'freeze',                     // 빙결 (액티브)
    PROTECT: 'protect',                   // 수호 (액티브)
    SWAP: 'swap',                         // 자리 바꾸기 (액티브)
    PROMOTE: 'promote',                   // 승급 (액티브)
    REINFORCE: 'reinforce',               // 병력 보충 (액티브)
    TRAP: 'trap',                         // 함정 (액티브)
    DOUBLE_MOVE: 'double-move',           // 연속 행동 (액티브)
    ASSAULT_SOLDIER: 'assault-soldier',   // 돌격졸 (발동형)
    // 종반
    GENERAL_SORTIE: 'general-sortie',     // 궁의 출정
    SOLDIER_RETREAT: 'soldier-retreat',   // 결사대
    CANNON_STEP: 'cannon-step',           // 포의 각성
    GUARD_HORSE: 'guard-horse',           // 사의 각성
    MARCH_VICTORY: 'march-victory',       // 진군 승리
    SNIPE: 'snipe',                       // 저격 (액티브)
    BARRAGE: 'barrage',                   // 일제 포격 (액티브)
    REVIVE: 'revive',                     // 부활 (액티브)
    CHARIOT_CLONE: 'chariot-clone',       // 차 분신 (액티브)
    TIME_STOP: 'time-stop',               // 시간 정지 (액티브)
    STAND_IN: 'stand-in',                 // 대역 (발동형)
} as const;

/** 액티브 증강: 원하는 내 차례에 한 번 쓰는 증강 */
export const ACTIVE_AUGMENTS: string[] = [
    AUG.CANNON_STRIKE, AUG.FREEZE, AUG.PROTECT, AUG.SWAP, AUG.PROMOTE, AUG.REINFORCE,
    AUG.TRAP, AUG.DOUBLE_MOVE, AUG.SNIPE, AUG.BARRAGE, AUG.REVIVE, AUG.CHARIOT_CLONE, AUG.TIME_STOP,
];
