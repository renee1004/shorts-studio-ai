# Implementation Status

- 기준 문서: `docs/SHORTS_INTELLIGENCE_OS_SPEC.md`
- 최근 갱신: 2026-09-03
- 완료 Phase: **Phase 0, Phase 1, Phase 1.5 보완, Phase 2A (Research Brain), Phase 3 Demo, Phase 3.1, Phase 4 Video Factory**
- 다음: Phase 5 Human Approval과 YouTube 게시. Phase 2 Live / Notebook / 운영 비용 대시보드 / 배포는 DEFERRED_AFTER_DEMO

---

## 1. 실행 방법

로컬 PostgreSQL 16이 필요합니다. Supabase 자격증명은 없어도 됩니다.

```bash
corepack enable && corepack prepare pnpm@10.33.3 --activate
pnpm install
cp .env.example .env
cp .env.example apps/web/.env.local   # DATABASE_URL만 맞추면 됩니다
docker compose up -d postgres         # 또는 로컬 PostgreSQL 16
pnpm db:migrate
pnpm db:seed
pnpm --filter @shorts-os/web dev      # http://localhost:43117/login
```

브라우저에서 열면 `/`가 `/login`으로 보냅니다. `Demo 워크스페이스로 들어가기`를 누르면 시드 데이터로 전체 흐름을 볼 수 있습니다. `pnpm db:migrate`와 `pnpm db:seed`는 `.env` / `apps/web/.env.local`을 자동으로 읽습니다.

품질 게이트:

```bash
pnpm test              # 단위 56개
pnpm test:integration  # 실제 DB 통합 6개 (DATABASE_URL, DATABASE_APP_URL 필요)
pnpm --filter @shorts-os/web typecheck
pnpm --filter @shorts-os/web lint
pnpm --filter @shorts-os/web build
```

---

## 2. Phase 0 완료 조건 대조

| 완료 조건 | 상태 | 근거 |
|---|---|---|
| 로그인 후 Workspace 생성 가능 | 완료 | `/login` → `/onboarding` → `create_workspace_with_owner` RPC 호출 |
| 다른 Workspace 데이터 접근 차단 테스트 통과 | 완료 | `packages/services/src/integration/isolation.test.ts` 4개 케이스 |
| Demo Mode에서 외부 Key 없이 실행 | 완료 | `APP_MODE=demo` + `MockYouTubeProvider` + 고정 시드 |
| lint, typecheck, unit test, build 통과 | 완료 | 위 게이트 명령 전부 통과 |
| Secret이 Client bundle에 포함되지 않음 | 완료 | 서버 전용 `packages/config/src/env.ts`는 `apps/web/src/server/**`에서만 import |

구현된 항목: pnpm/Turborepo 모노레포, Next.js Web + Worker 골격, TypeScript strict(+`noUncheckedIndexedAccess`), Drizzle 스키마와 SQL 마이그레이션, RLS 테스트, Provider 인터페이스와 Mock, env 검증, Pino 구조화 로깅과 requestId, Demo Seed, Sidebar와 Dashboard 셸.

## 3. Phase 1 완료 조건 대조

| 완료 조건 | 상태 | 근거 |
|---|---|---|
| Demo와 실제 YouTube Provider를 설정으로 전환 가능 | 완료 | `ProviderRegistry`가 `APP_MODE`와 Key 유무로 Mock/Live 선택 |
| 외부 값이 null일 때 가짜 0이 생성되지 않음 | 완료 | `computeScore` 재정규화, 단위 테스트 + DB 검증(`normalized_score is null`) |
| Score Breakdown 합계가 결과와 일치 | 완료 | `score.test.ts`의 기여도 합계 검증 |
| 같은 Idempotency Key 재호출이 중복 Run을 만들지 않음 | 완료 | `startWorkflowRun` + 부분 유니크 인덱스, 통합 테스트로 확인 |
| Provider 429/5xx Mock 테스트 통과 | 완료 | `mock/youtube.test.ts` 9개 (429·503·401·쿼터 초과) |
| Top Topic을 승인할 수 있음 | 완료 | Topic Radar 결정 버튼 + 상태 전이 검증 + Audit Log |

