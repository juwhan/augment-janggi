// ───────────────────────────────────────────────
// 증강 선택 화면: 카드 3장 중 1장을 45초 안에 고른다.
// 시간이 다 되면 무작위로 1장이 골라진다.
// ───────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { PHASE_NAME } from '../augments/registry';
import type { AugmentPhase } from '../augments/registry';
import { randomPick } from '../augments/draft';
import type { AugmentId, Team } from '../game/types';
import { AugmentCard } from './AugmentCard';

/** 선택 제한 시간 (초) */
export const DRAFT_SECONDS = 45;

// 받침에 맞춰 조사를 붙인 이름 (초가 / 한이)
const TEAM_SUBJECT = { cho: '초가', han: '한이' } as const;

interface DraftModalProps {
    phase: AugmentPhase;
    team: Team;                 // 지금 고르는 진영
    offers: AugmentId[];        // 이 진영에게 나온 카드
    waitingText?: string;       // 고른 뒤 상대를 기다릴 때 보여줄 문구 (없으면 고르는 화면)
    onPick: (id: AugmentId | null) => void;
}

export function DraftModal({ phase, team, offers, waitingText, onPick }: DraftModalProps) {
    const [secondsLeft, setSecondsLeft] = useState(DRAFT_SECONDS);

    // 1초마다 남은 시간을 줄이고, 0이 되면 무작위로 고른다.
    useEffect(() => {
        if (waitingText) return;
        if (secondsLeft <= 0) {
            onPick(randomPick(offers));
            return;
        }
        const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
        return () => clearTimeout(timer);
    }, [secondsLeft, waitingText, offers, onPick]);

    return (
        <div className="draft-overlay" role="dialog" aria-modal="true" aria-label={`${PHASE_NAME[phase]} 증강 선택`}>
            <div className="draft-box">
                <h2>{PHASE_NAME[phase]} 증강 선택</h2>
                {waitingText ? (
                    <p className="draft-sub">{waitingText}</p>
                ) : (
                    <>
                        <p className={`draft-sub ${team}`}>
                            {TEAM_SUBJECT[team]} 고를 차례 · <span className="draft-timer">{secondsLeft}초</span>
                        </p>
                        <div className="draft-cards">
                            {offers.map((id) => (
                                <AugmentCard key={id} id={id} onClick={() => onPick(id)} />
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
