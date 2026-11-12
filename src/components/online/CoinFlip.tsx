// ───────────────────────────────────────────────
// 동전 던지기 애니메이션
// 앞면은 초의 장(楚), 뒷면은 한의 장(漢). 몇 바퀴 돈 뒤 나온 면에서 멈춘다.
// ───────────────────────────────────────────────
import type { Team } from '../../game/types';

interface CoinFlipProps {
    face: Team;          // 나온 면
    hostNickname: string;
    guestNickname: string;
}

export function CoinFlip({ face, hostNickname, guestNickname }: CoinFlipProps) {
    // 앞면(초)이 나오면 5바퀴, 뒷면(한)이 나오면 5바퀴 반을 돌아서 멈춘다
    const endDeg = face === 'cho' ? 1800 : 1980;
    const faceName = face === 'cho' ? '초' : '한';
    const otherName = face === 'cho' ? '한' : '초';
    return (
        <div className="coin-flip">
            <p className="info">둘 다 같은 진영을 골라서 동전을 던져요. 나온 면의 진영이 방장에게 가요.</p>
            <div className="coin-stage">
                <div className="coin" style={{ ['--coin-end' as string]: `${endDeg}deg` }}>
                    <div className="coin-face front cho">楚</div>
                    <div className="coin-face back han">漢</div>
                </div>
            </div>
            <p className="coin-result">
                <strong className={face}>{faceName}</strong>!
                {' '}{hostNickname}님이 {faceName}, {guestNickname}님이 {otherName}{otherName === '초' ? '예요' : '이에요'}
            </p>
        </div>
    );
}
