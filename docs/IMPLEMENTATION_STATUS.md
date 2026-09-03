# Implementation Status

- 기준 문서: `docs/SHORTS_INTELLIGENCE_OS_SPEC.md`
- 최근 갱신: 2026-09-03
- 완료 Phase: **Phase 0, Phase 1**
- 다음 Phase: Phase 2 (Research Brain과 Notebook Sync) — 승인 후 시작

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

Phase 1 메뉴는 Dashboard, Niche Radar, Topic Radar, Runs, Settings입니다. 사이드바는 lg 이상에서만 보이므로 작은 화면에는 같은 목록을 가로 스크롤 상단 바로 제공합니다(`components/product/mobile-nav.tsx`).

구현된 항목: Niche CRUD, Score Config 버전 관리, YouTube Data Provider(쿼터 회계·캐시·배치·타임아웃·재시도), Metric Snapshot, View Velocity와 Breakout 판단, Topic 클러스터, 설명형 Score와 Confidence, Niche·Topic 화면, Topic 승인·보류·제외(단건·최대 50건 일괄), Workflow Run 화면.

---

## 4. 구조

```
apps/web        Next.js 16 App Router. UI + /api/v1 + 서버 조립(composition root)
apps/worker     Cloud Run용 골격. Phase 4 Video Factory에서 사용 (현재 렌더 스크립트만 보관)
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

**typedRoutes**: Phase 2 이후 메뉴 경로가 아직 없어 Link 타입 검사와 충돌하므로 껐습니다. 라우트가 생기는 Phase에서 다시 켭니다.

**Playbook**: Phase 0 이전에 만든 수동 실행 가이드와 FFmpeg·브라우저 렌더러를 `/playbook`으로 옮겨 보존했습니다. 새 제품 IA에는 포함하지 않고 헤더 링크로만 접근합니다. 렌더 파이프라인은 Phase 4에서 재사용합니다.

---

## 6. 스펙에 반영이 필요한 최신 외부 조건

**YouTube 쿼터**: 2026년 6월부터 `search.list`와 `videos.insert`가 각각 하루 100회 별도 버킷이고 나머지 엔드포인트가 합산 10,000 단위를 씁니다. 기본값을 이 수치로 설정했고 코드에 고정하지 않았습니다(`YOUTUBE_SEARCH_DAILY_LIMIT`).

**게시 감사**: 2020년 7월 이후 만든 프로젝트는 컴플라이언스 감사를 통과할 때까지 API 업로드가 강제 비공개입니다. Phase 5 완료 조건에 "감사 전에는 공개 예약이 불가능하다"를 명시해야 합니다.

**Google Trends**: 공식 API는 2026년 9월 현재도 신청 승인제 알파입니다. `pytrends`는 2025년 4월 개발 중단됐습니다. 기본 비활성 + CSV Import 판단이 유효합니다.

**Gemini Notebook**: 개인 계정용 공개 API는 없고 Enterprise(Google Cloud)만 제공됩니다. Notebook을 선택형으로 둔 판단이 유효합니다.

---

## 7. 검증 기록

- 단위 테스트 57개: 점수 계산 10, Velocity 14, Topic 발견 6, Provider 9, Flag·env 9, Contract 8, dotenv 로더 1
- 통합 테스트 6개(실제 PostgreSQL): 워크스페이스 격리 4, Idempotency 1, 수집→점수→승인 수직 슬라이스 1
- 브라우저 검증 25개(프로덕션 빌드, Chrome): 로그인, 대시보드 KPI, Niche 목록·Provider 상태, 수집 실행, Topic 목록·Score Breakdown·결측 N/A, 필터, 승인, Run 기록, Settings 잠금 표시, 403 차단, Idempotency-Key 필수, 모바일 레이아웃. 콘솔·서버 오류 0건
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

## 9. Phase 2 진입 전 확인할 것

1. Gemini API Key와 예산 상한
2. Notebook Enterprise를 쓸지 여부(Google Cloud 프로젝트와 라이선스 필요). 쓰지 않으면 Research Brief는 Gemini API만으로 완결됩니다
3. Search Grounding 결과의 출처 보관 정책(원문 저장 범위, 보존 기간)
