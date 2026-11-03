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
    // 중반
    SWIFT_HORSE: 'swift-horse',           // 질주마
    WIDE_ELEPHANT: 'wide-elephant',       // 넓은 상
    CHARIOT_LEAP: 'chariot-leap',         // 차의 도약
    REVENGE: 'revenge',                   // 반격
    BLAST_CANNON: 'blast-cannon',         // 폭렬포
    // 종반
    GENERAL_SORTIE: 'general-sortie',     // 궁의 출정
    SOLDIER_RETREAT: 'soldier-retreat',   // 결사대
    CANNON_STEP: 'cannon-step',           // 포의 각성
    GUARD_HORSE: 'guard-horse',           // 사의 각성
    MARCH_VICTORY: 'march-victory',       // 진군 승리
} as const;
