// ───────────────────────────────────────────────
// 게임 방: 방 하나의 모든 것을 서버에서 관리한다.
//   - 두 플레이어의 연결, 닉네임, 진영
//   - 진영 고르기와 동전 던지기
//   - 게임 상태: 규칙 판정은 화면과 똑같은 코드(src/game, src/augments)를 쓴다
//   - 드래프트: 카드를 서버가 뽑고, 상대가 고른 카드는 둘 다 고를 때까지 숨긴다
//   - 시간 제한: 진영 15초, 드래프트 45초, 한 차례 90초, 끊긴 뒤 돌아오기 60초
//
// 화면이 보낸 수는 그대로 믿지 않고, getLegalMoves로 "둘 수 있는 수인지" 다시 확인한다.
// ───────────────────────────────────────────────
import { DurableObject } from 'cloudflare:workers';
import { createInitialState, opponent } from '../../src/game/board';
import { getLegalMoves } from '../../src/game/moves';
import { applyMove } from '../../src/game/apply';
import { findGeneral } from '../../src/game/actives';
import { AUG } from '../../src/game/augmentIds';
import { drawOffers, finishDraft, pendingDraftPhase, randomPick } from '../../src/augments/draft';
import type { AugmentPhase, DraftPick } from '../../src/augments/registry';
import type { AugmentId, GameState, Move, Team } from '../../src/game/types';
import {
    COIN_FLIP_MS, DRAFT_MS, RECONNECT_MS, SIDE_CHOICE_MS, TURN_MS,
} from '../../src/online/protocol';
import type { ClientMessage, EndReason, RoomPhase, RoomView, ServerMessage } from '../../src/online/protocol';
import type { Env } from './index';

/** 방장이 대기 중에 나갔을 때, 이 시간 안에 안 돌아오면 방을 닫는다 */
const HOST_WAIT_RECONNECT_MS = 30_000;

interface Player {
    playerId: string;
    nickname: string;
    team: Team | null;
    connected: boolean;
    disconnectedAt: number | null;
}

/** 서버에 저장하는 방 정보 전체 */
interface RoomData {
    roomId: string;
    name: string;
    isPrivate: boolean;
    createdAt: number;
    players: Player[];                       // [0]은 방장
    phase: RoomPhase;
    sideChoices: Record<string, Team | 'any' | null>;
    sideDeadline: number;
    coin: { face: Team; startedAt: number } | null;
    game: GameState | null;
    draft: {
        phase: AugmentPhase;
        offers: Record<Team, AugmentId[]>;
        picks: Record<Team, DraftPick | null>;
        done: Record<Team, boolean>;
        deadline: number;
    } | null;
    turnDeadline: number | null;
    /** 차례 시간을 새로 재야 하는지 판단하는 기준 (넘어간 차례 수) */
    turnKey: number;
    result: { winner: Team | null; reason: EndReason } | null;
    lastMove: Move | null;
}

/** 두 수가 같은 수인지 (화면이 보낸 수를 규칙이 만든 수와 비교) */
function sameMove(a: Move, b: Move): boolean {
    return a.from.row === b.from.row && a.from.col === b.from.col
        && a.to.row === b.to.row && a.to.col === b.to.col
        && (a.augment ?? null) === (b.augment ?? null)
        && (a.pieceType ?? null) === (b.pieceType ?? null)
        && !!a.pass === !!b.pass;
}

export class GameRoom extends DurableObject<Env> {
    private data: RoomData | null = null;

    // ── 저장과 불러오기 ──
    // 서버는 한동안 조용하면 메모리를 비우고 "휴면"한다. 그래서 매번 저장소에서 불러온다.
    private async load(): Promise<RoomData | null> {
        if (!this.data) this.data = (await this.ctx.storage.get<RoomData>('room')) ?? null;
        return this.data;
    }
    private async save() {
        if (this.data) await this.ctx.storage.put('room', this.data);
    }

    private lobby() {
        return this.env.LOBBY.get(this.env.LOBBY.idFromName('lobby'));
    }

