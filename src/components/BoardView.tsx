// ───────────────────────────────────────────────
// 장기판 그리기 (화면 전용)
// 규칙은 전혀 모르고, 받은 상태를 그대로 그리기만 한다.
// 클릭이 일어나면 "몇 행 몇 열을 눌렀는지"만 App에게 알려준다.
// ───────────────────────────────────────────────
import { PIECE_LABEL } from '../game/board';
import { COLS, ROWS } from '../game/types';
import type { Board, PieceType, Position } from '../game/types';

// 판 크기 설정 (단위: SVG 좌표. 실제 화면 크기는 CSS가 맞춰준다)
const GAP = 56;      // 선과 선 사이 간격
const MARGIN = 36;   // 판 가장자리 여백
const WIDTH = MARGIN * 2 + GAP * (COLS - 1);
const HEIGHT = MARGIN * 2 + GAP * (ROWS - 1);


// 말 크기: 실제 장기처럼 궁은 크게, 졸/사는 작게
const PIECE_RADIUS: Record<PieceType, number> = {
    general: 25,
    chariot: 22,
    cannon: 22,
    horse: 22,
    elephant: 22,
    guard: 18,
    soldier: 18,
};

interface BoardViewProps {
    board: Board;
    selected: Position | null;   // 지금 선택한 말의 위치 (없으면 null)
    targets: Position[];         // 선택한 말이 갈 수 있는 칸들
    onClick: (pos: Position) => void;
    flipped?: boolean;           // true면 판을 180도 돌려서 그린다 (한으로 플레이할 때 내 진영이 아래에 오도록)
}

export function BoardView({ board, selected, targets, onClick, flipped = false }: BoardViewProps) {
    // (row, col) → 화면 좌표(x, y). 말은 칸 안이 아니라 "선이 만나는 점" 위에 놓인다.
    // 뒤집을 때는 행/열 번호를 반대로 센다. (0행 → 9행 자리, 0열 → 8열 자리)
    // 데이터(board)는 그대로 두고 "그리는 위치"만 바꾸는 것이라, 규칙 코드는 전혀 영향받지 않는다.
    const toX = (col: number) => MARGIN + (flipped ? COLS - 1 - col : col) * GAP;
    const toY = (row: number) => MARGIN + (flipped ? ROWS - 1 - row : row) * GAP;

    // 0~9, 0~8 숫자 배열 (선 그리기와 클릭 영역 만들기에 쓴다)
    const rows = Array.from({ length: ROWS }, (_, i) => i);
    const cols = Array.from({ length: COLS }, (_, i) => i);

    return (
        <svg className="board" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="장기판">
            {/* 1. 판 배경 */}
            <rect x={0} y={0} width={WIDTH} height={HEIGHT} rx={12} className="board-bg" />

            {/* 2. 가로선 10개, 세로선 9개 */}
            <g className="board-lines">
                {rows.map((r) => (
                    <line key={`h${r}`} x1={toX(0)} y1={toY(r)} x2={toX(COLS - 1)} y2={toY(r)} />
                ))}
                {cols.map((c) => (
                    <line key={`v${c}`} x1={toX(c)} y1={toY(0)} x2={toX(c)} y2={toY(ROWS - 1)} />
                ))}

                {/* 3. 궁성 대각선 (위쪽 궁성: 0~2행, 아래쪽 궁성: 7~9행, 둘 다 3~5열) */}
                <line x1={toX(3)} y1={toY(0)} x2={toX(5)} y2={toY(2)} />
                <line x1={toX(5)} y1={toY(0)} x2={toX(3)} y2={toY(2)} />
                <line x1={toX(3)} y1={toY(7)} x2={toX(5)} y2={toY(9)} />
                <line x1={toX(5)} y1={toY(7)} x2={toX(3)} y2={toY(9)} />
            </g>

            {/* 4. 말 */}
            {rows.map((r) =>
                cols.map((c) => {
                    const piece = board[r][c];
                    if (!piece) return null;
                    const isSelected = selected !== null && selected.row === r && selected.col === c;
                    return (
                        <g key={piece.id} className={`piece ${piece.team} ${isSelected ? 'selected' : ''}`}>
                            <circle cx={toX(c)} cy={toY(r)} r={PIECE_RADIUS[piece.type]} />
                            <text x={toX(c)} y={toY(r)} dy="0.35em" textAnchor="middle"
                                fontSize={PIECE_RADIUS[piece.type] * 0.95}>
                                {PIECE_LABEL[piece.team][piece.type]}
                            </text>
                        </g>
                    );
                }),
            )}

            {/* 5. 갈 수 있는 칸 표시: 빈 칸은 점, 상대 말이 있으면 고리 */}
            {targets.map((t) => {
                const hasPiece = board[t.row][t.col] !== null;
                return hasPiece ? (
                    <circle key={`t${t.row}-${t.col}`} className="target-ring"
                        cx={toX(t.col)} cy={toY(t.row)} r={27} />
                ) : (
                    <circle key={`t${t.row}-${t.col}`} className="target-dot"
                        cx={toX(t.col)} cy={toY(t.row)} r={8} />
                );
            })}

            {/* 6. 클릭 영역: 교차점마다 투명한 원을 맨 위에 깔아서 클릭을 받는다.
                   말이나 점보다 위에 있어야 어디를 눌러도 클릭이 잡힌다. */}
            {rows.map((r) =>
                cols.map((c) => (
                    <circle key={`hit${r}-${c}`} className="hit"
                        cx={toX(c)} cy={toY(r)} r={GAP / 2}
                        onClick={() => onClick({ row: r, col: c })} />
                )),
            )}
        </svg>
    );
}
