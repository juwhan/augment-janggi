// 온라인 대전의 시작: 로비와 대국 방 사이를 오간다.
import { useState } from 'react';
import { getLastRoom } from '../../online/client';
import { OnlineLobby } from './OnlineLobby';
import { OnlineRoom } from './OnlineRoom';

export function Online({ onExit }: { onExit: () => void }) {
    // 새로고침했을 때 들어가 있던 방이 있으면 바로 다시 들어간다
    const [roomId, setRoomId] = useState<string | null>(getLastRoom());

    return roomId ? (
        <OnlineRoom key={roomId} roomId={roomId} onLeave={() => setRoomId(null)} />
    ) : (
        <OnlineLobby onEnterRoom={setRoomId} onExit={onExit} />
    );
}
