// 증강 카드 한 장 (드래프트 선택 화면과 좌우 패널에서 같이 쓴다)
import { getAugment, PHASE_NAME } from '../augments/registry';
import type { AugmentId } from '../game/types';

interface AugmentCardProps {
    id: AugmentId;
    onClick?: () => void; // 있으면 누를 수 있는 카드
    compact?: boolean;    // 패널용 작은 카드
}

export function AugmentCard({ id, onClick, compact = false }: AugmentCardProps) {
    const a = getAugment(id);
    const className = `augment-card phase-${a.phase} ${compact ? 'compact' : ''} ${onClick ? 'clickable' : ''}`;
    const content = (
        <>
            <div className="augment-card-top">
                <span className="augment-phase">{PHASE_NAME[a.phase]}</span>
                <span className="augment-kind">{a.kind}</span>
            </div>
            <strong className="augment-name">{a.name}</strong>
            <p className="augment-desc">{a.description}</p>
        </>
    );
    // 누를 수 있으면 button, 아니면 div로 그린다 (화면 읽기 프로그램이 구분할 수 있도록)
    return onClick ? (
        <button type="button" className={className} onClick={onClick}>{content}</button>
    ) : (
        <div className={className}>{content}</div>
    );
}
