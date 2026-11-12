// ───────────────────────────────────────────────
// 온라인 대전: 서버 주소와 이 브라우저의 플레이어 정보
// ───────────────────────────────────────────────

/**
 * 서버 주소. 배포할 때는 Vercel 설정의 환경 변수 VITE_SERVER_URL에 Cloudflare 서버 주소를 넣는다.
 * 없으면 내 컴퓨터에서 띄운 개발용 서버(localhost:8787)를 쓴다.
 */
export const SERVER_URL: string = (import.meta.env.VITE_SERVER_URL as string | undefined) ?? 'http://localhost:8787';

/** WebSocket 주소 (http → ws, https → wss) */
export const WS_URL = SERVER_URL.replace(/^http/, 'ws');

// 브라우저 저장소는 막혀 있을 수 있어서(시크릿 창 등) 항상 try로 감싼다
function read(key: string): string | null {
    try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string) {
    try { localStorage.setItem(key, value); } catch { /* 저장 못 해도 이번 접속 동안은 동작한다 */ }
}

let memoryPlayerId: string | null = null;

/**
 * 이 브라우저의 플레이어 id. 처음 한 번 만들어서 저장해두고 계속 쓴다.
 * 새로고침하거나 잠깐 끊겼다가 다시 들어와도 같은 사람으로 알아보기 위해서다.
 */
export function getPlayerId(): string {
    const saved = read('janggi-player-id');
    if (saved) return saved;
    const id = memoryPlayerId ?? crypto.randomUUID();
    memoryPlayerId = id;
    write('janggi-player-id', id);
    return id;
}

export function getNickname(): string {
    return read('janggi-nickname') ?? '';
}
export function saveNickname(nickname: string) {
    write('janggi-nickname', nickname);
}

/** 마지막으로 들어간 방 (새로고침해도 다시 들어가게) */
export function getLastRoom(): string | null {
    return read('janggi-last-room');
}
export function saveLastRoom(roomId: string | null) {
    try {
        if (roomId) localStorage.setItem('janggi-last-room', roomId);
        else localStorage.removeItem('janggi-last-room');
    } catch { /* 무시 */ }
}
