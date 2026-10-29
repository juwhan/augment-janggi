// ───────────────────────────────────────────────
// 시작 화면: 모드, 진영, 난이도를 고른다.
// 난이도는 여기서만 바꿀 수 있다. (게임 중에는 못 바꿈)
// ───────────────────────────────────────────────
import { useState } from 'react';
import { BOT_LEVELS } from '../bot';
import type { Team } from '../game/types';

/** 게임 설정: 시작 화면에서 정해서 Game에 넘긴다 */
export interface GameSettings {
    mode: 'bot' | 'friend'; // 봇과 대전 / 친구와 한 화면에서
    playerTeam: Team;       // 봇 대전일 때 내 진영 (초가 먼저 둔다)
    level: number;          // 봇 난이도 (1~5)
}

interface StartScreenProps {
    onStart: (settings: GameSettings) => void;
}

export function StartScreen({ onStart }: StartScreenProps) {
    const [mode, setMode] = useState<GameSettings['mode']>('bot');
    const [playerTeam, setPlayerTeam] = useState<Team>('cho');
    const [level, setLevel] = useState(1);

    return (
        <section className="start">
            {/* 모드 선택 */}
            <div className="option-group">
                <h2>모드</h2>
                <div className="options">
                    <button className={mode === 'bot' ? 'active' : ''} onClick={() => setMode('bot')}>
                        봇과 대전
                    </button>
                    <button className={mode === 'friend' ? 'active' : ''} onClick={() => setMode('friend')}>
                        친구와 플레이
                    </button>
                </div>
            </div>

            {/* 봇 대전일 때만 진영과 난이도를 고른다 */}
            {mode === 'bot' && (
                <>
                    <div className="option-group">
                        <h2>내 진영</h2>
                        <div className="options">
                            <button className={`cho ${playerTeam === 'cho' ? 'active' : ''}`}
                                onClick={() => setPlayerTeam('cho')}>
                                초 (먼저 둠)
                            </button>
                            <button className={`han ${playerTeam === 'han' ? 'active' : ''}`}
                                onClick={() => setPlayerTeam('han')}>
                                한 (나중에 둠)
                            </button>
                        </div>
                    </div>

                    <div className="option-group">
                        <h2>난이도</h2>
                        <div className="levels">
                            {BOT_LEVELS.map((l) => (
                                <button key={l.level}
                                    className={level === l.level ? 'active' : ''}
                                    disabled={l.bot === null}
                                    onClick={() => setLevel(l.level)}>
                                    <strong>{l.level}. {l.name}</strong>
                                    <span>{l.bot ? l.description : '준비 중'}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </>
            )}

            <button className="start-button" onClick={() => onStart({ mode, playerTeam, level })}>
                게임 시작
            </button>
        </section>
    );
}
