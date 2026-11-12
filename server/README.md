# 온라인 대전 서버 (Cloudflare Workers)

온라인 1대1 대국의 방과 로비를 맡는 서버예요.
판의 진짜 상태는 서버가 들고 있고, 수가 규칙에 맞는지도 서버가 확인해요. (`src/game`의 규칙 코드를 그대로 같이 써요)

- `src/index.ts` : 주소별로 요청을 나눠 주는 입구
- `src/lobby.ts` : 열린 방 목록 (로비 하나)
- `src/room.ts` : 대국 방 하나 (진영 고르기, 동전, 드래프트, 수, 시간 제한, 연결 끊김)
- `../src/online/protocol.ts` : 서버와 화면이 주고받는 메시지 모양 (양쪽이 같이 씀)

## 내 컴퓨터에서 같이 켜 보기

터미널 두 개를 열어요.

```bash
# 터미널 1: 서버 (http://localhost:8787)
npm run server:dev

# 터미널 2: 화면 (http://localhost:5173)
npm run dev
```

브라우저 창을 두 개 열어서 (하나는 시크릿 창) 둘 다 `온라인 대전`으로 들어가면 혼자서도 대국을 시험해 볼 수 있어요.
시크릿 창을 쓰는 이유: 같은 브라우저 창 두 개는 같은 사람으로 인식돼요.

## 인터넷에 올리기 (처음 한 번)

1. https://dash.cloudflare.com 에서 무료 가입
2. 프로젝트 폴더에서 로그인 (브라우저가 열리면 허락)
   ```bash
   npx wrangler login
   ```
3. 서버 올리기
   ```bash
   npm run server:deploy
   ```
   끝나면 `https://augment-janggi-server.<내 아이디>.workers.dev` 같은 주소가 나와요. 이 주소를 복사해 둬요.
4. Vercel 대시보드 → 프로젝트 → Settings → Environment Variables 에
   - 이름: `VITE_SERVER_URL`
   - 값: 3번에서 복사한 주소 (끝에 `/` 없이)
5. Vercel에서 Redeploy (또는 아무 커밋이나 push)

이후로 서버 코드(`server/`, `src/game`, `src/augments`)를 고치면 `npm run server:deploy`를 다시 해야 해요.
화면 코드는 지금처럼 GitHub에 push하면 Vercel이 알아서 올려요.
규칙 코드를 고쳤을 땐 **둘 다** 올려야 화면과 서버의 규칙이 같아져요.