Phase 1 메뉴는 Dashboard, Niche Radar, Topic Radar, Runs, Settings입니다. Phase 2A에 Research, Phase 3 Demo에 DNA Library와 Content Studio가 추가됩니다. 사이드바는 lg 이상에서만 보이므로 작은 화면에는 같은 목록을 가로 스크롤 상단 바로 제공합니다(`components/product/mobile-nav.tsx`).

구현된 항목: Niche CRUD, Score Config 버전 관리, YouTube Data Provider(쿼터 회계·캐시·배치·타임아웃·재시도), Metric Snapshot, View Velocity와 Breakout 판단, Topic 클러스터, 설명형 Score와 Confidence, Niche·Topic 화면, Topic 승인·보류·제외(단건·최대 50건 일괄), Workflow Run 화면.

---

## 3.5 Phase 1.5 보완

**쿼터 사용량을 메모리에서 DB로 옮겼습니다.** `createQuotaLedger`는 있었지만 수집이 쓰지 않아, Provider 인스턴스 메모리에만 남았습니다. 서버를 재시작하면 그날 쓴 사용량이 0으로 돌아가는데 실제 API 호출은 이미 소비된 상태였습니다. 이제 수집이 `integrations.quota_snapshot`에 증가분을 누적하고, 저장할 `integrations` 행이 없으면 경고를 남깁니다(조용히 넘기지 않습니다).

**Runs 화면을 메뉴에 넣었습니다.** `/runs`는 있었지만 사이드바에 없어 주소를 직접 입력해야 열렸습니다.

**작은 화면 내비게이션을 추가했습니다.** 사이드바가 `lg` 이상에서만 보이는데 대체 메뉴가 없어 모바일에서는 화면 이동과 세션 종료가 불가능했습니다. 같은 메뉴 목록을 쓰는 가로 스크롤 상단 바를 넣었습니다.

**GPU 없는 환경의 스크롤 멈춤을 고쳤습니다.** 고정 헤더의 `backdrop-filter`와 `background-attachment: fixed` 그라디언트가 스크롤 프레임마다 다시 그려졌습니다.

**통합 테스트가 셸 환경변수에 의존했습니다.** CLI와 같은 `.env` 로더를 쓰도록 바꿨습니다.

## 3.6 Phase 2A — Research Brain

Gemini Search Grounding으로 Topic별 Research Brief를 만듭니다. Notebook 동기화는 포함하지 않습니다(Phase 2B).

| 완료 조건 | 상태 | 근거 |
|---|---|---|
| 출처 없는 주장을 저장하지 않음 | 완료 | `groundingMetadata`에 실제로 온 URL과 대조해 남기고, 매핑되지 않은 `keyFacts`는 버립니다(`mergeCitations`, `dropUngroundedFacts`) |
| Demo Mode에서 Key 없이 동작 | 완료 | `MockResearchProvider`는 인용을 만들지 않고 `citations: []`, `keyFacts: []`로 두고 미확인 항목만 남깁니다 |
| Brief를 덮어쓰지 않음 | 완료 | `unique(topic_id, version)`에 맞춰 version을 올려 쌓습니다. 통합 테스트로 v1→v2 확인 |
| 같은 Idempotency Key가 중복 Run을 만들지 않음 | 완료 | `topic.research` Run 재사용, 통합 테스트 6개 |
| Provider 오류가 Run에 남음 | 완료 | 429/5xx/401 정규화, 실패 시 Run이 `failed`로 기록 |
| 근거 충실도를 보여줌 | 완료 | `citation_coverage`는 인용을 가진 `keyFacts` 비율이고, 사실 항목이 없으면 `null`(N/A)입니다 |

Brief 상태는 인용이 하나도 없으면 `needs_review`, 있으면 `ready`입니다. Demo Mode는 항상 `needs_review`입니다.

