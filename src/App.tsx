import { useState } from 'react';
import { createInitialState, PIECE_LABEL } from './game/board';
import './App.css';

// 1주차 목표: 초기 판이 제대로 만들어졌는지 눈으로 확인하기.
// 클릭/이동은 2~3주차에 붙인다.
function App() {
  const [state] = useState(createInitialState);

  return (
    <main className="app">
      <h1>증강 장기</h1>
      <p className="turn">{state.turn === 'cho' ? '초' : '한'} 차례</p>
      <div className="board">
        {state.board.map((row, r) =>
          row.map((piece, c) => (
            <div key={`${r}-${c}`} className="cell">
              {piece && (
                <span className={`piece ${piece.team}`}>{PIECE_LABEL[piece.team][piece.type]}</span>
              )}
            </div>
          )),
        )}
      </div>
    </main>
  );
}

export default App;
