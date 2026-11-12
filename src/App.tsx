import { useState } from 'react';
import { StartScreen } from './components/StartScreen';
import type { GameSettings } from './components/StartScreen';
import { Game } from './components/Game';
import { Online } from './components/online/Online';
import './App.css';

// 앱의 최상위: 시작 화면과 게임 화면 중 하나를 보여준다.
// settings가 null이면 시작 화면, 값이 있으면 그 설정으로 게임 화면 (온라인이면 로비).
function App() {
    const [settings, setSettings] = useState<GameSettings | null>(null);

    return (
        <main className="app">
            <h1>증강 장기</h1>
            {settings === null ? (
                <StartScreen onStart={setSettings} />
            ) : settings.mode === 'online' ? (
                <Online onExit={() => setSettings(null)} />
            ) : (
                <Game settings={settings} onExit={() => setSettings(null)} />
            )}
        </main>
    );
}

export default App;
