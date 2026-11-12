// ───────────────────────────────────────────────
// 온라인 대국 방: 대기 → 진영 고르기 → (동전) → 대국 → 결과
// 판의 진짜 상태는 서버가 들고 있다. 이 화면은 서버가 보내준 상태를 그리고,
// 내가 둔 수나 고른 카드를 서버에 보내기만 한다.
// ───────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react';
import { WS_URL, getNickname, getPlayerId, saveLastRoom } from '../../online/client';
import type { ClientMessage, EndReason, RoomView, ServerMessage } from '../../online/protocol';
import type { DraftPick } from '../../augments/registry';
import type { Move, Team } from '../../game/types';
import { opponent } from '../../game/board';
import { PlayArea } from '../PlayArea';
import { DraftModal } from '../DraftModal';
import { CoinFlip } from './CoinFlip';

const TEAM_NAME = { cho: '초', han: '한' } as const;

const END_TEXT: Record<EndReason, string> = {
    general: '궁을 잡았어요',
    noMoves: '상대가 둘 수 있는 수가 없어요',
    draw: '무승부예요',
    timeout: '시간 초과',
    disconnect: '연결이 끊긴 채 돌아오지 않았어요',
    resign: '기권',
    march: '진군 승리 (졸이 맨 끝 줄 도착)',
};

interface OnlineRoomProps {
    roomId: string;
    onLeave: () => void;
}

