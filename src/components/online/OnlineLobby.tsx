// ───────────────────────────────────────────────
// 온라인 로비: 닉네임 정하기, 열린 방 목록 보기, 방 만들기, 코드로 비공개 방 들어가기
// ───────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { SERVER_URL, WS_URL, getNickname, getPlayerId, saveNickname } from '../../online/client';
import type { RoomSummary, ServerMessage } from '../../online/protocol';

interface OnlineLobbyProps {
    onEnterRoom: (roomId: string) => void;
    onExit: () => void;
}

/** "3분 전" 같은 문구 */
function ago(time: number): string {
    const min = Math.floor((Date.now() - time) / 60000);
    return min < 1 ? '방금' : `${min}분 전`;
}

export function OnlineLobby({ onEnterRoom, onExit }: OnlineLobbyProps) {
    const [nickname, setNickname] = useState(getNickname());
    const [editingName, setEditingName] = useState(!getNickname());
    const [rooms, setRooms] = useState<RoomSummary[] | null>(null);
    const [connection, setConnection] = useState<'connecting' | 'open' | 'failed'>('connecting');
    const [roomName, setRoomName] = useState('');
    const [isPrivate, setIsPrivate] = useState(false);
    const [code, setCode] = useState('');
    const [message, setMessage] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    // 로비에 연결해서 방 목록을 실시간으로 받는다. 끊기면 3초 뒤 다시 연결.
    useEffect(() => {
        let ws: WebSocket | null = null;
        let retry: ReturnType<typeof setTimeout> | undefined;
        let closed = false;
        const connect = () => {
            ws = new WebSocket(`${WS_URL}/lobby`);
            ws.onopen = () => setConnection('open');
            ws.onmessage = (e) => {
                const msg: ServerMessage = JSON.parse(e.data);
                if (msg.type === 'lobby') setRooms(msg.rooms);
            };
            ws.onclose = () => {
                if (closed) return;
                setConnection('failed');
                retry = setTimeout(connect, 3000);
            };
        };
        connect();
        return () => {
            closed = true;
            clearTimeout(retry);
            ws?.close();
        };
    }, []);

    // "방금", "3분 전" 표시를 1분마다 새로 그린다
    const [, setTick] = useState(0);
    useEffect(() => {
        const timer = setInterval(() => setTick((t) => t + 1), 30000);
        return () => clearInterval(timer);
    }, []);

    function confirmName() {
        const name = nickname.trim().slice(0, 12);
        if (!name) return;
        setNickname(name);
        saveNickname(name);
        setEditingName(false);
    }

    async function createRoom() {
        setBusy(true);
        setMessage(null);
        try {
            const res = await fetch(`${SERVER_URL}/rooms`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nickname, playerId: getPlayerId(), name: roomName, isPrivate }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? '방을 만들지 못했어요');
            onEnterRoom(data.roomId);
        } catch (e) {
            setMessage(e instanceof Error ? e.message : '서버에 연결할 수 없어요');
        } finally {
            setBusy(false);
        }
    }

    async function joinByCode() {
        const id = code.trim().toUpperCase();
        if (!/^[A-Z0-9]{6}$/.test(id)) {
            setMessage('방 코드는 영어와 숫자 6자리예요');
            return;
        }
        try {
            const info = await (await fetch(`${SERVER_URL}/rooms/${id}`)).json();
            if (!info.exists) setMessage('없는 방 코드예요');
            else if (info.phase !== 'waiting') setMessage('이미 시작된 방이에요');
            else onEnterRoom(id);
        } catch {
            setMessage('서버에 연결할 수 없어요');
        }
    }

    // ── 닉네임부터 ──
    if (editingName) {
        return (
            <section className="online-lobby">
                <h2>닉네임을 정해주세요</h2>
                <p className="info">방 목록과 대국 화면에 이 이름이 보여요. 이 브라우저에 기억해둘게요.</p>
                <div className="row">
                    <input value={nickname} maxLength={12} placeholder="최대 12자" autoFocus
                        onChange={(e) => setNickname(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && confirmName()} />
                    <button className="primary" onClick={confirmName} disabled={!nickname.trim()}>확인</button>
                </div>
                <button onClick={onExit}>처음 화면</button>
            </section>
        );
    }

    return (
        <section className="online-lobby">
            <p className="info">
                닉네임: <strong>{nickname}</strong> <button className="link" onClick={() => setEditingName(true)}>바꾸기</button>
            </p>

            {/* 열린 방 목록 */}
            <div className="lobby-box">
                <h2>열린 방</h2>
                {connection === 'failed' && <p className="error">서버에 연결할 수 없어요. 다시 연결하는 중...</p>}
                {rooms === null ? (
                    <p className="info">불러오는 중...</p>
                ) : rooms.length === 0 ? (
                    <p className="info">지금 열린 방이 없어요. 방을 만들어 보세요!</p>
                ) : (
                    <ul className="room-list">
                        {rooms.map((r) => (
                            <li key={r.roomId}>
                                <div>
                                    <strong>{r.name}</strong>
                                    <span className="info"> · {r.hostNickname} · {ago(r.createdAt)}</span>
                                </div>
                                <button className="primary" onClick={() => onEnterRoom(r.roomId)}>입장</button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* 방 만들기 */}
            <div className="lobby-box">
                <h2>방 만들기</h2>
                <div className="row">
                    <input value={roomName} maxLength={20} placeholder={`${nickname}의 방`}
                        onChange={(e) => setRoomName(e.target.value)} />
                    <button className="primary" onClick={createRoom} disabled={busy}>만들기</button>
                </div>
                <label className="check">
                    <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
                    비공개 방 (목록에 안 보이고, 방 코드로만 들어올 수 있어요)
                </label>
            </div>

            {/* 코드로 들어가기 */}
            <div className="lobby-box">
                <h2>방 코드로 들어가기</h2>
                <div className="row">
                    <input value={code} maxLength={6} placeholder="예: AB12CD"
                        onChange={(e) => setCode(e.target.value.toUpperCase())}
                        onKeyDown={(e) => e.key === 'Enter' && joinByCode()} />
                    <button onClick={joinByCode}>들어가기</button>
                </div>
            </div>

            {message && <p className="error">{message}</p>}
            <button onClick={onExit}>처음 화면</button>
        </section>
    );
}