`geminiResearch` 플래그 기본값은 스펙 14.4대로 `false`입니다. Demo 워크스페이스는 시드가 `workspace_settings.feature_flags`로 켭니다. Live로 쓰려면 `APP_MODE=live`, `GEMINI_API_KEY`, `GEMINI_RESEARCH_MODEL`이 필요하고, 없으면 Provider가 무엇이 필요한지 오류로 알려줍니다.

추가된 API: `POST/GET /api/v1/workspaces/:workspaceId/topics/:topicId/research`

---

## 3.7 Phase 3 Demo — DNA Library와 Content Studio

승인된 Research Brief에서 Angle → Script 버전 → Shot List → QA → Reviewer 승인까지 Demo Mode로 돌립니다. Live Gemini 대본 생성, Notebook, 비용 원장, 배포 보강은 넣지 않았습니다.

| 완료 조건 | 상태 | 근거 |
|---|---|---|
| 사용자 제공 Transcript 여부가 명확히 표시 | 완료 | Import 메타 `transcriptProvided`, DNA 화면 배지, 패턴의 `transcriptIncluded` |
| Transcript가 없으면 모델이 대본을 봤다고 주장하지 않음 | 완료 | Mock DNA는 `user_supplied_transcript` evidence를 만들지 않음. 서비스가 위반 결과를 저장하지 않음 |
| Script의 모든 Fact Claim에 Citation 또는 Unverified Flag | 완료 | `normalizeFactualClaims` + QA Fact. Demo는 출처가 없어 전부 UNVERIFIED |
| 이전 버전 복구 가능 | 완료 | Script는 덮어쓰지 않고 version을 쌓고, 복구는 새 버전으로 복사 |
| Blocker QA가 승인 차단 | 완료 | Fact 미매핑·Originality 고겹침·Policy 수익 보장은 `blocker`. 승인은 `INVALID_STATE_TRANSITION` |
| 승인 시 Snapshot hash 저장 | 완료 | Script·Shot·QA를 해시해 `approvals.snapshot_hash`에 기록 |

구현된 화면: `/dna`, `/studio`, `/studio/[projectId]`.

---

## 3.8 Phase 3.1 — Script 무결성

수동 대본 수정은 `structuredScriptSchema`로 검증합니다. 빈 대본이거나 Beat가 2개 미만·16개 초과면 저장하지 않습니다. 새로 생긴 문장은 미확인 Claim이 됩니다. QA `input_hash`는 규칙 버전·목표 길이·브랜드·참고 영상 텍스트를 포함합니다.

---

## 3.9 Phase 4 — Video Factory

승인된 Content Project를 9:16으로 합성합니다. Live Gemini 영상은 연결하지 않습니다. 생성 플래그가 꺼져 있으면 클립을 직접 올리거나 단색 Placeholder로 렌더합니다. 글자는 AI 푸티지에 넣지 않고 FFmpeg 후반에서 ASS/SRT로 태웁니다.

| 완료 조건 | 상태 | 근거 |
|---|---|---|
| Provider가 없으면 수동 Asset 업로드로 Render 가능 | 완료 | `saveUploadedClip` + Placeholder 전략. `videoGeneration` 기본값 false |
| 긴 작업이 Web request timeout에 의존하지 않음 | 완료 | `POST .../render`는 202. Worker `POST /internal/render` 또는 프로세스 내 비동기 실행 |
| 같은 Render 명령의 중복 과금 방지 | 완료 | `command_hash` 부분 유니크 + Workflow Idempotency. 재사용 시 `cost_events`를 추가하지 않음 |
| ffprobe·Loudness·checksum 검증 | 완료 | `probeMedia`, `ebur128`, `sha256`를 `render_jobs`에 저장 |
| 실패 Shot만 재생성 가능 | 완료 | `retryFailedShots`가 새 Render version을 만들고 지정 Shot만 다시 합성 |

