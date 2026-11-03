// 한 진영이 가진 증강 목록 (판 왼쪽: 나, 오른쪽: 상대)
import type { AugmentId, Team } from '../game/types';
import { AugmentCard } from './AugmentCard';

const TEAM_NAME = { cho: '초', han: '한' } as const;

interface AugmentPanelProps {
    title: string;   // 예: "나", "상대", "봇"
    team: Team;
    augments: AugmentId[];
    side: 'left' | 'right';
}

export function AugmentPanel({ title, team, augments, side }: AugmentPanelProps) {
    return (
        <aside className={`augment-panel ${side}`}>
            <h2 className={team}>{title} ({TEAM_NAME[team]})</h2>
            {augments.length === 0 ? (
                <p className="augment-empty">아직 증강이 없어요</p>
            ) : (
                augments.map((id) => <AugmentCard key={id} id={id} compact />)
            )}
        </aside>
    );
}
