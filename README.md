# Shorts Intelligence OS

공개 시장 신호로 Shorts 주제를 점수화하고, 사람이 승인한 뒤 제작으로 넘기는 운영 도구입니다. 지금은 **Phase 0–1**까지 열려 있습니다. Niche Radar와 Topic Radar를 Demo Mode로 바로 볼 수 있습니다.

수익을 보장하는 도구가 아닙니다. 점수는 저장된 신호와 공개된 계산식만 사용하며, 빠진 값은 0으로 채우지 않습니다.

## 미리보기에서 로그인하는 곳

브라우저에서 앱을 열면 `/`가 자동으로 **`/login`** 으로 보냅니다.

1. `Demo 워크스페이스로 들어가기`를 누릅니다.
2. 대시보드 → Niche Radar → Topic Radar 순으로 보면 됩니다.

시드가 들어가 있지 않으면 로그인 후 온보딩에서 워크스페이스를 만들 수 있습니다. Demo 화면을 보려면 아래 `pnpm db:seed`를 먼저 실행하세요.

Playbook(수동 NotebookLM 가이드)은 헤더의 **Playbook** 링크 또는 `/playbook`에 있습니다.

## 로컬에서 실행하기

**`bash`는 명령 앞에 붙이지 마세요.** `bash pnpm ...` 이나 `bash DATABASE_URL=...` 는 파일이 없다고 나옵니다. 아래처럼 저장소 폴더에서 한 줄만 실행하면 됩니다.

```bash
cd ~/shorts-studio-ai
bash scripts/start-local.sh
```

`npm install`은 쓰지 마세요. pnpm workspace라서 `package-lock.json`이 생기고 `git pull`이 막힙니다. 이미 그 상태라면:

```bash
rm -f package-lock.json
git checkout -- package-lock.json 2>/dev/null || true
git pull
```

이 스크립트가 pnpm 설치, `.env` 복사, PostgreSQL 확인, 마이그레이션, Demo 시드, 개발 서버를 순서대로 합니다. 끝나면 브라우저에서 http://127.0.0.1:43117/login 을 열고 **Demo 워크스페이스로 들어가기**를 누릅니다.

Node 20 이상과 PostgreSQL 16(`pgcrypto`, `citext`, `vector`)이 필요합니다. 외부 API Key는 Demo Mode에서 필요 없습니다. 단계를 직접 치고 싶다면 아래를 보세요.

### 1. pnpm 설치

이 저장소는 npm이 아니라 **pnpm**을 씁니다. WSL/Ubuntu에서:

```bash
# Node가 이미 있다면 corepack으로 설치 (권장)
corepack enable
corepack prepare pnpm@10.33.3 --activate

# 또는
npm install -g pnpm
```

설치 후 새 터미널을 열거나, `pnpm`을 못 찾으면:

```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
which pnpm
```

### 2. 의존성과 환경변수

```bash
pnpm install
cp .env.example .env
cp .env.example apps/web/.env.local
```

`.env`와 `apps/web/.env.local`의 `DATABASE_URL`만 본인 PostgreSQL에 맞추면 됩니다. CLI(`pnpm db:migrate`)는 두 파일을 자동으로 읽습니다. 셸에 `DATABASE_URL=...`를 따로 붙여넣을 필요는 없습니다.

### 3. PostgreSQL

Docker가 있으면:

```bash
docker compose up -d postgres
```

직접 설치한 PostgreSQL을 쓰면 데이터베이스만 만들면 됩니다.

```bash
sudo -u postgres createdb shorts_os
```

`app_user` 역할은 마이그레이션이 만듭니다. `postgresql-contrib`와 `pgvector`가 있어야 합니다.

```bash
# Ubuntu / WSL
PGV=$(ls /usr/lib/postgresql | sort -n | tail -1)
sudo apt install -y postgresql postgresql-contrib postgresql-$PGV-pgvector
sudo service postgresql start
```

### 4. 마이그레이션, 시드, 개발 서버

```bash
pnpm db:migrate
pnpm db:seed
pnpm --filter @shorts-os/web dev
```

http://localhost:43117 을 열면 로그인 화면이 나옵니다.

## 품질 게이트

```bash
pnpm test
pnpm test:integration   # 실제 DB 필요
pnpm typecheck
pnpm lint
pnpm --filter @shorts-os/web build
```

## 지금 되는 것

- Demo 로그인과 워크스페이스 생성 (RLS로 워크스페이스 격리)
- Niche 등록 후 YouTube 공개 메타데이터 수집 (Demo는 Mock Provider)
- Topic 후보 점수·신뢰도·결측 표시
- Topic 승인 / 보류 / 제외 (단건·일괄)와 Workflow Run 기록
- **Research Brief 생성** (Phase 2A). Gemini Search Grounding으로 출처가 확인된 주장만 남기고, 버전을 쌓습니다
- Settings에서 Provider 상태와 Phase 잠금 Feature Flag 확인

Research는 Demo Mode에서도 돌아가지만, 웹을 읽지 않으므로 **출처와 사실 주장을 만들지 않습니다.** 구성 틀과 확인이 필요한 항목만 나옵니다. 실제 근거를 채우려면 `.env`에 `APP_MODE=live`, `GEMINI_API_KEY`, `GEMINI_RESEARCH_MODEL`을 넣으세요.

아직 구현하지 않은 것: Notebook 동기화, Trends/Ads API, 영상 생성, YouTube 게시. 인터페이스와 Flag만 준비되어 있습니다.

## 구조

```
apps/web          Next.js UI + /api/v1
apps/worker       Phase 4용 골격 (FFmpeg 렌더 스크립트)
packages/config   env, Feature Flag
packages/domain   점수·Confidence·Topic 발견
packages/db       Drizzle 스키마, 마이그레이션, RLS
packages/providers Provider 인터페이스 + Mock + Live YouTube
packages/services 수집 오케스트레이션, Demo Seed
docs/             스펙과 구현 상태
```

자세한 설계는 `docs/SHORTS_INTELLIGENCE_OS_SPEC.md`, 구현 범위는 `docs/IMPLEMENTATION_STATUS.md`를 보세요.
