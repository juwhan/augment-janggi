// 한 진영이 가진 증강 목록 (판 왼쪽: 나, 오른쪽: 상대)
import { ACTIVE_AUGMENTS } from '../game/augmentIds';
import type { AugmentId, Team } from '../game/types';
import { AugmentCard } from './AugmentCard';

const TEAM_NAME = { cho: '초', han: '한' } as const;

interface AugmentPanelProps {
    title: string;   // 예: "나", "상대", "봇"
    team: Team;
    augments: AugmentId[];
    used: AugmentId[];                  // 이미 쓴 액티브 증강
    side: 'left' | 'right';
    canUse?: (id: AugmentId) => boolean; // 지금 "사용" 버튼을 눌러도 되는지
    activeId?: AugmentId | null;         // 지금 사용 중(대상 고르는 중)인 증강
    onUse?: (id: AugmentId) => void;
}

export function AugmentPanel({ title, team, augments, used, side, canUse, activeId, onUse }: AugmentPanelProps) {
    return (
        <aside className={`augment-panel ${side}`}>
            {/* 제목이 진영 이름과 같으면(친구와 플레이) 괄호를 생략한다 */}
            <h2 className={team}>{title === TEAM_NAME[team] ? title : `${title} (${TEAM_NAME[team]})`}</h2>
            {augments.length === 0 && <p className="augment-empty">아직 증강이 없어요</p>}
            {augments.map((id) => {
                const isActive = ACTIVE_AUGMENTS.includes(id);
                const isUsed = used.includes(id);
                const usable = isActive && !isUsed && !!canUse?.(id);
                return (
                    <div key={id} className={`augment-slot ${isUsed ? 'used' : ''} ${activeId === id ? 'using' : ''}`}>
                        <AugmentCard id={id} compact />
                        {isActive && (
                            isUsed ? (
                                <span className="augment-used">사용함</span>
                            ) : (
                                <button type="button" className="augment-use" disabled={!usable}
                                    onClick={() => onUse?.(id)}>
                                    {activeId === id ? '사용 중' : '사용'}
                                </button>
                            )
                        )}
                    </div>
                );
            })}
        </aside>
    );
}