Worker `GET /health`는 ffmpeg/ffprobe가 없으면 503입니다. `apps/worker/Dockerfile`에 Cloud Run `HEALTHCHECK`가 있습니다. 로컬 fixture 렌더는 `packages/services/src/render-engine.test.ts`입니다.

화면: `/factory`, `/factory/[renderId]`. Publish Queue는 Phase 5라 열지 않습니다.

### Phase 4.1 Demo 무결성 보완

- Render Manifest v2는 승인된 Script ID/version과 최신 Content Project Approval
  ID/snapshot hash를 고정하며, command hash에도 모두 포함합니다.
- 업로드는 권한 확인 후, 프로젝트 상태·최신 승인·승인 Script의 Shot을 파일/Asset 저장 전에
  검증합니다.
- Shot별 실행 상태와 생성 Asset ID를 Manifest에 기록합니다. 선택 재시도는 선택하지 않은 성공
  Asset을 재사용하며, 상세 화면에서 재시도 Shot을 체크할 수 있습니다.
- API와 Manifest 모두 정확한 9:16만 허용합니다.
- ASS 합성이 실패하거나 자막이 3줄 Safe Area를 넘으면 Render 전체를 실패 처리합니다. 문자열
  `CAPTION` 대체와 조용한 자르기는 없습니다.
- 수동 Hook 변경도 미확인 Claim이 되며, 최종 본문에서 삭제된 Claim은 제거합니다. 공백
  Title/Hook은 거부합니다.

참고 영상 Import는 YouTube URL에서 ID를 뽑아 Mock/Live Discovery Provider의 `getVideos`를 씁니다. Demo에서 검색 캐시에 없는 ID는 공개 메타데이터만 합성하며 대본을 넣지 않습니다.

DNA Analyzer는 Hook 유형, 정보 배열, CTA 같은 추상 패턴만 남깁니다. 원문 문장·고유 비유를 저장하지 않습니다.

QA는 Check별로 돕니다. n-gram 겹침은 결정적 계산이고, 의미 유사도 모델은 Demo에서 호출하지 않으며 그 사실을 finding에 남깁니다. Originality 점수는 법률 판단이 아닙니다.

---

## DEFERRED_AFTER_DEMO

Phase 3 Demo를 우선하기 위해 아래는 기록만 하고 구현하지 않습니다.

| 항목 | 미구현 이유 | 재개 조건 |
|---|---|---|
| Phase 2 Live 보완 | Research Live Gemini·YouTube Live는 코드 경로가 있으나, 운영 키·쿼터 대시보드·공유 캐시·Grounding 품질 가드레일을 Demo 범위 밖으로 둠 | 실제 키와 쿼터 한도가 있는 워크스페이스 |
| Notebook Sync (Phase 2B) | Enterprise API·라이선스 필요. Brief는 Gemini만으로 완결 | Notebook Enterprise 사용 결정 |
| 운영 비용 관리 | Demo `cost_events` 기록 외 프로젝트별 원장·예산 차단·대시보드를 붙이지 않음 | 실제 유료 Provider 연결 시 |
| 배포 보완 | Vercel/Cloud Run 파이프라인, 환경 시크릿, 헬스체크 보강 없음 | 스테이징 배포 요청 시 |

## DEFERRED_BEFORE_DEPLOYMENT

Phase 4.1은 로컬 Demo 무결성까지만 다룹니다. 별도 Cloud Run 배포와 GCS Object Storage 연동은
구현하지 않았습니다. 배포 전에 서비스 계정 최소 권한, signed URL, Object checksum/retention,
Worker 인증, 재시도 큐와 배포 환경의 영속 저장 경로를 설계·검증해야 합니다.

---

## 4. 구조

