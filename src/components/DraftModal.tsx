// ───────────────────────────────────────────────
// 증강 선택 화면: 카드 3장 중 1장을 45초 안에 고른다.
// 시간이 다 되면 무작위로 1장이 골라진다.
// ───────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { PHASE_NAME, getAugment } from '../augments/registry';
import type { AugmentPhase, DraftPick } from '../augments/registry';
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
    onPick: (pick: DraftPick | null) => void;
    /**
     * 온라인 대전용: 서버가 정한 마감 시각 (이 브라우저 시계 기준, 밀리초).
     * 주어지면 남은 시간을 이 시각으로 계산하고, 시간이 다 돼도 직접 고르지 않는다 (서버가 무작위로 고른다).
     */
    deadline?: number;
}

export function DraftModal({ phase, team, offers, waitingText, onPick, deadline }: DraftModalProps) {
    const [secondsLeft, setSecondsLeft] = useState(
        deadline ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) : DRAFT_SECONDS,
    );
    // 선택지가 있는 카드(자유 상차림)를 누르면, 선택지를 고르는 단계로 넘어간다
    const [choosing, setChoosing] = useState<AugmentId | null>(null);

    // 카드를 눌렀을 때: 선택지가 없으면 바로 확정, 있으면 선택지 단계로
    function clickCard(id: AugmentId) {
        if (getAugment(id).choices) setChoosing(id);
        else onPick({ id, choice: 0 });
    }

    // 온라인: 서버 마감 시각을 기준으로 남은 시간만 다시 계산한다
    useEffect(() => {
        if (!deadline) return;
        const timer = setInterval(() => setSecondsLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000))), 250);
        return () => clearInterval(timer);
    }, [deadline]);

    // 혼자 두기: 1초마다 남은 시간을 줄이고, 0이 되면 무작위로 고른다.
    useEffect(() => {
        if (waitingText || deadline) return;
        if (secondsLeft <= 0) {
            onPick(randomPick(offers));
            return;
        }
        const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
        return () => clearTimeout(timer);
    }, [secondsLeft, waitingText, offers, onPick, deadline]);

    return (
        <div className="draft-overlay" role="dialog" aria-modal="true" aria-label={`${PHASE_NAME[phase]} 증강 선택`}>
            <div className="draft-box">
                <h2>{PHASE_NAME[phase]} 증강 선택</h2>
                {waitingText ? (
                    <p className="draft-sub">
                        {waitingText}
                        {deadline && <> · <span className="draft-timer">{secondsLeft}초</span></>}
                    </p>
                ) : (
                    <>
                        <p className={`draft-sub ${team}`}>
                            {TEAM_SUBJECT[team]} 고를 차례 · <span className="draft-timer">{secondsLeft}초</span>
                        </p>
                        {choosing ? (
                            <div className="draft-choices">
                                <p>{getAugment(choosing).name}: 내 쪽에서 본 맨 뒷줄 배치를 고르세요 (왼쪽 · 오른쪽)</p>
                                {getAugment(choosing).choices!.map((label, i) => (
                                    <button key={label} onClick={() => onPick({ id: choosing, choice: i })}>{label}</button>
                                ))}
                                <button className="draft-back" onClick={() => setChoosing(null)}>다른 카드 고르기</button>
                            </div>
                        ) : (
                            <div className="draft-cards">
                                {offers.map((id) => (
                                    <AugmentCard key={id} id={id} onClick={() => clickCard(id)} />
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