export function OnlineRoom({ roomId, onLeave }: OnlineRoomProps) {
    const [view, setView] = useState<RoomView | null>(null);
    const [connection, setConnection] = useState<'connecting' | 'open' | 'lost'>('connecting');
    const [fatal, setFatal] = useState<string | null>(null);     // 들어갈 수 없는 방 등
    const [notice, setNotice] = useState<string | null>(null);   // 잠깐 보여줄 알림
    const [confirmResign, setConfirmResign] = useState(false);
    const [copied, setCopied] = useState(false);
    const wsRef = useRef<WebSocket | null>(null);
    // 서버 시계와 내 시계의 차이. 남은 시간을 서버 기준으로 맞춘다.
    const offsetRef = useRef(0);
    const [, setTick] = useState(0);

    // ── 서버 연결 (끊기면 2초마다 다시 연결) ──
    useEffect(() => {
        let closed = false;
        let retry: ReturnType<typeof setTimeout> | undefined;
        saveLastRoom(roomId);
        const connect = () => {
            const params = new URLSearchParams({ playerId: getPlayerId(), nickname: getNickname() });
            const ws = new WebSocket(`${WS_URL}/rooms/${roomId}/ws?${params}`);
            wsRef.current = ws;
            ws.onopen = () => setConnection('open');
            ws.onmessage = (e) => {
                const msg: ServerMessage = JSON.parse(e.data);
                if (msg.type === 'state') {
                    offsetRef.current = msg.view.serverTime - Date.now();
                    setView(msg.view);
                } else if (msg.type === 'error') {
                    setNotice(msg.message);
                }
            };
            ws.onclose = (e) => {
                if (closed) return;
                if (e.code === 4000) {
                    // 서버가 입장을 거절했다 (가득 찬 방, 없는 방 등)
                    setFatal('방에 들어갈 수 없어요');
                    saveLastRoom(null);
                    return;
                }
                if (e.code === 4001) return; // 같은 사람이 다른 탭에서 들어와서 이 연결이 교체됐다
                setConnection('lost');
                retry = setTimeout(connect, 2000);
            };
        };
        connect();
        return () => {
            closed = true;
            clearTimeout(retry);
            wsRef.current?.close();
        };
    }, [roomId]);

    // 남은 시간 표시를 위해 0.25초마다 다시 그린다
    useEffect(() => {
        const timer = setInterval(() => setTick((t) => t + 1), 250);
        return () => clearInterval(timer);
    }, []);

    // 알림은 3초 뒤 사라진다
    useEffect(() => {
        if (!notice) return;
        const timer = setTimeout(() => setNotice(null), 3000);
        return () => clearTimeout(timer);
    }, [notice]);

    const send = useCallback((msg: ClientMessage) => {
        const ws = wsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
        else setNotice('연결이 끊겨 있어요. 다시 연결되면 해주세요');
    }, []);

    /** 서버 마감 시각까지 남은 초 */
    const secondsUntil = (deadline: number | null | undefined) =>
        deadline ? Math.max(0, Math.ceil((deadline - (Date.now() + offsetRef.current)) / 1000)) : null;
    /** 서버 마감 시각을 이 브라우저 시계 기준으로 바꾼 값 */
    const localTime = (deadline: number) => deadline - offsetRef.current;

    function leave() {
        saveLastRoom(null);
        onLeave();
    }

    // ── 화면 ──
    if (fatal) {
        return (
            <section className="online-room">
                <p className="error">{fatal}</p>
                {notice && <p className="info">{notice}</p>}
                <button onClick={leave}>로비로</button>
            </section>
        );
    }
    if (!view) {
        return (
            <section className="online-room">
                <p className="info">방에 연결하는 중...</p>
                <button onClick={leave}>로비로</button>
            </section>
        );
    }

    const myTeam = view.you.team;
    const banners = (
        <>
            {connection === 'lost' && <p className="banner warn">연결이 끊겼어요. 다시 연결하는 중...</p>}
            {view.opponent && !view.opponent.connected && view.opponentReconnectDeadline && (
                <p className="banner warn">
                    상대 연결이 끊겼어요. {secondsUntil(view.opponentReconnectDeadline)}초 안에 돌아오지 않으면 승리해요
                </p>
            )}
            {notice && <p className="banner">{notice}</p>}
        </>
    );

    // 1. 상대 기다리기
    if (view.phase === 'waiting') {
        return (
            <section className="online-room">
                {banners}
                <h2>{view.name}</h2>
                <p className="info">상대를 기다리고 있어요...</p>
                <div className="room-code">
                    <span>방 코드</span>
                    <strong>{view.roomId}</strong>
                    <button onClick={() => {
                        navigator.clipboard?.writeText(view.roomId).then(() => setCopied(true), () => {});
                    }}>{copied ? '복사됨' : '복사'}</button>
                </div>
                <p className="info">
                    {view.isPrivate ? '비공개 방이에요. 친구에게 방 코드를 알려주세요.' : '로비 목록에 이 방이 보이고 있어요.'}
                </p>
                <button onClick={leave}>방 나가기</button>
            </section>
        );
    }

    // 2. 진영 고르기
    if (view.phase === 'choosingSide' && view.sideChoice) {
        const mine = view.sideChoice.mine;
        const choose = (team: Team | 'any') => send({ type: 'chooseSide', team });
        return (
            <section className="online-room">
                {banners}
                <h2>진영 고르기</h2>
                <p className="info">
                    상대: <strong>{view.opponent?.nickname}</strong> · 남은 시간 {secondsUntil(view.sideChoice.deadline)}초
                </p>
                <p className="info">서로 다르게 고르면 그대로, 같으면 동전을 던져서 정해요. 초가 먼저 둬요.</p>
                <div className="side-buttons">
                    <button className={`side cho ${mine === 'cho' ? 'active' : ''}`} onClick={() => choose('cho')}>
                        <span className="side-mark">楚</span>초 (먼저 둠)
                    </button>
                    <button className={`side han ${mine === 'han' ? 'active' : ''}`} onClick={() => choose('han')}>
                        <span className="side-mark">漢</span>한 (나중에 둠)
                    </button>
                </div>
                <button className={mine === 'any' ? 'active-any' : ''} onClick={() => choose('any')}>상관없음</button>
                <p className="info">
                    {mine ? '골랐어요. ' : ''}{view.sideChoice.opponentChosen ? '상대도 골랐어요.' : '상대가 고르는 중이에요...'}
                </p>
            </section>
        );
    }

    // 3. 동전 던지기
    if (view.phase === 'coinFlip' && view.coin) {
        const hostName = view.you.isHost ? view.you.nickname : view.opponent?.nickname ?? '';
        const guestName = view.you.isHost ? view.opponent?.nickname ?? '' : view.you.nickname;
        return (
            <section className="online-room">
                {banners}
                <CoinFlip face={view.coin.face} hostNickname={hostName} guestNickname={guestName} />
            </section>
        );
    }

    // 4. 대국 / 결과
    const game = view.game;
    if (!game || !myTeam) return null;
    const isFinished = view.phase === 'finished';
    const draft = view.draft;
    const turnSeconds = secondsUntil(view.turnDeadline);

    let status: string;
    if (isFinished && view.result) {
        const r = view.result;
        status = r.winner === null ? `무승부 · ${END_TEXT[r.reason]}`
            : r.winner === myTeam ? `승리했어요! · ${END_TEXT[r.reason]}`
                : `패배했어요 · ${END_TEXT[r.reason]}`;
    } else if (draft) {
        status = '증강 고르는 중...';
    } else if (game.turn === myTeam) {
        status = `내 차례 · ${turnSeconds ?? '-'}초`;
    } else {
        status = `${view.opponent?.nickname ?? '상대'} 차례 · ${turnSeconds ?? '-'}초`;
    }

    return (
        <section className="game online-room playing">
            <p className="info">
                온라인 대전 · {view.you.nickname}({TEAM_NAME[myTeam]}) vs {view.opponent?.nickname}({TEAM_NAME[opponent(myTeam)]})
            </p>
            <p className={`status ${isFinished ? (view.result?.winner ?? 'draw') : game.turn} ${isFinished ? 'winner' : ''}
                ${!isFinished && turnSeconds !== null && turnSeconds <= 10 ? 'hurry' : ''}`}>{status}</p>
            {banners}

            <PlayArea
                state={game}
                lastMove={view.lastMove}
                actingTeams={[myTeam]}
                canAct={view.phase === 'playing' && !draft && connection === 'open'}
                onMove={(move: Move) => send({ type: 'move', move })}
                flipped={myTeam === 'han'}
                leftTeam={myTeam}
                leftTitle={view.you.nickname}
                rightTitle={view.opponent?.nickname ?? '상대'}
            />

            <div className="buttons">
                {isFinished ? (
                    <button className="primary" onClick={leave}>로비로</button>
                ) : confirmResign ? (
                    <>
                        <button className="danger" onClick={() => send({ type: 'resign' })}>정말 기권하기</button>
                        <button onClick={() => setConfirmResign(false)}>취소</button>
                    </>
                ) : (
                    <button onClick={() => setConfirmResign(true)}>기권</button>
                )}
            </div>

            {draft && !isFinished && (
                <DraftModal
                    key={draft.phase}
                    phase={draft.phase}
                    team={myTeam}
                    offers={draft.myOffers}
                    deadline={localTime(draft.deadline)}
                    waitingText={draft.myPicked
                        ? (draft.opponentPicked ? '공개하는 중...' : '골랐어요. 상대가 고르는 중이에요')
                        : undefined}
                    onPick={(pick: DraftPick | null) => send({ type: 'pick', pick })}
                />
            )}
        </section>
    );
}