```
apps/web        Next.js 16 App Router. UI + /api/v1 + 서버 조립(composition root)
apps/worker     Video Factory Worker. `/health`와 내부 렌더 엔드포인트
packages/config        env 검증, Feature Flag 해석
packages/observability Pino 로거, requestId, 타이밍 로깅
packages/contracts     Zod 스키마(API·점수·상태 전이·역할 권한)
packages/db            Drizzle 스키마, SQL 마이그레이션, 저장소 함수
packages/domain        점수·Confidence·Decision Band·Velocity·Topic 발견 (외부 SDK 의존 없음)
packages/providers     Provider 인터페이스 + Mock + Live YouTube + Registry
packages/services      수집 오케스트레이션과 Demo Seed
```

Domain은 `@shorts-os/contracts`만 알고 DB나 Provider를 모릅니다. Provider는 Domain 타입으로만 말합니다.

---

## 5. 스펙 대비 의사결정과 편차

**인증**: Supabase 자격증명이 없어 `AuthProvider` 인터페이스로 분리했습니다. 기본값은 서명 쿠키 기반 Demo 세션이고, `SupabaseAuthProvider`는 자리만 잡아둔 뒤 호출되면 무엇이 필요한지 오류로 알려줍니다. 가짜로 통과시키지 않습니다.

**RLS 적용 방식**: 스펙 6.3 마이그레이션은 `auth.uid()`를 쓰므로 그대로 두고, 로컬용 `auth` 스키마 shim을 `0000_local_auth_shim.sql`로 분리했습니다. `DB_TARGET=supabase`면 로컬 전용 파일을 건너뜁니다. 사용자 요청은 테이블 소유자가 아닌 `app_user` 역할로 접속해 RLS가 실제로 적용됩니다.

**시스템 쓰기 분리**: 스펙 6.4대로 `workflow_runs`, `workflow_steps`, `*_snapshots`, `audit_logs`는 사용자 세션이 쓸 수 없습니다. API가 사용자 세션으로 역할을 확인한 뒤 시스템 접속으로 기록합니다(`WorkspaceContext.system`). 통합 테스트가 이 경계를 검증합니다.

**Drizzle 스키마 범위**: SQL 마이그레이션은 스펙 6.3 전문(테이블 38개, 정책 61개)을 적용합니다. Drizzle 정의는 Phase 0-1이 실제로 읽고 쓰는 19개 테이블만 두었습니다. 나머지는 각 Phase에서 추가합니다.

**Job Orchestrator**: Phase 1의 수집은 요청 처리 중 동기 실행하되 Run/Step/오류/쿼터를 모두 기록합니다. API 계약(202 + workflowRunId)은 Worker로 옮겨도 그대로입니다.

**Provider 응답 캐시**: 단일 인스턴스 메모리 캐시입니다. 캐시가 비어도 동작은 같고 쿼터만 더 씁니다. Phase 2에서 공유 저장소로 옮깁니다.

**typedRoutes**: 이후 Phase 메뉴 경로가 늘어나는 동안 Link 타입 검사와 충돌할 수 있어 꺼 두었습니다.

**Playbook**: Phase 0 이전에 만든 수동 실행 가이드와 FFmpeg·브라우저 렌더러를 `/playbook`으로 옮겨 보존했습니다. 새 제품 IA에는 포함하지 않고 헤더 링크로만 접근합니다. 렌더 파이프라인은 Phase 4에서 재사용합니다.

---

## 6. 스펙에 반영이 필요한 최신 외부 조건

**YouTube 쿼터**: 2026년 6월부터 `search.list`와 `videos.insert`가 각각 하루 100회 별도 버킷이고 나머지 엔드포인트가 합산 10,000 단위를 씁니다. 기본값을 이 수치로 설정했고 코드에 고정하지 않았습니다(`YOUTUBE_SEARCH_DAILY_LIMIT`).

**게시 감사**: 2020년 7월 이후 만든 프로젝트는 컴플라이언스 감사를 통과할 때까지 API 업로드가 강제 비공개입니다. Phase 5 완료 조건에 "감사 전에는 공개 예약이 불가능하다"를 명시해야 합니다.

