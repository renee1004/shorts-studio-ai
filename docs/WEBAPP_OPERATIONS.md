# 웹앱 실행 및 남은 연결 작업

## 개인 PC에서 바로 실행

Node 22, Docker Desktop을 설치하고 Docker를 실행합니다. 저장소 폴더에서:

```bash
node scripts/start-docker.mjs
```

완료 후 http://localhost:43117 에서 **Demo 워크스페이스로 들어가기**를 누릅니다.
주제 발굴 → 주제 승인 → 자료 조사 → Content Studio 대본·Shot·QA·승인 →
Video Factory 클립 업로드 또는 Placeholder 합성 → MP4 확인·다운로드 순서입니다.
Demo 조사는 실제 출처를 생성하지 않습니다. 생성형 AI 영상과 YouTube 게시는 아직 제공하지 않습니다.

시작 스크립트는 `.env.docker`가 없을 때만 비밀번호를 생성합니다. 이 파일을 GitHub에 올리지 마세요.
재실행해도 기존 DB와 영상은 유지됩니다. 운영 중 `.env.docker`를 삭제하면 기존 DB 비밀번호와
불일치할 수 있으므로 파일과 볼륨을 함께 백업해야 합니다.

```bash
# 상태와 로그
docker compose --env-file .env.docker -f compose.webapp.yml ps
docker compose --env-file .env.docker -f compose.webapp.yml logs --tail 100 web worker setup
# 중지 (볼륨은 유지)
docker compose --env-file .env.docker -f compose.webapp.yml down
```

`down -v`는 DB와 영상을 삭제하므로 사용하지 마세요.
호스트에서 PostgreSQL·FFmpeg·pnpm을 별도로 설치할 필요는 없습니다.
웹만 127.0.0.1에 노출되며 DB와 Worker는 내부 네트워크에서 연결됩니다.
웹·Worker 모두 `/data/media` 볼륨을 사용합니다. 이 구성은 단일 서버용이며
서버 여러 대로 확장하려면 공용 미디어 저장소를 추가해야 합니다.

## 실제 계정과 API 연결

Supabase Auth에서 이메일·비밀번호 계정을 준비한 뒤 `.env.docker`에 설정합니다.
키와 비밀번호는 채팅이나 저장소에 붙이지 말고 배포 환경변수에 입력합니다.

```dotenv
AUTH_PROVIDER=supabase
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_ANON_OR_PUBLISHABLE_KEY
APP_MODE=live
YOUTUBE_API_KEY=YOUR_YOUTUBE_API_KEY
GEMINI_API_KEY=YOUR_GEMINI_API_KEY
GEMINI_RESEARCH_MODEL=YOUR_AVAILABLE_MODEL
FEATURE_FLAGS_OVERRIDE={"geminiResearch":true}
```

위 값은 예시이며 실제로 발급받은 값으로 교체해야 합니다. Supabase Auth와 로컬 PostgreSQL은
함께 사용할 수 있습니다(`DB_TARGET=local` 유지). 초기 계정은 관리자 생성 방식입니다.
이메일 로그인은 Supabase의 password grant와 `/user` 검증을 사용합니다.
토큰은 HttpOnly 쿠키에 저장하며 만료되면 다시 로그인해야 합니다. 자동 갱신·가입·비밀번호
복구 화면은 포함하지 않습니다. 첫 로그인 후 온보딩에서 새 워크스페이스를 생성합니다.

Supabase DB를 사용하려면 별도 배포 구성이 필요합니다. `DB_TARGET=supabase`와 관리자용
`DATABASE_URL`, `authenticated` 역할 전환 권한이 있는 서버 전용 `DATABASE_APP_URL`을 설정합니다.
사용자 ID는 로컬 및 Supabase 양쪽 `auth.uid()`가 읽는 트랜잭션 설정에 전달됩니다.
기존 `.env.example`의 Demo 계정은 Live 모드에서 허용하지 않습니다.

## 인터넷에서 접속하는 운영 서버

현재 구성은 PC에서 사용하는 웹앱입니다. 외부 접속 URL은 배포 서버가 있어야 생깁니다.
Docker가 가능한 서버, 영구 디스크, HTTPS 도메인/프록시를 준비하고 실제 계정 인증을 연결한 뒤
웹 포트의 노출 범위를 서버 구성에 맞게 지정합니다. Demo 로그인을 인터넷에 공개하지 마세요.
Supabase 연결 없이 `APP_MODE=live`만 바꾸면 설정 오류로 중단됩니다.

## 검증과 복구 범위

GitHub Actions는 단위 테스트, 타입·린트, 실제 PostgreSQL 마이그레이션·시드·통합 테스트,
웹/Worker 빌드와 운영 웹 화면 HTTP 검사를 수행합니다. Docker 이미지 자체의 실행 검증은
Docker가 가능한 환경에서 시작 스크립트로 별도 수행해야 합니다.

Worker는 DB의 queued 작업을 주기적으로 처리합니다. 웹 요청 전달이 실패해도 대기 작업은
다시 처리됩니다. 동일 작업은 원자적으로 실행 권한을 얻어 중복 실행하지 않습니다.
프로세스가 **렌더 도중 강제 종료되어 running으로 남은 작업**의 자동 복구는 미구현입니다.
관리자가 실행 프로세스가 없는지 확인한 뒤 복구해야 하며, 실행 중인 작업을 임의로 재시작하면 안 됩니다.

## 별도로 남은 기능

- 실제 AI 영상 생성 Provider
- YouTube OAuth 업로드·예약 게시
- Notebook Enterprise 연동
- 예산 상한과 실제 비용 대시보드
- 클라우드 미디어 저장소·다중 서버 운영·실행 중 작업의 임대/재시도

이 문서는 위 기능이 완료되었다고 주장하지 않습니다. 현재 변경은 기존 Phase 0–4의
실행 경로, 인증 연결, 빌드, 저장 경로, 렌더 중복 방지와 자동 검증을 보완합니다.

인증 API 기준: https://github.com/supabase/auth#post-token 및 https://github.com/supabase/auth#get-user
