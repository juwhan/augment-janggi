// ───────────────────────────────────────────────
// 로비: 공개된 대기 방 목록을 들고, 보고 있는 사람들에게 실시간으로 보내준다.
// 방이 열리거나(upsert) 차거나 닫히면(remove) 게임 방이 로비에 알려준다.
// ───────────────────────────────────────────────
import { DurableObject } from 'cloudflare:workers';
import type { RoomSummary, ServerMessage } from '../../src/online/protocol';
import type { Env } from './index';

/** 이보다 오래된 방은 혹시 남아 있어도 목록에서 지운다 (안전장치) */
const STALE_MS = 2 * 60 * 60 * 1000;

export class Lobby extends DurableObject<Env> {
    private async getRooms(): Promise<Record<string, RoomSummary>> {
        return (await this.ctx.storage.get<Record<string, RoomSummary>>('rooms')) ?? {};
    }

    /** 목록을 보고 있는 모든 사람에게 새 목록을 보낸다 */
    private async broadcast() {
        const rooms = await this.getRooms();
        const now = Date.now();
        const list = Object.values(rooms)
            .filter((r) => now - r.createdAt < STALE_MS)
            .sort((a, b) => b.createdAt - a.createdAt);
        const msg: ServerMessage = { type: 'lobby', rooms: list };
        const text = JSON.stringify(msg);
        for (const ws of this.ctx.getWebSockets()) {
            try { ws.send(text); } catch { /* 이미 닫힌 연결은 무시 */ }
        }
        return text;
    }

    /** 방 목록 화면이 연결해올 때 */
    async fetch(request: Request): Promise<Response> {
        if (request.headers.get('Upgrade') !== 'websocket') {
            return new Response('WebSocket 연결이 필요해요', { status: 426 });
        }
        const pair = new WebSocketPair();
        // acceptWebSocket: 연결을 "휴면" 방식으로 받는다. 메시지가 없을 때는 요금이 붙지 않는다.
        this.ctx.acceptWebSocket(pair[1]);
        const rooms = await this.getRooms();
        const msg: ServerMessage = {
            type: 'lobby',
            rooms: Object.values(rooms).sort((a, b) => b.createdAt - a.createdAt),
        };
        pair[1].send(JSON.stringify(msg));
        return new Response(null, { status: 101, webSocket: pair[0] });
    }

    // 로비에 연결한 사람은 보내는 게 없다. 받기만 한다.
    async webSocketMessage() {}
    async webSocketClose(ws: WebSocket) {
        try { ws.close(); } catch { /* 무시 */ }
    }

    /** 방이 열렸을 때 (게임 방이 부른다) */
    async upsert(room: RoomSummary) {
        const rooms = await this.getRooms();
        rooms[room.roomId] = room;
        await this.ctx.storage.put('rooms', rooms);
        await this.broadcast();
    }

    /** 방이 찼거나 닫혔을 때 (게임 방이 부른다) */
    async remove(roomId: string) {
        const rooms = await this.getRooms();
        if (!rooms[roomId]) return;
        delete rooms[roomId];
        await this.ctx.storage.put('rooms', rooms);
        await this.broadcast();
    }
}