**Google Trends**: 공식 API는 2026년 9월 현재도 신청 승인제 알파입니다. `pytrends`는 2025년 4월 개발 중단됐습니다. 기본 비활성 + CSV Import 판단이 유효합니다.

**Gemini Notebook**: 개인 계정용 공개 API는 없고 Enterprise(Google Cloud)만 제공됩니다. Notebook을 선택형으로 둔 판단이 유효합니다.

---

## 7. 검증 기록

- 단위 테스트 106개: Phase 4 caption/capability/fixture 포함
- 통합 테스트 32개: 워크스페이스 격리 6, Research Brief 6, Phase 3 Studio 12,
  Phase 4.1 Factory 8
- 브라우저 검증: 로그인, 대시보드, Radar, Research, DNA Import·대본 배지, Studio Angle·Script·QA·승인. Render/Publish는 Phase 4–5라 열지 않음
### 공식 Seed 기준값

`pnpm db:reset && pnpm db:migrate && pnpm db:seed` 직후의 값입니다. `SEED_NOW`(2026-09-03T00:00:00Z)와 Mock 시드(20260903)를 고정했으므로 환경이 달라도 같은 수가 나와야 합니다.

| 항목 | 건수 |
|---|---|
| workspaces | 1 |
| niches | 3 (AI Automation 75편, Career AI 24편, Productivity 6편) |
| topics | 17 (8 + 8 + 1) |
| reference_videos | 105 |
| video_metric_snapshots | 105 |
| topic_score_snapshots | 17 |
| niche_metric_snapshots | 3 |
| workflow_runs | 3 (전부 succeeded) |
| Decision Band | PRODUCE_CANDIDATE 3, RESEARCH_MORE 1, WATCH 11, SKIP_CANDIDATE 2 |
| topics.decision | new 17 (승인 이력 없음) |

`pnpm db:seed`를 다시 실행해도 위 수치는 변하지 않습니다. 워크스페이스는 slug로, Niche는 slug로 찾고, 수집은 `seed-<slug>-<날짜>` Idempotency Key로 기존 Run을 재사용합니다. 두 번째 실행부터는 각 Niche가 `이미 시드되어 있어 건너뛰었습니다`로 표시됩니다.

Dashboard 집계와 Topic Radar 목록은 같은 `listTopics(limit=100)` 결과를 씁니다. 기준값에서 Dashboard는 제작 후보 3, 승인 대기 17, 데이터 보강 1, 실패 Run 0을 표시하고 Topic Radar 배지는 제작 후보 3, 데이터 보강 1, 관찰 11, 보류 2로 합계 17이 됩니다.

---

## 8. 남은 위험

**표본이 적은 Niche는 주제가 거의 안 나옵니다.** Demo의 Productivity는 영상 6편에서 주제 1개만 나옵니다. 반복되는 두 단어 표현만 주제로 인정하기 때문입니다. 스펙 6.5는 Niche당 8개를 요구하지만, 없는 근거로 주제를 만들지 않는 쪽을 택했습니다. Phase 2에서 Search Grounding이 붙으면 이 공백이 메워집니다.

**Breakout Ratio는 아직 계산하지 않습니다.** 첫 수집에는 비교군 시계열이 없어 `null`로 남깁니다. 1시간·6시간·24시간 스냅샷이 쌓이면 채워집니다. 스펙 5.4의 판단과 같습니다.

**Confidence의 freshness·sample 곡선은 임의 상수입니다.** 근거가 있는 값이 아니라 설계 판단이므로, 실제 성과 데이터가 쌓이는 Phase 6에서 재조정해야 합니다.

**메모리 캐시는 인스턴스가 늘면 무효화됩니다.** Vercel 다중 인스턴스에서는 쿼터를 더 쓰게 됩니다. Phase 2에서 공유 캐시로 교체해야 합니다.

---

## 9. Phase 2B / Live 재개 전 확인할 것

DEFERRED_AFTER_DEMO를 보세요. Notebook Enterprise, 출처 보관 정책, Gemini 예산 상한은 Demo 이후입니다.