    // ───────────────────────────────────────────────
    // 방 만들기 / 정보 (서버 입구가 부른다)
    // ───────────────────────────────────────────────
    async init(p: { roomId: string; name: string; isPrivate: boolean; hostId: string; hostNickname: string }) {
        const now = Date.now();
        this.data = {
            roomId: p.roomId,
            name: p.name,
            isPrivate: p.isPrivate,
            createdAt: now,
            // 방장은 아직 연결 전이라 connected=false. 대기실 화면이 연결해 오면 true가 된다.
            players: [{ playerId: p.hostId, nickname: p.hostNickname, team: null, connected: false, disconnectedAt: now }],
            phase: 'waiting',
            sideChoices: {},
            sideDeadline: 0,
            coin: null,
            game: null,
            draft: null,
            turnDeadline: null,
            turnKey: -1,
            result: null,
            lastMove: null,
        };
        await this.save();
        if (!p.isPrivate) {
            await this.lobby().upsert({ roomId: p.roomId, name: p.name, hostNickname: p.hostNickname, createdAt: now });
        }
        await this.scheduleAlarm();
    }

    async info() {
        const d = await this.load();
        if (!d) return { exists: false };
        return { exists: true, name: d.name, phase: d.phase, players: d.players.length, isPrivate: d.isPrivate };
    }

    // ───────────────────────────────────────────────
    // 연결
    // ───────────────────────────────────────────────
    async fetch(request: Request): Promise<Response> {
        if (request.headers.get('Upgrade') !== 'websocket') {
            return new Response('WebSocket 연결이 필요해요', { status: 426 });
        }
        const url = new URL(request.url);
        const playerId = (url.searchParams.get('playerId') ?? '').slice(0, 64);
        const nickname = (url.searchParams.get('nickname') ?? '').trim().slice(0, 12) || '손님';

        const pair = new WebSocketPair();
        const [client, server] = [pair[0], pair[1]];
        this.ctx.acceptWebSocket(server, [playerId]); // 연결에 플레이어 id를 꼬리표로 붙여둔다

        const d = await this.load();
        const reject = (message: string) => {
            const msg: ServerMessage = { type: 'error', message };
            server.send(JSON.stringify(msg));
            server.close(4000, 'rejected');
            return new Response(null, { status: 101, webSocket: client });
        };
        if (!d) return reject('없는 방이에요');
        if (!playerId) return reject('플레이어 정보가 없어요');

        const now = Date.now();
        let player = d.players.find((p) => p.playerId === playerId);
        if (player) {
            // 다시 들어온 사람 (새로고침, 잠깐 끊김). 예전 연결이 남아 있으면 닫는다.
            for (const ws of this.ctx.getWebSockets(playerId)) {
                if (ws !== server) try { ws.close(4001, 'replaced'); } catch { /* 무시 */ }
            }
            player.connected = true;
            player.disconnectedAt = null;
        } else if (d.phase === 'waiting' && d.players.length === 1) {
            // 두 번째 사람 입장 → 진영 고르기 시작, 로비 목록에서 내린다
            player = { playerId, nickname, team: null, connected: true, disconnectedAt: null };
            d.players.push(player);
            d.phase = 'choosingSide';
            d.sideChoices = {};
            d.sideDeadline = now + SIDE_CHOICE_MS;
            if (!d.isPrivate) await this.lobby().remove(d.roomId);
        } else if (d.phase === 'finished') {
            return reject('이미 끝난 방이에요');
        } else {
            return reject('이미 두 명이 들어와 있는 방이에요');
        }

        await this.save();
        await this.scheduleAlarm();
        this.broadcast();
        return new Response(null, { status: 101, webSocket: client });
    }

    async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
        const d = await this.load();
        if (!d) return;
        const playerId = this.ctx.getTags(ws)[0];
        const player = d.players.find((p) => p.playerId === playerId);
        if (!player) return;

        let msg: ClientMessage;
        try {
            msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
        } catch {
            return;
        }

