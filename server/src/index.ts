// ───────────────────────────────────────────────
// 서버 입구 (Cloudflare Worker)
// 들어온 요청을 보고 로비나 게임 방으로 보내주는 "안내 데스크" 역할만 한다.
//
//   GET  /lobby                    로비 연결 (방 목록을 실시간으로 받는다, WebSocket)
//   POST /rooms                    방 만들기 → { roomId }
//   GET  /rooms/:id                방이 있는지, 들어갈 수 있는지 확인
//   GET  /rooms/:id/ws             방 연결 (WebSocket)
// ───────────────────────────────────────────────
import { Lobby } from './lobby';
import { GameRoom } from './room';

export { Lobby, GameRoom };

export interface Env {
    LOBBY: DurableObjectNamespace<Lobby>;
    ROOM: DurableObjectNamespace<GameRoom>;
}

// 다른 주소(Vercel 사이트)에서 오는 요청도 받도록 허용하는 헤더
const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

/** 헷갈리는 글자(0/O, 1/I)를 뺀 6자리 방 코드 */
function makeRoomId(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    return [...bytes].map((b) => chars[b % chars.length]).join('');
}

/** 이름·닉네임 정리: 앞뒤 공백 제거, 길이 제한 */
const clean = (s: unknown, max: number) => String(s ?? '').trim().slice(0, max);

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

        // 로비 연결: 로비는 하나뿐이라 이름 'lobby'로 항상 같은 것을 쓴다
        if (url.pathname === '/lobby') {
            return env.LOBBY.get(env.LOBBY.idFromName('lobby')).fetch(request);
        }

        // 방 만들기
        if (url.pathname === '/rooms' && request.method === 'POST') {
            const body = await request.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
            const nickname = clean(body.nickname, 12);
            const playerId = clean(body.playerId, 64);
            if (!nickname || !playerId) return json({ error: '닉네임이 필요해요' }, 400);
            const name = clean(body.name, 20) || `${nickname}의 방`;
            const roomId = makeRoomId();
            const room = env.ROOM.get(env.ROOM.idFromName(roomId));
            await room.init({ roomId, name, isPrivate: body.isPrivate === true, hostId: playerId, hostNickname: nickname });
            return json({ roomId });
        }

        // /rooms/:id 또는 /rooms/:id/ws
        const match = url.pathname.match(/^\/rooms\/([A-Z0-9]{6})(\/ws)?$/);
        if (match) {
            const room = env.ROOM.get(env.ROOM.idFromName(match[1]));
            if (match[2]) return room.fetch(request);
            return json(await room.info());
        }

        return json({ error: '없는 주소예요' }, 404);
    },
} satisfies ExportedHandler<Env>;