        const error = this.handle(d, player, msg);
        if (error) {
            const out: ServerMessage = { type: 'error', message: error };
            ws.send(JSON.stringify(out));
            return;
        }
        await this.save();
        await this.scheduleAlarm();
        this.broadcast();
    }

    async webSocketClose(ws: WebSocket) {
        await this.onDisconnect(ws);
    }
    async webSocketError(ws: WebSocket) {
        await this.onDisconnect(ws);
    }

    private async onDisconnect(ws: WebSocket) {
        const d = await this.load();
        if (!d) return;
        const playerId = this.ctx.getTags(ws)[0];
        // 같은 사람의 다른 연결이 아직 살아 있으면(새 탭 등) 끊긴 게 아니다
        const stillOpen = this.ctx.getWebSockets(playerId).some((s) => s !== ws && s.readyState === WebSocket.OPEN);
        const player = d.players.find((p) => p.playerId === playerId);
        if (!player || stillOpen) return;
        player.connected = false;
        player.disconnectedAt = Date.now();
        await this.save();
        await this.scheduleAlarm();
        this.broadcast();
    }

    // ───────────────────────────────────────────────
    // 메시지 처리. 문제가 있으면 오류 문구를, 없으면 null을 돌려준다.
    // ───────────────────────────────────────────────
    private handle(d: RoomData, player: Player, msg: ClientMessage): string | null {
        const now = Date.now();
        switch (msg.type) {
            case 'chooseSide': {
                if (d.phase !== 'choosingSide') return '지금은 진영을 고를 때가 아니에요';
                if (msg.team !== 'cho' && msg.team !== 'han' && msg.team !== 'any') return '잘못된 진영이에요';
                d.sideChoices[player.playerId] = msg.team;
                if (d.players.every((p) => d.sideChoices[p.playerId])) this.resolveSides(d, now);
                return null;
            }
            case 'pick': {
                if (d.phase !== 'playing' || !d.draft || !player.team) return '지금은 증강을 고를 때가 아니에요';
                const team = player.team;
                if (d.draft.done[team]) return '이미 골랐어요';
                const pick = msg.pick;
                if (pick && !d.draft.offers[team].includes(pick.id)) return '받은 카드가 아니에요';
                d.draft.picks[team] = pick ? { id: pick.id, choice: Math.max(0, Math.floor(pick.choice || 0)) } : null;
                d.draft.done[team] = true;
                this.tryFinishDraft(d, now);
                return null;
            }
            case 'move': {
                const g = d.game;
                if (d.phase !== 'playing' || !g || d.draft) return '지금은 둘 수 없어요';
                if (player.team !== g.turn) return '상대 차례예요';
                const legal = getLegalMoves(g).find((m) => sameMove(m, msg.move));
                if (!legal) return '둘 수 없는 수예요';
                d.game = applyMove(g, legal);
                if (!legal.pass) d.lastMove = legal;
                this.afterGameChange(d, now);
                return null;
            }
            case 'resign': {
                if (d.phase !== 'playing' || !player.team) return null;
                this.finish(d, opponent(player.team), 'resign');
                return null;
            }
        }
        return null;
    }

    // ── 진영 정하기 ──
    // 서로 다르면 그대로, "상관없음"은 남는 쪽으로, 같거나 둘 다 상관없으면 동전 던지기.
    private resolveSides(d: RoomData, now: number) {
        const [host, guest] = d.players;
        const a = d.sideChoices[host.playerId] ?? 'any';
        const b = d.sideChoices[guest.playerId] ?? 'any';
        if (a !== 'any' && b !== 'any' && a !== b) {
            host.team = a;
            guest.team = b;
        } else if (a !== 'any' && b === 'any') {
            host.team = a;
            guest.team = opponent(a);
        } else if (a === 'any' && b !== 'any') {
            guest.team = b;
            host.team = opponent(b);
        } else {
            // 동전: 나온 면의 진영을 방장이 갖는다
            const face: Team = crypto.getRandomValues(new Uint8Array(1))[0] % 2 === 0 ? 'cho' : 'han';
            host.team = face;
            guest.team = opponent(face);
            d.coin = { face, startedAt: now };
            d.phase = 'coinFlip';
            return; // 애니메이션이 끝나면(알람) 게임을 시작한다
        }
        this.startGame(d, now);
    }

    private startGame(d: RoomData, now: number) {
        d.phase = 'playing';
        d.game = createInitialState();
        d.turnKey = -1;
        this.afterGameChange(d, now);
    }

    // ── 게임 상태가 바뀐 뒤: 끝났는지, 드래프트를 열지, 차례 시간을 새로 잴지 ──
    private afterGameChange(d: RoomData, now: number) {
        const g = d.game!;
        if (g.winner !== null || g.isDraw) {
            this.finish(d, g.winner, g.isDraw ? 'draw' : this.winReason(g));
            return;
        }
        const phase = pendingDraftPhase(g);
        if (phase && !d.draft) {
            const offers = drawOffers(g, phase);
            d.draft = {
                phase,
                offers,
                picks: { cho: null, han: null },
                done: { cho: offers.cho.length === 0, han: offers.han.length === 0 },
                deadline: now + DRAFT_MS,
            };
            d.turnDeadline = null;
            this.tryFinishDraft(d, now);
            return;
        }
        if (d.draft) return;
        // 차례가 넘어갔으면 시간을 새로 잰다 (추가 이동은 같은 차례라 그대로)
        if (g.moveCount !== d.turnKey || d.turnDeadline === null) {
            d.turnKey = g.moveCount;
            d.turnDeadline = now + TURN_MS;
        }
    }

    private tryFinishDraft(d: RoomData, now: number) {
        if (!d.draft || !d.draft.done.cho || !d.draft.done.han) return;
        d.game = finishDraft(d.game!, d.draft.picks);
        d.draft = null;
        d.turnDeadline = null; // 드래프트가 끝나면 차례 시간을 새로 잰다
        this.afterGameChange(d, now);
    }

    /** 승리 이유 추측: 진 쪽 궁이 없으면 궁을 잡은 것, 진군 승리 증강이면 진군, 아니면 둘 수 없음 */
    private winReason(g: GameState): EndReason {
        const loser = opponent(g.winner!);
        if (!findGeneral(g.board, loser)) return 'general';
        if (g.augments[g.winner!].includes(AUG.MARCH_VICTORY)) return 'march';
        return 'noMoves';
    }

    private finish(d: RoomData, winner: Team | null, reason: EndReason) {
        d.phase = 'finished';
        d.result = { winner, reason };
        d.draft = null;
        d.turnDeadline = null;
    }

    // ───────────────────────────────────────────────
    // 시간 제한: 가장 가까운 마감 시각에 알람을 하나 맞춰두고, 울리면 지난 것들을 처리한다.
    // ───────────────────────────────────────────────
    private deadlines(d: RoomData): number[] {
        const list: number[] = [];
        if (d.phase === 'choosingSide') list.push(d.sideDeadline);
        if (d.phase === 'coinFlip' && d.coin) list.push(d.coin.startedAt + COIN_FLIP_MS);
        if (d.phase === 'playing') {
            if (d.draft) list.push(d.draft.deadline);
            if (d.turnDeadline) list.push(d.turnDeadline);
        }
        if (d.phase !== 'finished') {
            for (const p of d.players) {
                if (p.disconnectedAt === null) continue;
                list.push(p.disconnectedAt + (d.phase === 'waiting' ? HOST_WAIT_RECONNECT_MS : RECONNECT_MS));
            }
        }
        return list;
    }

    private async scheduleAlarm() {
        const d = this.data;
        if (!d) return;
        const list = this.deadlines(d);
        if (list.length === 0) await this.ctx.storage.deleteAlarm();
        else await this.ctx.storage.setAlarm(Math.min(...list));
    }

    async alarm() {
        const d = await this.load();
        if (!d) return;
        const now = Date.now();

        // 1. 연결이 끊긴 채 돌아오지 않았다
        for (const p of d.players) {
            if (p.disconnectedAt === null || d.phase === 'finished') continue;
            if (d.phase === 'waiting') {
                if (now >= p.disconnectedAt + HOST_WAIT_RECONNECT_MS) {
                    // 대기 중인 방장이 사라졌다 → 방 닫기
                    d.phase = 'finished';
                    if (!d.isPrivate) await this.lobby().remove(d.roomId);
                }
            } else if (now >= p.disconnectedAt + RECONNECT_MS) {
                const other = d.players.find((q) => q !== p);
                this.finish(d, other?.team ?? null, 'disconnect');
            }
        }

        // 2. 진영 고르기 시간 끝 → 안 고른 사람은 "상관없음"
        if (d.phase === 'choosingSide' && now >= d.sideDeadline) {
            for (const p of d.players) d.sideChoices[p.playerId] ??= 'any';
            this.resolveSides(d, now);
        }

        // 3. 동전 애니메이션 끝 → 게임 시작
        if (d.phase === 'coinFlip' && d.coin && now >= d.coin.startedAt + COIN_FLIP_MS) {
            this.startGame(d, now);
        }

        // 4. 드래프트 시간 끝 → 안 고른 사람은 무작위
        if (d.phase === 'playing' && d.draft && now >= d.draft.deadline) {
            for (const team of ['cho', 'han'] as Team[]) {
                if (!d.draft.done[team]) {
                    d.draft.picks[team] = randomPick(d.draft.offers[team]);
                    d.draft.done[team] = true;
                }
            }
            this.tryFinishDraft(d, now);
        }

        // 5. 차례 시간 끝 → 그 차례인 사람이 진다
        if (d.phase === 'playing' && !d.draft && d.turnDeadline && now >= d.turnDeadline && d.game) {
            this.finish(d, opponent(d.game.turn), 'timeout');
        }

        await this.save();
        await this.scheduleAlarm();
        this.broadcast();
    }

    // ───────────────────────────────────────────────
    // 화면에 보내기: 플레이어마다 볼 수 있는 것만 담아서 보낸다
    // ───────────────────────────────────────────────
    private viewFor(d: RoomData, playerId: string): RoomView {
        const me = d.players.find((p) => p.playerId === playerId)!;
        const other = d.players.find((p) => p.playerId !== playerId) ?? null;
        const myTeam = me.team;
        const draft = d.draft && myTeam ? {
            phase: d.draft.phase,
            myOffers: d.draft.offers[myTeam],
            myPicked: d.draft.done[myTeam],
            opponentPicked: d.draft.done[opponent(myTeam)],
            deadline: d.draft.deadline,
        } : null;
        return {
            roomId: d.roomId,
            name: d.name,
            isPrivate: d.isPrivate,
            phase: d.phase,
            you: { nickname: me.nickname, team: myTeam, isHost: d.players[0].playerId === playerId },
            opponent: other ? { nickname: other.nickname, connected: other.connected } : null,
            sideChoice: d.phase === 'choosingSide' ? {
                mine: d.sideChoices[playerId] ?? null,
                opponentChosen: !!(other && d.sideChoices[other.playerId]),
                deadline: d.sideDeadline,
            } : null,
            coin: d.coin,
            game: d.game,
            lastMove: d.lastMove,
            draft,
            turnDeadline: d.turnDeadline,
            opponentReconnectDeadline: other && other.disconnectedAt !== null && d.phase !== 'waiting' && d.phase !== 'finished'
                ? other.disconnectedAt + RECONNECT_MS : null,
            result: d.result,
            serverTime: Date.now(),
        };
    }

    private broadcast() {
        const d = this.data;
        if (!d) return;
        for (const p of d.players) {
            const view: ServerMessage = { type: 'state', view: this.viewFor(d, p.playerId) };
            const text = JSON.stringify(view);
            for (const ws of this.ctx.getWebSockets(p.playerId)) {
                try { ws.send(text); } catch { /* 닫힌 연결 무시 */ }
            }
        }
    }
}
