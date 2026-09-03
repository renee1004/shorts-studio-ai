# Shorts Intelligence OS

## Cursor 개발용 Master Prompt + PRD + DB Schema + API + 화면 구조 + 개발 순서

- 문서 버전: 1.0
- 기준일: 2026-09-03
- 프로젝트 슬러그: shorts-intelligence-os
- 기본 언어: 한국어 UI, 영어 프롬프트 및 다국어 콘텐츠 확장 가능
- 핵심 원칙: 수익 보장 도구가 아니라, 근거 기반으로 제작 우선순위를 정하고 제작비 대비 성과를 학습하는 운영 시스템

## 문서 구성

1. Cursor 시작 방법과 Master Prompt
2. 구현 가능 범위와 PRD
3. 시스템 구조와 점수 로직
4. PostgreSQL Migration Schema
5. REST API Contract
6. 화면 IA와 상세 기능
7. LLM Prompt Registry와 Notebook 분류
8. Phase별 개발 Prompt와 완료 조건
9. 환경·Test·보안·배포 기준

---

# 0. 이 문서를 사용하는 방법

가장 안정적인 사용법은 이 파일을 프로젝트의 docs/SHORTS_INTELLIGENCE_OS_SPEC.md로 넣고, 아래 Master Prompt만 Cursor Agent에 붙여넣는 것이다.

처음부터 전체 기능을 한 번에 생성하지 않는다. Cursor에는 반드시 Phase 0과 Phase 1만 먼저 구현하게 하고, 각 Phase의 완료 조건을 통과한 뒤 다음 Phase로 넘어가게 한다.

## Cursor에 처음 넣을 Master Prompt

~~~text
You are the lead product engineer and software architect for Shorts Intelligence OS.

Read the entire file docs/SHORTS_INTELLIGENCE_OS_SPEC.md before changing code. Treat it as the product and architecture source of truth.

Your immediate task is to implement only Phase 0 and Phase 1 as a production-quality vertical slice:

1. Repository foundation, authentication, workspace isolation, database migrations, design system, provider interfaces, environment validation, logging, and mock mode.
2. Niche Radar and Topic Radar using YouTube public metadata plus deterministic scoring.
3. A seeded demo workspace that works without external credentials.
4. Google Ads, Google Trends, Gemini Notebook Enterprise, video generation, publishing, and analytics must remain feature-flagged provider adapters until their phases.

Engineering rules:

- Use a pnpm workspace monorepo with apps/web, apps/worker, and shared packages.
- Use Next.js App Router, TypeScript strict mode, Tailwind, shadcn/ui, PostgreSQL on Supabase, Drizzle ORM, Zod, Vitest, Playwright, and structured JSON logging.
- Keep domain logic independent from Next.js route handlers and external SDKs.
- Define provider interfaces first. All provider-specific code belongs under packages/providers.
- Never hardcode model names, quotas, weights, provider limits, secrets, workspace IDs, channel IDs, or external resource IDs.
- All external calls must use timeouts, retry policy, rate limits, idempotency keys, and normalized error objects.
- Do not scrape YouTube pages, bypass access controls, download arbitrary competitor captions, or automate the consumer NotebookLM browser.
- Public YouTube research uses official API metadata only. Captions may be downloaded only for videos the authenticated user is authorized to edit, or when the user supplies text with rights to use it.
- Store secrets in a token-vault abstraction. Never store plaintext refresh tokens or API secrets in application tables or send them to the browser.
- Every asynchronous command returns a workflow run ID. Persist step status, error code, retry count, provider request ID, estimated cost, and actual cost when available.
- Opportunity scores must be explainable, deterministic, null-safe, and covered by unit tests. Missing inputs are not zero; re-normalize available weights and lower confidence.
- Generated research claims must retain source URLs and evidence. Never fabricate CPC, search volume, revenue, transcripts, or citations.
- Notebook Enterprise is an optional synchronized knowledge workspace, not the application database and not the core reasoning engine.
- Publishing is disabled by default and always requires an explicit human approval record.
- Originality and policy checks are decision support, not legal clearance or a guarantee of YouTube monetization.
- Use accessible semantic UI, loading/empty/error states, keyboard navigation, and responsive layouts.
- Prefer simple implementation over premature abstraction, but preserve the provider boundaries defined in the specification.
- Do not leave fake buttons, silent catch blocks, TODO-only handlers, or mocked success in production paths.

Before implementation:

1. Inspect the existing repository and report conflicts with this specification.
2. Propose the exact files to add or modify for Phase 0 and Phase 1.
3. State any assumption that materially affects architecture.
4. Then implement without waiting unless a destructive action or missing product decision blocks progress.

For each completed slice:

1. Run format, lint, typecheck, unit tests, integration tests, and production build.
2. Apply migrations to a local or test database and run seed data.
3. Show the exact commands run and concise results.
4. Update docs/IMPLEMENTATION_STATUS.md with completed acceptance criteria, open risks, and next phase.
5. Stop after Phase 1 and ask for approval before enabling Phase 2.

The result must run in mock mode with:

pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev

Start now by reading the specification and producing the Phase 0–1 implementation plan.
~~~

## 이후 Phase 진행용 공통 명령

~~~text
Read docs/SHORTS_INTELLIGENCE_OS_SPEC.md and docs/IMPLEMENTATION_STATUS.md.
Implement only Phase [NUMBER].
Do not change previously accepted behavior unless the specification requires it.
Run every quality gate and update IMPLEMENTATION_STATUS.md.
Stop when the Phase completion criteria are satisfied.
~~~

---

# 1. 먼저 확정해야 할 기술적 판단

## 1.1 Notebook의 정확한 역할

Gemini Notebook Enterprise는 다음 용도로만 사용한다.

- 분야별 Notebook 자동 생성
- 웹 URL, YouTube URL, 문서, 원문 텍스트를 Source로 동기화
- 사람이 Notebook 화면에서 자료를 탐색하도록 연결
- Notebook 리소스 ID와 동기화 상태 관리

Notebook을 앱의 DB나 핵심 생성 엔진으로 사용하지 않는다. 공식 API가 Preview이고, 공개된 Notebook 리소스가 생성·조회·공유·삭제·Source 관리 중심이므로 Research Brief와 콘텐츠 생성은 Gemini API가 담당한다.

Notebook 연결이 꺼져 있어도 나머지 앱은 정상 동작해야 한다.

## 1.2 경쟁 영상 대본 처리

YouTube 공식 Caption 다운로드는 해당 영상을 편집할 권한이 있는 인증 사용자에게만 허용된다. 따라서 경쟁 영상의 대본 자동 추출은 필수 기능에서 제외한다.

허용되는 입력은 다음과 같다.

- 공개 API에서 받은 제목, 설명, 태그, 공개 통계, 게시일
- 사용자가 직접 입력하거나 업로드한 대본
- 사용자가 권리를 가진 채널의 자막
- Notebook이 해당 YouTube URL을 Source로 받아들이는 범위
- 사용자가 명시적으로 제공한 합법적 제3자 데이터

DNA 분석은 원문 문장을 복제하는 기능이 아니라 Hook 유형, 정보 배열, 장면 전환, 길이, CTA, 감정 곡선 같은 추상 패턴을 구조화하는 기능이다.

## 1.3 Google Ads와 Google Trends

Google Trends API는 Alpha 접근권이 있는 경우에만 활성화한다. 접근권이 없으면 수동 CSV Import 또는 null 신호로 처리한다.

Google Ads Keyword Planning API는 개발자 토큰과 허용된 용도가 필요하다. 콘텐츠 니치 발굴만을 위한 사용이 승인 조건과 맞지 않을 수 있으므로 다음 순서로 취급한다.

1. 기본값: 비활성화
2. 개인 운영 초기: Keyword Planner 내보내기 CSV 수동 Import
3. 승인된 개발자 토큰과 허용 용도가 확인된 경우: API Adapter 활성화

Google Ads 신호가 없더라도 YouTube, Search Grounding, Trends 또는 수동 입력으로 점수를 계산할 수 있어야 한다.

CSV Import 표준:

~~~csv
# trends_import.csv
term,geo,date,interest,source
AI automation,US,2026-09-01,78,google_trends_export
~~~

~~~csv
# ads_keyword_import.csv
keyword,geo,language,avg_monthly_searches,competition_index,low_top_bid_micros,high_top_bid_micros,currency,period_end
AI automation,US,en,12000,72,3400000,12800000,USD,2026-08-31
~~~

Bid 값은 광고 입찰 신호이며 평균 CPC나 Shorts RPM으로 표시하지 않는다.

## 1.4 수익화와 자동 게시

- 타 채널의 실제 수익은 추정값으로도 사실처럼 표시하지 않는다.
- estimatedRevenue와 CPM은 연결된 본인 채널의 YouTube Analytics에서만 가져온다.
- 수익화 가능성, Originality Score, Policy Score는 참고 지표다.
- 영상 생성 완료 후에도 사용자 승인 없이는 업로드하지 않는다.
- 예약 업로드도 승인자, 승인 시각, 승인 대상 Render 버전을 기록한다.

---

# 2. PRD

## 2.1 제품 한 줄 정의

Shorts Intelligence OS는 공개 시장 신호와 본인 채널 성과를 모아, 제작 가치가 높은 Shorts 주제를 추천하고, 근거 기반 기획·대본·영상 제작·검토·게시·성과 학습을 연결하는 Human-in-the-loop 콘텐츠 운영 도구다.

## 2.2 해결하려는 문제

현재 Shorts 제작에는 다음 문제가 있다.

1. 주제 선정이 개인의 감에 의존한다.
2. 트렌드, 경쟁 영상, 광고 가치, 출처가 여러 도구에 흩어진다.
3. 조회수가 높은 영상을 참고하다가 유사 콘텐츠가 되기 쉽다.
4. 제작비와 API 비용을 영상별로 추적하기 어렵다.
5. 업로드 후 성과가 다음 기획에 구조적으로 반영되지 않는다.
6. AI 자동화가 늘어날수록 사실 오류, 저작권, 반복 콘텐츠 위험도 커진다.

## 2.3 제품 목표

### MVP 목표

- 관심 Niche를 등록하고 정기적으로 공개 신호를 수집한다.
- 오늘 제작 후보 Topic을 점수와 근거로 정렬한다.
- Topic별 출처와 Research Brief를 만든다.
- 상위 Topic을 사람이 승인해 Content Project로 전환한다.
- 모든 점수에서 원본 값, 계산 방식, 누락값, 신뢰도를 확인할 수 있다.

### 최종 목표

- 승인된 Topic에서 Script, Shot List, Visual Prompt, Voice, Caption을 생성한다.
- 영상 생성·조립·QA·게시를 승인 흐름과 연결한다.
- 본인 채널의 유지율, 조회수, 구독 전환, 수익, 제작비를 다시 학습 신호로 사용한다.

## 2.4 비목표

다음은 이 제품이 보장하거나 수행하지 않는다.

- 특정 조회수나 수익 보장
- 경쟁 영상의 무단 다운로드 또는 대본 무단 수집
- 타 채널의 비공개 Analytics나 수익 추정
- YouTube 정책 심사를 통과한다는 법적·플랫폼적 보증
- 사용자 승인 없는 완전 자동 공개 업로드
- 개인용 NotebookLM UI의 브라우저 자동 조작
- 출처 없는 사실 생성
- 조회수, 댓글, 구독자 등 인위적 참여 조작

## 2.5 주요 사용자

| 사용자 | 필요 | MVP 권한 |
|---|---|---|
| Owner | 채널·연동·예산·점수 기준 관리 | 전체 |
| Operator | Niche/Topic 조사, 기획, 제작 실행 | 조회·생성·수정 |
| Reviewer | 사실·독창성·정책·게시 승인 | 검토·승인·반려 |
| Viewer | 현황과 성과 확인 | 읽기 전용 |

MVP UI는 1인 Owner를 중심으로 만들되 DB는 Workspace 다중 사용자 구조를 사용한다.

## 2.6 핵심 사용자 여정

### Journey A — 첫 설정

1. Google로 로그인한다.
2. Workspace를 만든다.
3. 대상 국가, 언어, 콘텐츠 분야, 예산 한도를 설정한다.
4. YouTube Data API를 연결하거나 Demo Mode를 선택한다.
5. 선택적으로 본인 YouTube 채널, Notebook, Trends, Ads를 연결한다.

완료 조건:

- 최소한 Demo Mode 또는 YouTube Data API가 활성화된다.
- 연결되지 않은 Provider 때문에 Dashboard가 실패하지 않는다.

### Journey B — 오늘 만들 주제 찾기

1. Niche Radar를 연다.
2. Niche별 Opportunity Score와 Confidence를 비교한다.
3. 한 Niche를 열어 계산 근거와 최근 변화를 본다.
4. Discover Topics를 실행한다.
5. Topic 후보를 승인, 보류, 제외한다.

완료 조건:

- 점수를 클릭하면 Raw Signal과 계산식이 보인다.
- 데이터가 없는 항목은 0이 아니라 Not available로 보인다.
- 낮은 Confidence 후보는 시각적으로 구분된다.

### Journey C — 근거 기반 기획

1. 승인한 Topic에서 Research Run을 시작한다.
2. Gemini Search Grounding과 등록된 Source가 근거를 모은다.
3. 중복 URL을 제거하고 Source 품질을 표시한다.
4. Research Brief에 핵심 사실, 관점, 반론, 콘텐츠 기회, 출처를 생성한다.
5. Notebook 연결 시 적합한 Niche Notebook에 Source를 동기화한다.

완료 조건:

- 모든 사실 항목에 최소 한 개의 Source ID가 연결된다.
- 근거가 부족한 주장은 Unverified로 표시된다.
- Notebook 동기화 실패가 Research Brief 생성을 롤백하지 않는다.

### Journey D — 콘텐츠 제작

1. Research Brief에서 Create Content를 누른다.
2. 채널 Brand Profile과 목표 길이를 선택한다.
3. 세 개의 Angle과 Hook 후보를 생성한다.
4. 하나를 선택하여 Script와 Shot List를 만든다.
5. Fact, Originality, Policy, Brand QA를 통과시킨다.

완료 조건:

- 생성된 사실 문장에 Citation 매핑이 유지된다.
- Script의 각 버전이 보존된다.
- 실패한 QA의 이유와 수정 제안이 보인다.

### Journey E — 영상과 게시

1. 승인된 Shot List로 Asset과 Clip을 생성한다.
2. Renderer가 음성, 영상, 자막, BGM을 조립한다.
3. 완성본과 QA 결과를 Reviewer가 확인한다.
4. 명시적 승인 후 비공개 또는 예약 상태로 YouTube에 업로드한다.
5. 게시 후 Analytics를 정기 수집한다.

완료 조건:

- 승인된 Render checksum과 실제 업로드 파일 checksum이 동일하다.
- 업로드 재시도 시 중복 영상이 생기지 않는다.
- 비용이 Content Project 단위로 집계된다.

## 2.7 핵심 기능 요구사항

| ID | 기능 | 우선순위 | Phase |
|---|---|---:|---:|
| FR-001 | Google 로그인 및 Workspace 격리 | Must | 0 |
| FR-002 | Demo Mode와 Seed Data | Must | 0 |
| FR-003 | Provider Adapter와 Feature Flag | Must | 0 |
| FR-004 | Niche CRUD와 시장/언어 설정 | Must | 1 |
| FR-005 | YouTube 공개 영상 검색·통계 수집 | Must | 1 |
| FR-006 | Niche/Topic 설명형 점수와 Confidence | Must | 1 |
| FR-007 | Topic 승인·보류·제외 | Must | 1 |
| FR-008 | Gemini 근거 검색과 Source 저장 | Must | 2 |
| FR-009 | Research Brief와 Citation | Must | 2 |
| FR-010 | Notebook 자동 분류·Source 동기화 | Should | 2 |
| FR-011 | 성공 영상 DNA 추상화 | Should | 3 |
| FR-012 | Angle·Hook·Script·Shot List 생성 | Must | 3 |
| FR-013 | Fact·Originality·Policy·Brand QA | Must | 3 |
| FR-014 | AI Asset·Video 생성 | Could | 4 |
| FR-015 | FFmpeg 조립, 자막, 음량 정규화 | Should | 4 |
| FR-016 | 사람 승인과 YouTube 업로드 | Should | 5 |
| FR-017 | YouTube Analytics 동기화 | Should | 6 |
| FR-018 | 성과 기반 추천과 비용 ROI | Could | 6 |

## 2.8 비기능 요구사항

### 신뢰성과 데이터 품질

- 외부 API 요청은 최대 실행시간과 취소를 지원한다.
- 동일 명령은 Idempotency-Key로 중복 실행을 방지한다.
- 재시도는 429와 일시적 5xx에만 지수 Backoff와 Jitter로 수행한다.
- 원본 Provider 응답은 필요한 최소 범위에서 JSONB로 보존하며 개인정보는 제거한다.
- 점수 계산 버전과 Prompt 버전을 저장한다.
- 외부 ID와 Canonical URL에 Unique Constraint를 둔다.

### 보안

- Workspace 단위 RLS를 적용한다.
- 브라우저에는 Service Role Key, OAuth Refresh Token, Provider Secret을 노출하지 않는다.
- OAuth는 최소 Scope로 나누고 게시 Scope는 별도 동의를 받는다.
- URL 수집기는 SSRF 방어를 적용한다: http/https만 허용, 사설 IP·Metadata endpoint·Redirect 탈출 차단.
- 업로드 파일은 MIME sniffing, 크기 제한, 악성 파일 검사, checksum을 적용한다.
- Audit Log는 승인, 게시, 연동, 삭제, 점수 설정 변경을 기록한다.

### 성능

- Dashboard API P95 목표: 캐시 적중 시 500ms 이하
- 목록 API P95 목표: 800ms 이하
- 긴 작업은 HTTP 요청 안에서 완료하지 않고 Workflow Run으로 전환
- 표 목록은 Server pagination 사용
- YouTube 검색 결과는 Query+Region+Language 단위 캐시

### 접근성

- WCAG 2.2 AA를 목표로 한다.
- 색만으로 상태를 표현하지 않는다.
- 표, Dialog, Tabs, Toast에 키보드 접근과 Screen Reader Label을 제공한다.

## 2.9 성공 지표

### 제품 지표

- 추천 Topic 중 승인 비율
- Topic 발견부터 승인까지 걸린 시간
- Brief 생성 성공률과 Citation coverage
- 제작 1건당 사람 작업시간
- Provider 실패 후 자동 복구율
- 1개 Content Project당 실제 API·렌더 비용

### 채널 성과 지표

- 게시 후 24시간, 48시간, 7일 조회수
- Engaged views
- 평균 시청시간과 평균 시청 비율
- 1,000 Views당 구독 전환
- 1,000 Views당 제작비
- 본인 채널의 추정 수익과 제작비 비율

경쟁 채널에는 공개 조회수 기반 지표만 사용한다.

---

# 3. 범위와 Phase

## MVP: Phase 0–3

MVP의 종료점은 다음과 같다.

~~~text
Niche 등록
→ YouTube 신호 수집
→ Topic 후보와 설명형 점수
→ Topic 승인
→ 근거 수집과 Research Brief
→ Notebook 선택 동기화
→ Angle, Script, Shot List
→ QA
→ 사람이 제작 여부 결정
~~~

영상 생성과 게시를 제외해도 주제 판단과 기획 두뇌가 독립적으로 가치를 내야 한다.

## Full Product: Phase 4–6

~~~text
승인된 Shot List
→ Asset / Video 생성
→ FFmpeg Render
→ QA
→ 사람 승인
→ YouTube 업로드
→ Analytics 수집
→ 다음 추천에 반영
~~~

---

# 4. 시스템 아키텍처

## 4.1 상위 구조

~~~mermaid
flowchart TD
    UI["Next.js Web"] --> API["Application API"]
    API --> DB["Supabase PostgreSQL"]
    API --> ORCH["Workflow Orchestrator"]
    ORCH --> COL["Signal & Research Providers"]
    ORCH --> GEN["Gemini Content Providers"]
    ORCH --> MEDIA["Cloud Media Worker"]
    MEDIA --> STORE["Object Storage"]
    COL --> EXT["Google / YouTube APIs"]
    GEN --> EXT
    API --> NOTE["Optional Notebook Adapter"]
~~~

## 4.2 권장 기술 스택

| 영역 | 선택 | 이유 |
|---|---|---|
| Monorepo | pnpm workspace + Turborepo | Web, Worker, 공유 패키지 분리 |
| Web | Next.js 16 App Router + TypeScript strict | UI와 BFF를 한 코드베이스에서 관리 |
| UI | Tailwind CSS + shadcn/ui | 빠른 관리자 화면 개발 |
| Table/Chart | TanStack Table + Recharts | Radar 표와 추이 시각화 |
| DB | Supabase PostgreSQL | Auth, RLS, 관리 편의 |
| ORM | Drizzle ORM + SQL migrations | SQL 가시성과 타입 안정성 |
| Validation | Zod | API와 LLM Structured Output 공통 검증 |
| Jobs | Trigger.dev 또는 JobOrchestrator interface | 예약, 재시도, 장기 작업 |
| Media | Cloud Run container + FFmpeg | Vercel 제한과 분리 |
| Storage | Google Cloud Storage | 원본·중간·완성 미디어 보관 |
| AI | Gemini Interactions API | Research, 구조화 생성, 멀티모달 |
| Video | Gemini Omni Flash 기본, Veo Adapter 선택 | 모델 교체 가능 구조 |
| Test | Vitest + Playwright + Testcontainers | 계산, API, 핵심 흐름 검증 |
| Logging | Pino JSON logs | Workflow 추적 |

정확한 SDK 버전과 모델명은 코드에 고정하지 않고 환경변수와 Provider capability에서 관리한다.

## 4.3 Monorepo 구조

~~~text
shorts-intelligence-os/
├─ apps/
│  ├─ web/
│  │  ├─ app/
│  │  │  ├─ (auth)/
│  │  │  ├─ (app)/
│  │  │  └─ api/v1/
│  │  ├─ components/
│  │  ├─ lib/
│  │  └─ middleware.ts
│  └─ worker/
│     ├─ src/jobs/
│     ├─ src/render/
│     ├─ src/server.ts
│     └─ Dockerfile
├─ packages/
│  ├─ db/
│  │  ├─ src/schema/
│  │  ├─ migrations/
│  │  ├─ seed/
│  │  └─ client.ts
│  ├─ domain/
│  │  ├─ niches/
│  │  ├─ topics/
│  │  ├─ research/
│  │  ├─ content/
│  │  ├─ publishing/
│  │  └─ analytics/
│  ├─ providers/
│  │  ├─ interfaces/
│  │  ├─ mock/
│  │  ├─ youtube/
│  │  ├─ gemini/
│  │  ├─ notebook/
│  │  ├─ trends/
│  │  ├─ ads/
│  │  └─ storage/
│  ├─ contracts/
│  │  ├─ api/
│  │  ├─ events/
│  │  └─ llm/
│  ├─ ui/
│  ├─ observability/
│  └─ config/
├─ docs/
│  ├─ SHORTS_INTELLIGENCE_OS_SPEC.md
│  ├─ IMPLEMENTATION_STATUS.md
│  ├─ ADR/
│  └─ runbooks/
├─ tooling/
├─ turbo.json
├─ pnpm-workspace.yaml
└─ package.json
~~~

## 4.4 Domain과 Provider 경계

Domain은 외부 SDK 타입을 직접 알면 안 된다.

~~~typescript
export interface YouTubeDiscoveryProvider {
  searchVideos(input: SearchVideosInput): Promise<SearchVideosResult>;
  getVideos(input: GetVideosInput): Promise<NormalizedVideo[]>;
  getChannelBaseline(input: ChannelBaselineInput): Promise<ChannelBaseline>;
}

export interface ResearchProvider {
  researchTopic(input: ResearchTopicInput): Promise<GroundedResearchResult>;
}

export interface NotebookProvider {
  createNotebook(input: CreateNotebookInput): Promise<ExternalNotebook>;
  addSources(input: AddNotebookSourcesInput): Promise<NotebookSyncResult>;
  getNotebook(input: GetNotebookInput): Promise<ExternalNotebook>;
}

export interface VideoGenerationProvider {
  getCapabilities(): Promise<VideoProviderCapabilities>;
  createClip(input: CreateClipInput): Promise<ExternalOperation>;
  getOperation(input: GetOperationInput): Promise<ExternalOperation>;
}

export interface TokenVault {
  put(input: PutSecretInput): Promise<SecretReference>;
  get(reference: SecretReference): Promise<string>;
  revoke(reference: SecretReference): Promise<void>;
}
~~~

## 4.5 핵심 Workflow

~~~mermaid
stateDiagram-v2
    [*] --> Draft
    Draft --> Collecting: collect signals
    Collecting --> Scored: calculate
    Collecting --> Failed: provider error
    Failed --> Collecting: retry
    Scored --> Approved: human approve
    Scored --> Rejected: human reject
    Approved --> Researching: start research
    Researching --> BriefReady: cited brief
    BriefReady --> Producing: generate content
    Producing --> QAReview: run checks
    QAReview --> ApprovedToRender: approve
    QAReview --> Producing: revise
    ApprovedToRender --> Rendered
    Rendered --> PublishReview
    PublishReview --> Published: explicit approval
~~~

각 상태 전이는 Domain Service가 검증한다. UI에서 Status 값을 직접 덮어쓰지 않는다.

## 4.6 외부 Provider 기능표

| Provider | 기본 | 권한 없을 때 | 비고 |
|---|---:|---|---|
| YouTube Data API | On | Demo/Manual URL | 공개 메타데이터 |
| Gemini Research | Phase 2 On | Manual Source | Search Grounding |
| Notebook Enterprise | Off | 동기화 생략 | Preview, 기능 플래그 |
| Google Trends API | Off | CSV/null | Alpha 접근 필요 |
| Google Ads API | Off | CSV/null | 토큰·허용 용도 확인 |
| YouTube Analytics | Off | Analytics 없음 | 본인 채널 OAuth |
| Gemini Video | Off | Asset 수동 업로드 | Phase 4 |
| YouTube Upload | Off | Export only | 사람 승인 필수 |

---

# 5. Niche와 Topic 점수 설계

## 5.1 점수와 신뢰도를 분리

Opportunity Score는 기회 크기이고 Confidence는 그 판단을 뒷받침하는 데이터의 충분함이다.

예:

| Topic | Score | Confidence | 해석 |
|---|---:|---:|---|
| A | 91 | 88 | 우선 제작 후보 |
| B | 93 | 34 | 좋아 보이지만 데이터 보강 필요 |
| C | 76 | 91 | 안정적 관찰 후보 |

## 5.2 기본 Weight

| 신호 | Weight | 값 출처 |
|---|---:|---|
| YouTube View Velocity | 25 | 공개 조회수 / 영상 나이 |
| Search Interest / Trend | 15 | Trends 또는 수동 자료 |
| Commercial Intent | 15 | 승인된 Ads 자료 또는 근거 기반 분류 |
| Competition Gap | 15 | 수요 대비 최근 양질 공급량 |
| Shorts Fit | 10 | 60초 내 전달성, 시각성, Hook 가능성 |
| Repeatability | 8 | 후속편·시리즈 확장성 |
| Source Quality | 7 | 출처 수, 독립성, 최신성 |
| Policy Safety | 5 | 민감 주제, 오해·재사용 위험 |
| 합계 | 100 | |

Workspace별로 Weight를 바꿀 수 있지만 합계는 100이어야 한다. 변경 시 새 score_config_version을 생성하고 기존 Snapshot을 덮어쓰지 않는다.

## 5.3 결측값 처리

결측값을 0점으로 처리하지 않는다.

~~~text
available_weight = 사용 가능한 신호의 Weight 합
raw_score = 각 사용 가능 신호의 score × weight 합
opportunity_score = raw_score / available_weight
~~~

Confidence는 다음을 결합한다.

~~~text
coverage = available_weight / 100
freshness = 신호별 최신성 가중 평균
sample = 영상·Source 표본 수의 포화 점수
reliability = Provider 신뢰 등급 가중 평균

confidence = 0.40 × coverage
           + 0.25 × freshness
           + 0.20 × sample
           + 0.15 × reliability
~~~

최종 UI는 0–100으로 변환한다.

## 5.4 View Velocity

초기 수집:

~~~text
view_velocity = public_view_count / max(video_age_hours, 1)
~~~

Breakout Ratio:

~~~text
breakout_ratio = target_view_velocity / median_comparable_channel_velocity
~~~

비교군은 같은 채널, 유사 게시 기간, 유사 길이의 최근 영상으로 구성한다. 비교군이 5개 미만이면 Confidence를 낮춘다.

처음 수집한 오래된 영상은 과거 특정 시점의 속도를 알 수 없으므로 근사치로 표시한다. 앱이 1시간·6시간·24시간 Snapshot을 축적한 뒤 실제 성장 속도를 사용한다.

## 5.5 Shorts 판정

공개 Data API만으로 모든 경쟁 영상의 세로 비율과 Shorts 분류를 확정할 수 없으므로:

- duration이 180초 이하이면 short_candidate = true
- 명확한 Shorts URL 또는 본인 Analytics 분류가 확인되면 is_short = true
- 정보가 부족하면 is_short = null

UI에서 Candidate와 Confirmed를 구분한다.

## 5.6 Decision Band

| 조건 | 결과 |
|---|---|
| Score 85 이상, Confidence 60 이상, Hard Block 없음 | Produce 후보 |
| Score 85 이상, Confidence 60 미만 | Research More |
| Score 70–84 | Watch |
| Score 70 미만 | Skip 후보 |
| Policy Hard Block 또는 출처 위조 | Reject |

자동으로 제작 상태로 이동하지 않고 사람이 승인한다.

## 5.7 Score Breakdown 예시

~~~json
{
  "score": 86.7,
  "confidence": 78.4,
  "decision": "PRODUCE_CANDIDATE",
  "configVersion": 3,
  "signals": [
    {
      "key": "youtube_velocity",
      "rawValue": 16647,
      "normalizedScore": 92,
      "weight": 25,
      "available": true,
      "sourceCount": 12,
      "freshnessHours": 2
    },
    {
      "key": "search_interest",
      "rawValue": null,
      "normalizedScore": null,
      "weight": 15,
      "available": false,
      "reason": "GOOGLE_TRENDS_NOT_CONNECTED"
    }
  ],
  "penalties": [],
  "calculatedAt": "2026-09-03T10:00:00Z"
}
~~~

---

# 6. Database 설계

## 6.1 데이터 설계 원칙

- PostgreSQL이 앱의 Source of Truth다.
- Notebook, YouTube, Gemini Operation ID는 외부 참조값으로만 저장한다.
- 모든 업무 데이터는 workspace_id를 가진다.
- 점수, Prompt, Script, QA는 버전을 남기며 기존 결과를 덮어쓰지 않는다.
- 외부 API 원문은 필요한 필드만 보존하고 개인정보와 Secret은 저장하지 않는다.
- 시간은 timestamptz와 UTC로 저장하고 UI에서 사용자 시간대로 변환한다.
- 금액은 통화 코드와 함께 저장한다.
- 유사도 Embedding은 모델과 차원을 함께 기록한다.

## 6.2 핵심 관계

~~~mermaid
erDiagram
    WORKSPACE ||--o{ NICHE : owns
    NICHE ||--o{ TOPIC : contains
    TOPIC ||--o{ SOURCE : supported_by
    TOPIC ||--o{ RESEARCH_BRIEF : summarizes
    RESEARCH_BRIEF ||--o{ CONTENT_PROJECT : starts
    CONTENT_PROJECT ||--o{ SCRIPT : versions
    SCRIPT ||--o{ SHOT : contains
    CONTENT_PROJECT ||--o{ RENDER : produces
    RENDER ||--o{ PUBLISH_JOB : submits
    PUBLISH_JOB ||--o| PUBLISHED_VIDEO : creates
~~~

## 6.3 초기 Migration SQL

아래 스키마를 packages/db/migrations/0001_initial.sql의 기준으로 사용한다. Cursor는 Drizzle schema와 SQL migration이 동일한지 테스트해야 한다.

~~~sql
create extension if not exists pgcrypto;
create extension if not exists citext;
create extension if not exists vector;

create type member_role as enum ('owner', 'operator', 'reviewer', 'viewer');
create type integration_status as enum (
  'disconnected', 'pending', 'connected', 'degraded', 'error', 'revoked'
);
create type niche_status as enum ('active', 'paused', 'archived');
create type topic_decision as enum (
  'new', 'watch', 'approved', 'rejected', 'archived'
);
create type run_status as enum (
  'queued', 'running', 'waiting', 'succeeded', 'failed', 'cancelled'
);
create type research_status as enum (
  'draft', 'collecting', 'ready', 'needs_review', 'approved', 'failed'
);
create type project_status as enum (
  'draft',
  'research_ready',
  'scripting',
  'qa_review',
  'approved_to_render',
  'rendering',
  'rendered',
  'publish_review',
  'published',
  'rejected',
  'archived'
);
create type qa_result as enum ('pass', 'warn', 'fail', 'not_run');
create type approval_decision as enum ('approved', 'rejected', 'changes_requested');
create type asset_type as enum (
  'image', 'video_clip', 'voice', 'music', 'subtitle', 'thumbnail', 'final_video'
);
create type publish_status as enum (
  'draft', 'awaiting_approval', 'approved', 'uploading',
  'scheduled', 'published', 'failed', 'cancelled'
);

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  slug citext not null unique,
  owner_user_id uuid not null,
  timezone text not null default 'Asia/Seoul',
  default_locale text not null default 'ko-KR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table workspace_members (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null,
  role member_role not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table workspace_settings (
  workspace_id uuid primary key references workspaces(id) on delete cascade,
  target_countries text[] not null default array['KR'],
  content_languages text[] not null default array['ko'],
  default_currency char(3) not null default 'USD',
  daily_ai_budget numeric(12,4),
  monthly_ai_budget numeric(12,4),
  feature_flags jsonb not null default '{}'::jsonb,
  provider_limits jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table integrations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  provider text not null,
  display_name text not null,
  status integration_status not null default 'disconnected',
  external_account_id text,
  secret_ref text,
  scopes text[] not null default '{}',
  capabilities jsonb not null default '{}'::jsonb,
  quota_snapshot jsonb not null default '{}'::jsonb,
  token_expires_at timestamptz,
  last_verified_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider, display_name)
);

create table channels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  integration_id uuid references integrations(id) on delete set null,
  provider text not null default 'youtube',
  external_channel_id text not null,
  channel_kind text not null check (channel_kind in ('owned', 'competitor')),
  title text not null,
  handle text,
  country_code char(2),
  default_language text,
  thumbnail_url text,
  subscriber_count bigint,
  video_count bigint,
  metadata jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider, external_channel_id)
);

create table brand_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  channel_id uuid references channels(id) on delete set null,
  name text not null,
  description text,
  target_audience jsonb not null default '{}'::jsonb,
  voice_rules jsonb not null default '{}'::jsonb,
  visual_rules jsonb not null default '{}'::jsonb,
  forbidden_patterns jsonb not null default '[]'::jsonb,
  default_duration_seconds integer not null default 45
    check (default_duration_seconds between 5 and 180),
  default_language text not null default 'ko',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table score_configs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  version integer not null,
  name text not null,
  weights jsonb not null,
  thresholds jsonb not null,
  active boolean not null default false,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (workspace_id, version)
);

create unique index score_configs_one_active_idx
  on score_configs(workspace_id)
  where active = true;

create table niches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  slug citext not null,
  name text not null,
  description text,
  status niche_status not null default 'active',
  target_country char(2) not null,
  target_language text not null,
  seed_keywords text[] not null default '{}',
  include_terms text[] not null default '{}',
  exclude_terms text[] not null default '{}',
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug, target_country, target_language)
);

create table niche_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  niche_id uuid not null references niches(id) on delete cascade,
  score_config_id uuid not null references score_configs(id),
  opportunity_score numeric(5,2),
  confidence_score numeric(5,2),
  decision_band text,
  signal_values jsonb not null default '{}'::jsonb,
  score_breakdown jsonb not null default '{}'::jsonb,
  sample_size integer not null default 0,
  collected_at timestamptz not null,
  calculated_at timestamptz not null default now(),
  check (opportunity_score is null or opportunity_score between 0 and 100),
  check (confidence_score is null or confidence_score between 0 and 100)
);

create index niche_metric_latest_idx
  on niche_metric_snapshots(niche_id, calculated_at desc);

create table topics (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  niche_id uuid not null references niches(id) on delete cascade,
  title text not null,
  normalized_title citext not null,
  angle_hint text,
  target_country char(2) not null,
  target_language text not null,
  decision topic_decision not null default 'new',
  decision_reason text,
  decided_by uuid,
  decided_at timestamptz,
  discovered_by text not null,
  first_discovered_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, niche_id, normalized_title, target_country, target_language)
);

create index topics_queue_idx
  on topics(workspace_id, decision, last_seen_at desc);

create table topic_signals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  topic_id uuid not null references topics(id) on delete cascade,
  signal_key text not null,
  provider text not null,
  raw_numeric numeric,
  raw_text text,
  normalized_score numeric(5,2),
  signal_confidence numeric(5,2),
  unit text,
  sample_size integer not null default 0,
  freshness_hours numeric(10,2),
  raw_payload jsonb not null default '{}'::jsonb,
  collected_at timestamptz not null,
  check (normalized_score is null or normalized_score between 0 and 100),
  check (signal_confidence is null or signal_confidence between 0 and 100)
);

create index topic_signals_latest_idx
  on topic_signals(topic_id, signal_key, collected_at desc);

create table topic_score_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  topic_id uuid not null references topics(id) on delete cascade,
  score_config_id uuid not null references score_configs(id),
  opportunity_score numeric(5,2) not null check (opportunity_score between 0 and 100),
  confidence_score numeric(5,2) not null check (confidence_score between 0 and 100),
  decision_band text not null,
  available_weight numeric(5,2) not null,
  score_breakdown jsonb not null,
  penalties jsonb not null default '[]'::jsonb,
  calculated_at timestamptz not null default now()
);

create index topic_scores_latest_idx
  on topic_score_snapshots(topic_id, calculated_at desc);

create table reference_videos (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  channel_id uuid references channels(id) on delete set null,
  provider text not null default 'youtube',
  external_video_id text not null,
  external_channel_id text not null,
  url text not null,
  title text not null,
  description text,
  published_at timestamptz,
  duration_seconds integer,
  view_count bigint,
  like_count bigint,
  comment_count bigint,
  short_candidate boolean not null default false,
  is_short boolean,
  short_classification_source text,
  metadata jsonb not null default '{}'::jsonb,
  first_collected_at timestamptz not null default now(),
  last_collected_at timestamptz not null default now(),
  unique (workspace_id, provider, external_video_id)
);

create table topic_reference_videos (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  topic_id uuid not null references topics(id) on delete cascade,
  reference_video_id uuid not null references reference_videos(id) on delete cascade,
  relevance_score numeric(5,2),
  relation_type text not null default 'discovery',
  created_at timestamptz not null default now(),
  primary key (topic_id, reference_video_id),
  check (relevance_score is null or relevance_score between 0 and 100)
);

create index topic_reference_videos_video_idx
  on topic_reference_videos(reference_video_id, topic_id);

create table video_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  reference_video_id uuid not null references reference_videos(id) on delete cascade,
  view_count bigint,
  like_count bigint,
  comment_count bigint,
  view_velocity numeric,
  breakout_ratio numeric,
  snapshot_age_hours numeric,
  collected_at timestamptz not null,
  unique (reference_video_id, collected_at)
);

create table notebook_collections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  niche_id uuid references niches(id) on delete set null,
  integration_id uuid not null references integrations(id) on delete cascade,
  provider_notebook_id text not null,
  provider_resource_name text,
  title text not null,
  locale text not null,
  volume_number integer not null default 1,
  status text not null default 'active',
  source_count integer not null default 0,
  notebook_url text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, integration_id, provider_notebook_id)
);

create table sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  reference_video_id uuid references reference_videos(id) on delete set null,
  source_type text not null,
  provider text not null,
  canonical_url text,
  title text,
  author text,
  publisher text,
  excerpt text,
  content_text text,
  published_at timestamptz,
  retrieved_at timestamptz not null default now(),
  quality_score numeric(5,2),
  rights_status text not null default 'reference_only',
  content_hash text,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector,
  embedding_model text,
  embedding_dimensions integer,
  created_at timestamptz not null default now(),
  check (quality_score is null or quality_score between 0 and 100)
);

create unique index sources_canonical_url_idx
  on sources(workspace_id, canonical_url)
  where canonical_url is not null;

create table topic_sources (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  topic_id uuid not null references topics(id) on delete cascade,
  source_id uuid not null references sources(id) on delete cascade,
  relevance_score numeric(5,2),
  relation_reason text,
  created_at timestamptz not null default now(),
  primary key (topic_id, source_id),
  check (relevance_score is null or relevance_score between 0 and 100)
);

create index topic_sources_source_idx
  on topic_sources(source_id, topic_id);

create table notebook_source_syncs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  notebook_collection_id uuid not null references notebook_collections(id) on delete cascade,
  source_id uuid not null references sources(id) on delete cascade,
  provider_source_id text,
  provider_resource_name text,
  status run_status not null default 'queued',
  attempt_count integer not null default 0,
  last_error_code text,
  last_error_message text,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (notebook_collection_id, source_id)
);

create table research_briefs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  topic_id uuid not null references topics(id) on delete cascade,
  version integer not null,
  status research_status not null default 'draft',
  executive_summary text,
  key_facts jsonb not null default '[]'::jsonb,
  audience_insights jsonb not null default '[]'::jsonb,
  angles jsonb not null default '[]'::jsonb,
  counterpoints jsonb not null default '[]'::jsonb,
  unknowns jsonb not null default '[]'::jsonb,
  citations jsonb not null default '[]'::jsonb,
  citation_coverage numeric(5,2),
  model_name text,
  prompt_version text not null,
  input_hash text not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  approved_by uuid,
  approved_at timestamptz,
  unique (topic_id, version)
);

create table dna_patterns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  niche_id uuid references niches(id) on delete set null,
  reference_video_id uuid references reference_videos(id) on delete set null,
  pattern_type text not null,
  name text not null,
  abstraction_level text not null default 'structural',
  structured_pattern jsonb not null,
  evidence jsonb not null default '[]'::jsonb,
  confidence_score numeric(5,2),
  safe_to_reuse boolean not null default true,
  model_name text,
  prompt_version text,
  created_at timestamptz not null default now(),
  check (confidence_score is null or confidence_score between 0 and 100)
);

create table content_projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  topic_id uuid not null references topics(id),
  research_brief_id uuid references research_briefs(id),
  channel_id uuid references channels(id),
  brand_profile_id uuid references brand_profiles(id),
  title text not null,
  target_language text not null,
  target_duration_seconds integer not null check (target_duration_seconds between 5 and 180),
  status project_status not null default 'draft',
  owner_user_id uuid not null,
  selected_angle_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table content_angles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  content_project_id uuid not null references content_projects(id) on delete cascade,
  version integer not null,
  title text not null,
  hook text not null,
  promise text not null,
  outline jsonb not null,
  novelty_rationale text,
  score_breakdown jsonb not null default '{}'::jsonb,
  selected boolean not null default false,
  created_at timestamptz not null default now(),
  unique (content_project_id, version, title)
);

alter table content_projects
  add constraint content_projects_selected_angle_fk
  foreign key (selected_angle_id) references content_angles(id) on delete set null;

create table scripts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  content_project_id uuid not null references content_projects(id) on delete cascade,
  content_angle_id uuid references content_angles(id) on delete set null,
  version integer not null,
  title text not null,
  hook text not null,
  script_text text not null,
  structured_script jsonb not null,
  word_count integer not null,
  estimated_duration_seconds numeric(7,2) not null,
  factual_claims jsonb not null default '[]'::jsonb,
  originality_summary jsonb not null default '{}'::jsonb,
  model_name text,
  prompt_version text not null,
  input_hash text not null,
  status text not null default 'draft',
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (content_project_id, version)
);

create table script_citations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  script_id uuid not null references scripts(id) on delete cascade,
  source_id uuid not null references sources(id) on delete restrict,
  claim_key text not null,
  quote_excerpt text,
  support_level text not null check (support_level in ('direct', 'partial', 'context')),
  created_at timestamptz not null default now(),
  unique (script_id, source_id, claim_key)
);

create table shots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  script_id uuid not null references scripts(id) on delete cascade,
  sequence_no integer not null,
  start_seconds numeric(7,2) not null,
  end_seconds numeric(7,2) not null,
  narration text,
  on_screen_text text,
  visual_description text not null,
  camera_direction text,
  generation_prompt text,
  negative_prompt text,
  asset_strategy text not null check (
    asset_strategy in ('ai_video', 'ai_image', 'stock', 'user_upload', 'motion_graphic')
  ),
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (script_id, sequence_no),
  check (end_seconds > start_seconds)
);

create table media_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  content_project_id uuid not null references content_projects(id) on delete cascade,
  shot_id uuid references shots(id) on delete set null,
  asset_type asset_type not null,
  provider text not null,
  provider_operation_id text,
  storage_uri text,
  preview_uri text,
  mime_type text,
  byte_size bigint,
  checksum_sha256 text,
  prompt_text text,
  generation_parameters jsonb not null default '{}'::jsonb,
  rights_metadata jsonb not null default '{}'::jsonb,
  status run_status not null default 'queued',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table render_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  content_project_id uuid not null references content_projects(id) on delete cascade,
  version integer not null,
  status run_status not null default 'queued',
  render_manifest jsonb not null,
  output_asset_id uuid references media_assets(id) on delete set null,
  output_checksum_sha256 text,
  duration_seconds numeric(7,2),
  width integer,
  height integer,
  error_code text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (content_project_id, version)
);

create table qa_reviews (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  content_project_id uuid not null references content_projects(id) on delete cascade,
  script_id uuid references scripts(id) on delete cascade,
  render_job_id uuid references render_jobs(id) on delete cascade,
  check_type text not null,
  result qa_result not null,
  score numeric(5,2),
  severity text not null default 'info'
    check (severity in ('info', 'low', 'medium', 'high', 'blocker')),
  findings jsonb not null default '[]'::jsonb,
  model_name text,
  rule_version text not null,
  created_at timestamptz not null default now(),
  check (score is null or score between 0 and 100)
);

create table approvals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  entity_version integer,
  decision approval_decision not null,
  comment text,
  decided_by uuid not null,
  decided_at timestamptz not null default now(),
  snapshot_hash text not null
);

create index approvals_entity_idx
  on approvals(workspace_id, entity_type, entity_id, decided_at desc);

create table publish_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  content_project_id uuid not null references content_projects(id) on delete cascade,
  render_job_id uuid not null references render_jobs(id),
  channel_id uuid not null references channels(id),
  approval_id uuid not null references approvals(id),
  status publish_status not null default 'draft',
  title text not null,
  description text not null,
  tags text[] not null default '{}',
  privacy_status text not null default 'private'
    check (privacy_status in ('private', 'unlisted', 'public')),
  scheduled_at timestamptz,
  idempotency_key text not null,
  upload_session_ref text,
  external_video_id text,
  last_error_code text,
  last_error_message text,
  attempt_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, idempotency_key)
);

create table published_videos (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  publish_job_id uuid not null unique references publish_jobs(id),
  channel_id uuid not null references channels(id),
  content_project_id uuid not null references content_projects(id),
  provider text not null default 'youtube',
  external_video_id text not null,
  url text not null,
  published_at timestamptz,
  current_privacy_status text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider, external_video_id)
);

create table analytics_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  published_video_id uuid not null references published_videos(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  age_bucket text,
  views bigint,
  engaged_views bigint,
  watch_time_minutes numeric,
  average_view_duration_seconds numeric,
  average_view_percentage numeric(7,3),
  likes bigint,
  comments bigint,
  subscribers_gained bigint,
  estimated_revenue numeric(14,6),
  currency char(3) not null default 'USD',
  raw_payload jsonb not null default '{}'::jsonb,
  collected_at timestamptz not null default now(),
  unique (published_video_id, period_start, period_end, collected_at)
);

create table workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  workflow_type text not null,
  entity_type text,
  entity_id uuid,
  status run_status not null default 'queued',
  idempotency_key text,
  requested_by uuid not null,
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  progress numeric(5,2) not null default 0,
  error_code text,
  error_message text,
  retry_count integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (progress between 0 and 100)
);

create unique index workflow_runs_idempotency_idx
  on workflow_runs(workspace_id, idempotency_key)
  where idempotency_key is not null;

create index workflow_runs_queue_idx
  on workflow_runs(workspace_id, status, created_at desc);

create table workflow_steps (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  workflow_run_id uuid not null references workflow_runs(id) on delete cascade,
  sequence_no integer not null,
  step_key text not null,
  provider text,
  status run_status not null default 'queued',
  provider_request_id text,
  attempt_count integer not null default 0,
  input_summary jsonb not null default '{}'::jsonb,
  output_summary jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workflow_run_id, sequence_no)
);

create table cost_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  workflow_run_id uuid references workflow_runs(id) on delete set null,
  content_project_id uuid references content_projects(id) on delete set null,
  provider text not null,
  service text not null,
  model_name text,
  quantity numeric(18,6),
  unit text,
  estimated_cost numeric(14,6),
  actual_cost numeric(14,6),
  currency char(3) not null default 'USD',
  provider_request_id text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  actor_user_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_state jsonb,
  after_state jsonb,
  request_id text,
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index audit_logs_entity_idx
  on audit_logs(workspace_id, entity_type, entity_id, created_at desc);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'workspaces',
    'workspace_settings',
    'integrations',
    'channels',
    'brand_profiles',
    'niches',
    'topics',
    'notebook_collections',
    'notebook_source_syncs',
    'content_projects',
    'shots',
    'media_assets',
    'publish_jobs',
    'published_videos',
    'workflow_runs'
  ]
  loop
    execute format(
      'create trigger %I_set_updated_at before update on %I
       for each row execute function set_updated_at()',
      table_name,
      table_name
    );
  end loop;
end;
$$;

create or replace function is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
  );
$$;

create or replace function has_workspace_role(
  target_workspace_id uuid,
  allowed_roles member_role[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
      and wm.role = any(allowed_roles)
  );
$$;

create or replace function create_workspace_with_owner(
  workspace_name text,
  workspace_slug text,
  workspace_timezone text default 'Asia/Seoul',
  workspace_locale text default 'ko-KR'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_workspace_id uuid;
  current_user_id uuid;
begin
  current_user_id := auth.uid();
  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  insert into workspaces(name, slug, owner_user_id, timezone, default_locale)
  values (
    workspace_name,
    workspace_slug,
    current_user_id,
    workspace_timezone,
    workspace_locale
  )
  returning id into new_workspace_id;

  insert into workspace_members(workspace_id, user_id, role)
  values (new_workspace_id, current_user_id, 'owner');

  insert into workspace_settings(workspace_id)
  values (new_workspace_id);

  insert into score_configs(
    workspace_id,
    version,
    name,
    weights,
    thresholds,
    active,
    created_by
  )
  values (
    new_workspace_id,
    1,
    'Default v1',
    '{
      "youtube_velocity": 25,
      "search_interest": 15,
      "commercial_intent": 15,
      "competition_gap": 15,
      "shorts_fit": 10,
      "repeatability": 8,
      "source_quality": 7,
      "policy_safety": 5
    }'::jsonb,
    '{
      "produce_score": 85,
      "watch_score": 70,
      "minimum_produce_confidence": 60
    }'::jsonb,
    true,
    current_user_id
  );

  return new_workspace_id;
end;
$$;

grant execute on function create_workspace_with_owner(
  text,
  text,
  text,
  text
) to authenticated;

alter table workspaces enable row level security;
alter table workspace_members enable row level security;

create policy workspaces_select_member
on workspaces for select
using (is_workspace_member(id));

create policy workspaces_update_owner
on workspaces for update
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

create policy members_select_member
on workspace_members for select
using (is_workspace_member(workspace_id));

create policy members_manage_owner
on workspace_members for all
using (has_workspace_role(workspace_id, array['owner']::member_role[]))
with check (has_workspace_role(workspace_id, array['owner']::member_role[]));

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'workspace_settings',
    'integrations',
    'channels',
    'brand_profiles',
    'score_configs',
    'niches',
    'niche_metric_snapshots',
    'topics',
    'topic_signals',
    'topic_score_snapshots',
    'reference_videos',
    'topic_reference_videos',
    'video_metric_snapshots',
    'notebook_collections',
    'sources',
    'topic_sources',
    'notebook_source_syncs',
    'research_briefs',
    'dna_patterns',
    'content_projects',
    'content_angles',
    'scripts',
    'script_citations',
    'shots',
    'media_assets',
    'render_jobs',
    'qa_reviews',
    'approvals',
    'publish_jobs',
    'published_videos',
    'analytics_snapshots',
    'workflow_runs',
    'workflow_steps',
    'cost_events',
    'audit_logs'
  ]
  loop
    execute format('alter table %I enable row level security', table_name);
    execute format(
      'create policy %I_member_read on %I
       for select using (is_workspace_member(workspace_id))',
      table_name,
      table_name
    );
  end loop;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'channels',
    'brand_profiles',
    'niches',
    'topics',
    'topic_signals',
    'reference_videos',
    'topic_reference_videos',
    'sources',
    'topic_sources',
    'research_briefs',
    'dna_patterns',
    'content_projects',
    'content_angles',
    'scripts',
    'script_citations',
    'shots'
  ]
  loop
    execute format(
      'create policy %I_operator_write on %I
       for all
       using (
         has_workspace_role(
           workspace_id,
           array[''owner'', ''operator'']::member_role[]
         )
       )
       with check (
         has_workspace_role(
           workspace_id,
           array[''owner'', ''operator'']::member_role[]
         )
       )',
      table_name,
      table_name
    );
  end loop;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'workspace_settings',
    'integrations',
    'score_configs',
    'notebook_collections'
  ]
  loop
    execute format(
      'create policy %I_owner_write on %I
       for all
       using (
         has_workspace_role(workspace_id, array[''owner'']::member_role[])
       )
       with check (
         has_workspace_role(workspace_id, array[''owner'']::member_role[])
       )',
      table_name,
      table_name
    );
  end loop;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['qa_reviews', 'approvals']
  loop
    execute format(
      'create policy %I_reviewer_write on %I
       for all
       using (
         has_workspace_role(
           workspace_id,
           array[''owner'', ''reviewer'']::member_role[]
         )
       )
       with check (
         has_workspace_role(
           workspace_id,
           array[''owner'', ''reviewer'']::member_role[]
         )
       )',
      table_name,
      table_name
    );
  end loop;
end;
$$;
~~~

## 6.4 RLS 보강 규칙

위 초기 정책은 Workspace 격리의 기본선이다. 실제 운영 전 다음을 더 좁힌다.

| 행위 | 허용 역할 |
|---|---|
| 연동 생성·해제, 예산, Feature Flag | Owner |
| Niche·Topic·Script 수정 | Owner, Operator |
| QA 작성 | Owner, Reviewer |
| 게시 승인 | Owner, Reviewer |
| 공개 업로드 실행 | 승인된 내부 Worker만 |
| 조회 | 모든 Member |

웹 요청은 사용자 세션으로 RLS를 통과한다. Worker는 Service Role을 사용하되 내부 Endpoint 인증, Workspace 검증, Workflow Run 검증을 모두 거친다.

## 6.5 Seed Data

Demo Mode는 다음 데이터를 넣는다.

- Workspace: Demo Studio
- Niche: AI Automation, Career AI, Productivity
- Topic: 각 Niche 8개
- Reference Video: 각 Topic 5개
- 시간대별 Video Metric Snapshot
- Score Config v1
- 점수 3종: 높은 Score·높은 Confidence, 높은 Score·낮은 Confidence, 낮은 Score

Seed는 고정 Random Seed를 사용해 테스트 Snapshot이 매번 달라지지 않게 한다.

---

# 7. API 설계

## 7.1 공통 규칙

- Base URL: /api/v1
- Workspace Resource는 URL에 명시한다.
- 사용자 요청은 Supabase Session으로 인증한다.
- Worker 내부 요청은 짧은 수명의 서명 Token과 Workflow Run ID로 인증한다.
- 비동기 Command는 202 Accepted와 workflowRunId를 반환한다.
- 생성·재시도·게시 API는 Idempotency-Key Header를 필수로 받는다.
- 목록은 Cursor pagination을 사용한다.
- 수정 충돌 방지를 위해 version 또는 If-Match를 사용한다.
- 요청과 응답은 packages/contracts의 Zod Schema 하나에서 타입과 OpenAPI를 생성한다.
- 아래 ws_123 같은 ID는 문서 가독성을 위한 축약 예시이며 실제 Contract는 UUID를 검증한다.

### 성공 응답

~~~json
{
  "data": {
    "id": "uuid",
    "status": "queued"
  },
  "meta": {
    "requestId": "req_01...",
    "timestamp": "2026-09-03T10:00:00Z"
  }
}
~~~

### 오류 응답

~~~json
{
  "error": {
    "code": "PROVIDER_QUOTA_EXCEEDED",
    "message": "YouTube 수집 한도를 초과했습니다.",
    "retryable": true,
    "retryAfterSeconds": 3600,
    "details": {
      "provider": "youtube"
    }
  },
  "meta": {
    "requestId": "req_01..."
  }
}
~~~

### 표준 HTTP Status

| Status | 사용 |
|---:|---|
| 200 | 조회·동기 수정 성공 |
| 201 | Resource 생성 |
| 202 | 비동기 Workflow 접수 |
| 204 | 삭제 성공 |
| 400 | 잘못된 요청 |
| 401 | 로그인 필요 |
| 403 | 역할 또는 Scope 부족 |
| 404 | Resource 없음 |
| 409 | 상태 전이·버전·Idempotency 충돌 |
| 422 | 의미상 검증 실패 |
| 429 | Workspace 또는 Provider 한도 |
| 503 | Provider 비활성·일시 장애 |

## 7.2 Endpoint 목록

### Workspace와 설정

| Method | Path | 설명 | 역할 |
|---|---|---|---|
| POST | /workspaces | Workspace 생성 RPC 호출 | 로그인 |
| GET | /workspaces | 접근 가능한 Workspace | 전체 |
| GET | /workspaces/{workspaceId} | Workspace 상세 | 전체 |
| PATCH | /workspaces/{workspaceId} | 이름·시간대 수정 | Owner |
| GET | /workspaces/{workspaceId}/settings | 설정 조회 | 전체 |
| PATCH | /workspaces/{workspaceId}/settings | 국가·언어·예산·Flag | Owner |
| GET | /workspaces/{workspaceId}/members | 구성원 | 전체 |
| POST | /workspaces/{workspaceId}/members | 구성원 초대 | Owner |
| PATCH | /workspaces/{workspaceId}/members/{userId} | 역할 변경 | Owner |

### Integration

| Method | Path | 설명 |
|---|---|---|
| GET | /workspaces/{workspaceId}/integrations | 연결 상태와 Capability |
| POST | /workspaces/{workspaceId}/integrations/{provider}/connect | OAuth 또는 설정 시작 |
| GET | /oauth/{provider}/callback | OAuth Callback |
| POST | /workspaces/{workspaceId}/integrations/{integrationId}/verify | 연결 테스트 |
| DELETE | /workspaces/{workspaceId}/integrations/{integrationId} | Token 폐기 후 연결 해제 |
| POST | /workspaces/{workspaceId}/integrations/{provider}/imports | CSV Import |

Provider 값:

- youtube_data
- youtube_channel
- youtube_analytics
- gemini
- notebook_enterprise
- google_trends
- google_ads
- gcs

### Niche Radar

| Method | Path | 설명 |
|---|---|---|
| GET | /workspaces/{workspaceId}/niches | Niche와 최신 점수 |
| POST | /workspaces/{workspaceId}/niches | Niche 생성 |
| GET | /workspaces/{workspaceId}/niches/{nicheId} | 상세·추이·점수 근거 |
| PATCH | /workspaces/{workspaceId}/niches/{nicheId} | 키워드·시장·상태 수정 |
| DELETE | /workspaces/{workspaceId}/niches/{nicheId} | Archive 기본 |
| POST | /workspaces/{workspaceId}/niches/{nicheId}/collect | 신호 수집 Workflow |
| POST | /workspaces/{workspaceId}/niches/{nicheId}/rescore | 저장 신호로 재계산 |
| POST | /workspaces/{workspaceId}/niches/collect | 활성 Niche 일괄 수집 |
| GET | /workspaces/{workspaceId}/score-configs | 점수 설정 이력 |
| POST | /workspaces/{workspaceId}/score-configs | 새 버전 생성 |
| POST | /workspaces/{workspaceId}/score-configs/{id}/activate | 설정 활성화 |

### Topic Radar

| Method | Path | 설명 |
|---|---|---|
| POST | /workspaces/{workspaceId}/niches/{nicheId}/discover-topics | 후보 발견 Workflow |
| GET | /workspaces/{workspaceId}/topics | Filter·Sort 목록 |
| GET | /workspaces/{workspaceId}/topics/{topicId} | 신호·영상·점수 상세 |
| PATCH | /workspaces/{workspaceId}/topics/{topicId} | 제목·Angle Hint 수정 |
| POST | /workspaces/{workspaceId}/topics/{topicId}/decision | 승인·보류·제외 |
| POST | /workspaces/{workspaceId}/topics/{topicId}/refresh | 최신 신호 재수집 |
| POST | /workspaces/{workspaceId}/topics/bulk-decision | 최대 50건 일괄 결정 |

### Research와 Notebook

| Method | Path | 설명 |
|---|---|---|
| POST | /workspaces/{workspaceId}/topics/{topicId}/research | Research Workflow |
| GET | /workspaces/{workspaceId}/topics/{topicId}/sources | Source 목록 |
| POST | /workspaces/{workspaceId}/topics/{topicId}/sources | URL·Text 수동 추가 |
| DELETE | /workspaces/{workspaceId}/sources/{sourceId} | Source 연결 해제 |
| GET | /workspaces/{workspaceId}/research-briefs/{briefId} | Brief 상세 |
| POST | /workspaces/{workspaceId}/research-briefs/{briefId}/regenerate | 새 버전 |
| POST | /workspaces/{workspaceId}/research-briefs/{briefId}/approve | Brief 승인 |
| GET | /workspaces/{workspaceId}/notebooks | Notebook 연결 목록 |
| POST | /workspaces/{workspaceId}/notebooks/sync | 분류·동기화 Workflow |
| POST | /workspaces/{workspaceId}/notebooks/{notebookId}/sources | 선택 Source 동기화 |

### DNA와 Content Studio

| Method | Path | 설명 |
|---|---|---|
| POST | /workspaces/{workspaceId}/reference-videos/import | YouTube URL Import |
| POST | /workspaces/{workspaceId}/reference-videos/{id}/analyze | 구조 DNA 생성 |
| GET | /workspaces/{workspaceId}/dna-patterns | Pattern Library |
| POST | /workspaces/{workspaceId}/projects | 승인 Topic에서 Project 생성 |
| GET | /workspaces/{workspaceId}/projects | Project 목록 |
| GET | /workspaces/{workspaceId}/projects/{projectId} | Studio 상세 |
| POST | /workspaces/{workspaceId}/projects/{projectId}/angles | Angle 3개 생성 |
| POST | /workspaces/{workspaceId}/projects/{projectId}/angles/{angleId}/select | Angle 선택 |
| POST | /workspaces/{workspaceId}/projects/{projectId}/scripts | Script 새 버전 생성 |
| PATCH | /workspaces/{workspaceId}/scripts/{scriptId} | Script 수정 |
| POST | /workspaces/{workspaceId}/scripts/{scriptId}/shots | Shot List 생성 |
| POST | /workspaces/{workspaceId}/projects/{projectId}/qa | QA Workflow |
| POST | /workspaces/{workspaceId}/projects/{projectId}/approval | 승인·반려 |

### Video Factory와 게시

| Method | Path | 설명 |
|---|---|---|
| POST | /workspaces/{workspaceId}/projects/{projectId}/assets | Asset 생성·업로드 |
| POST | /workspaces/{workspaceId}/projects/{projectId}/render | Render Workflow |
| GET | /workspaces/{workspaceId}/renders/{renderId} | 진행률·Preview |
| POST | /workspaces/{workspaceId}/renders/{renderId}/retry | 실패 Step 재시도 |
| POST | /workspaces/{workspaceId}/renders/{renderId}/approve | 정확한 Render 승인 |
| POST | /workspaces/{workspaceId}/publish-jobs | 게시 초안 |
| POST | /workspaces/{workspaceId}/publish-jobs/{id}/approve | 게시 승인 |
| POST | /workspaces/{workspaceId}/publish-jobs/{id}/execute | 업로드 Workflow |
| POST | /workspaces/{workspaceId}/publish-jobs/{id}/cancel | 대기 작업 취소 |

### Analytics, 비용, Workflow

| Method | Path | 설명 |
|---|---|---|
| POST | /workspaces/{workspaceId}/analytics/sync | 본인 채널 동기화 |
| GET | /workspaces/{workspaceId}/analytics/overview | 핵심 KPI |
| GET | /workspaces/{workspaceId}/analytics/videos | 영상별 성과 |
| GET | /workspaces/{workspaceId}/learning/insights | 학습 인사이트 |
| GET | /workspaces/{workspaceId}/costs | Provider·Project별 비용 |
| GET | /workspaces/{workspaceId}/runs | Workflow 목록 |
| GET | /workspaces/{workspaceId}/runs/{runId} | Step, 오류, 비용 |
| POST | /workspaces/{workspaceId}/runs/{runId}/retry | 허용된 Step 재시도 |
| POST | /workspaces/{workspaceId}/runs/{runId}/cancel | 실행 취소 |

## 7.3 주요 Contract

### Niche 생성

~~~json
{
  "name": "AI Automation",
  "description": "업무 자동화와 AI 도구",
  "targetCountry": "US",
  "targetLanguage": "en",
  "seedKeywords": [
    "AI automation",
    "workflow automation",
    "AI agents"
  ],
  "includeTerms": [],
  "excludeTerms": [
    "crypto scam"
  ]
}
~~~

검증:

- seedKeywords 1–20개
- 각 Keyword 2–100자
- Country는 ISO 3166-1 alpha-2
- Language는 BCP 47 또는 시스템 표준 코드
- 동일 Workspace·시장·언어에서 Slug 중복 금지

### Niche 수집 실행

~~~http
POST /api/v1/workspaces/ws_123/niches/n_123/collect
Idempotency-Key: niche-n_123-2026-09-03
~~~

~~~json
{
  "providers": [
    "youtube_data",
    "google_trends"
  ],
  "lookbackDays": 30,
  "maxVideosPerKeyword": 25,
  "forceRefresh": false
}
~~~

~~~json
{
  "data": {
    "workflowRunId": "run_123",
    "status": "queued",
    "acceptedProviders": [
      "youtube_data"
    ],
    "skippedProviders": [
      {
        "provider": "google_trends",
        "reason": "FEATURE_DISABLED"
      }
    ]
  }
}
~~~

### Topic 목록

~~~http
GET /api/v1/workspaces/ws_123/topics?nicheId=n_123&decision=new&sort=-opportunityScore&minConfidence=40&limit=25
~~~

Topic Response 핵심:

~~~json
{
  "id": "topic_123",
  "title": "AI agents for weekly reporting",
  "decision": "new",
  "opportunityScore": 88.4,
  "confidenceScore": 72.1,
  "decisionBand": "produce",
  "latestSignals": {
    "youtubeVelocity": 91.3,
    "searchInterest": null,
    "commercialIntent": 70,
    "competitionGap": 82,
    "shortsFit": 94,
    "repeatability": 90,
    "sourceQuality": 63,
    "policySafety": 96
  },
  "missingSignals": [
    "search_interest"
  ],
  "scoreConfigVersion": 1,
  "lastUpdatedAt": "2026-09-03T09:00:00Z"
}
~~~

### Topic 결정

~~~json
{
  "decision": "approved",
  "reason": "Score와 Confidence가 모두 높고 채널 방향에 적합"
}
~~~

허용 상태:

- new → watch, approved, rejected
- watch → approved, rejected, archived
- approved → watch, archived
- rejected → watch, archived

### Research 실행

~~~json
{
  "mode": "grounded",
  "maxSources": 12,
  "preferredSourceTypes": [
    "official",
    "primary",
    "reputable_media"
  ],
  "freshnessDays": 90,
  "syncToNotebook": true
}
~~~

Research Brief의 Fact 구조:

~~~json
{
  "claimId": "claim_01",
  "claim": "주장 또는 확인된 사실",
  "status": "verified",
  "confidence": 0.91,
  "sourceIds": [
    "src_01",
    "src_04"
  ],
  "lastVerifiedAt": "2026-09-03T09:30:00Z"
}
~~~

Status:

- verified: Source가 직접 지지
- partially_supported: 일부만 지지
- disputed: Source 간 충돌
- unverified: 충분한 근거 없음

### Content Project 생성

~~~json
{
  "topicId": "topic_123",
  "researchBriefId": "brief_123",
  "channelId": "channel_123",
  "brandProfileId": "brand_123",
  "targetLanguage": "en",
  "targetDurationSeconds": 45
}
~~~

### Script Structured Output

~~~json
{
  "title": "The weekly report that writes itself",
  "hook": "Your Friday report can build itself before lunch.",
  "targetDurationSeconds": 45,
  "beats": [
    {
      "beatId": "b1",
      "startSeconds": 0,
      "endSeconds": 3,
      "purpose": "hook",
      "narration": "Your Friday report can build itself before lunch.",
      "onScreenText": "STOP WRITING WEEKLY REPORTS",
      "claimIds": []
    }
  ],
  "cta": {
    "type": "comment",
    "text": "Which report would you automate first?"
  }
}
~~~

### QA 실행과 결과

~~~json
{
  "checks": [
    "fact",
    "originality",
    "policy",
    "brand",
    "duration",
    "caption_readability"
  ],
  "scriptId": "script_123",
  "renderId": null
}
~~~

~~~json
{
  "data": {
    "overallResult": "warn",
    "blocking": false,
    "checks": [
      {
        "type": "fact",
        "result": "pass",
        "score": 96,
        "findings": []
      },
      {
        "type": "originality",
        "result": "warn",
        "score": 73,
        "findings": [
          {
            "severity": "medium",
            "message": "Hook 구조가 Reference 2개와 유사합니다.",
            "suggestion": "개인 사례 또는 다른 문제 정의로 시작하세요."
          }
        ]
      }
    ]
  }
}
~~~

### 게시 생성

~~~json
{
  "contentProjectId": "project_123",
  "renderJobId": "render_3",
  "channelId": "channel_123",
  "title": "The weekly report that writes itself",
  "description": "Description with sources and disclosure when needed.",
  "tags": [
    "AI automation",
    "productivity"
  ],
  "privacyStatus": "private",
  "scheduledAt": null
}
~~~

실행 전 서버 검증:

1. Render 상태가 succeeded
2. Render checksum과 승인 Snapshot checksum 일치
3. 최신 QA에 Blocker 없음
4. 승인자가 Owner 또는 Reviewer
5. YouTube OAuth에 Upload Scope 존재
6. Budget와 Upload quota 여유
7. 같은 Idempotency Key로 성공한 Publish 없음

## 7.4 표준 Error Code

| Code | 의미 | Retry |
|---|---|---:|
| AUTH_REQUIRED | 로그인 없음 | No |
| WORKSPACE_FORBIDDEN | Workspace 접근 불가 | No |
| ROLE_FORBIDDEN | 역할 부족 | No |
| VALIDATION_FAILED | 입력 검증 실패 | No |
| INVALID_STATE_TRANSITION | 현재 상태에서 실행 불가 | No |
| VERSION_CONFLICT | 수정 버전 충돌 | No |
| IDEMPOTENCY_CONFLICT | 같은 Key의 다른 Payload | No |
| PROVIDER_DISABLED | 기능 플래그 Off | No |
| PROVIDER_AUTH_REQUIRED | 연결·재인증 필요 | No |
| PROVIDER_SCOPE_MISSING | OAuth Scope 부족 | No |
| PROVIDER_QUOTA_EXCEEDED | 외부 한도 | Later |
| PROVIDER_RATE_LIMITED | 요청 속도 제한 | Yes |
| PROVIDER_TIMEOUT | 외부 응답 지연 | Yes |
| PROVIDER_BAD_RESPONSE | 응답 Schema 불일치 | Maybe |
| SOURCE_BLOCKED | URL 보안·Robots·정책 차단 | No |
| INSUFFICIENT_EVIDENCE | Brief 근거 부족 | After input |
| BUDGET_EXCEEDED | Workspace 비용 한도 | After approval |
| QA_BLOCKED | Blocker QA 존재 | After revision |
| RENDER_FAILED | 미디어 처리 실패 | Yes |
| UPLOAD_SESSION_EXPIRED | 업로드 Session 만료 | Yes, new session |

## 7.5 Event와 Workflow Step

Workflow Event Envelope:

~~~json
{
  "eventId": "evt_01",
  "eventType": "topic.research.requested",
  "eventVersion": 1,
  "workspaceId": "ws_123",
  "workflowRunId": "run_123",
  "entity": {
    "type": "topic",
    "id": "topic_123"
  },
  "occurredAt": "2026-09-03T10:00:00Z",
  "payload": {}
}
~~~

주요 Event:

- niche.signals.collection.requested
- niche.signals.collected
- topic.discovery.requested
- topic.scored
- topic.approved
- topic.research.requested
- research.sources.collected
- research.brief.generated
- notebook.sync.requested
- notebook.sync.completed
- content.angles.requested
- content.script.generated
- content.qa.completed
- media.clip.requested
- media.render.completed
- publish.approved
- publish.upload.requested
- publish.completed
- analytics.sync.completed

Consumer는 eventId 또는 workflowRunId + stepKey로 중복 처리를 막는다.

---

# 8. 화면 구조

## 8.1 전체 Navigation

| 순서 | 메뉴 | Route | 핵심 목적 |
|---:|---|---|---|
| 1 | Dashboard | /dashboard | 오늘의 할 일과 시스템 상태 |
| 2 | Niche Radar | /radar/niches | 분야 기회 비교 |
| 3 | Topic Radar | /radar/topics | 제작 주제 우선순위 |
| 4 | Research | /research | Source와 Brief |
| 5 | DNA Library | /dna | 성공 구조 Pattern |
| 6 | Content Studio | /studio | Angle·Script·Shot |
| 7 | Video Factory | /factory | Asset·Render |
| 8 | Publish Queue | /publish | 승인·예약·업로드 |
| 9 | Analytics | /analytics | 본인 채널 성과 |
| 10 | Learning | /learning | 다음 제작 인사이트 |
| 11 | Settings | /settings | 연동·점수·예산·팀 |

Phase에 포함되지 않은 메뉴는 가짜 화면을 만들지 않는다. Feature Flag가 꺼진 메뉴는 Disabled Badge와 활성화 조건을 보여주거나 Navigation에서 숨긴다.

## 8.2 공통 Layout

### 좌측 Sidebar

- Workspace Switcher
- 10개 주요 메뉴
- 하단: Provider 상태, 이번 달 사용 비용, Settings, 사용자 메뉴

### 상단 Header

- 현재 Page 제목
- 국가·언어 Context
- 마지막 동기화 시각
- 실행 중 Workflow
- 알림

### 공통 상태

모든 데이터 화면은 다음 다섯 상태를 구현한다.

1. Loading Skeleton
2. Empty State와 다음 행동
3. Partial Data Warning
4. Recoverable Error와 Retry
5. Permission Denied 설명

## 8.3 Dashboard

### 상단 KPI

| Card | 내용 |
|---|---|
| Produce 후보 | Score·Confidence 기준을 통과한 Topic 수 |
| 승인 대기 | Topic, Brief, Script, Render, Publish 합계 |
| 진행 중 | Workflow Run 수 |
| 월 사용 비용 | 예산 대비 실제·추정 비용 |

### 본문

- Today’s Priorities: 지금 처리할 항목 5개
- Niche Opportunity: 상위 Niche Bar Chart
- Topic Momentum: 최근 7일 Score 변화
- Workflow Health: 성공·실패·재시도
- Provider Health: 연결, Quota, 마지막 성공

### 주요 Action

- Scan Active Niches
- Review Top Topics
- Retry Failed Runs

## 8.4 Niche Radar

### 목록 Column

| Column | 설명 |
|---|---|
| Niche | 이름·국가·언어 |
| Opportunity | 0–100 |
| Confidence | 0–100 |
| YouTube Velocity | 최신 신호 |
| Search Interest | 값 또는 N/A |
| Commercial Intent | 값·Source |
| Competition Gap | 수요 대비 공급 |
| 7d Change | 점수 변화 |
| Last Scan | 마지막 수집 |
| Action | Scan, Open, Pause |

### 상세 Drawer

- Score Waterfall
- Raw Signal, Provider, 수집 시각, 표본 수
- Missing Signal
- 최근 30일 추이
- Seed Keyword
- 추천 조치

점수 숫자만 보여주지 말고 “왜 이 점수인가”를 한 문장으로 설명한다.

## 8.5 Topic Radar

### Filter

- Niche
- Country
- Language
- Decision
- Score 범위
- Confidence 범위
- 발견일
- Missing Signal 여부

### Table

- Checkbox
- Topic
- Niche
- Opportunity
- Confidence
- Breakout Reference 수
- Source 수
- Risk Badge
- Decision
- Last Seen

### 오른쪽 Detail Panel

- 추천 Hook 예시가 아닌 Angle Hint
- Score Breakdown
- 최신 Reference Video
- View Velocity와 계산 시각
- 정책 위험
- Approve, Watch, Reject

Bulk Approval은 최대 50건이며 확인 Dialog에서 대상과 이유를 다시 보여준다.

## 8.6 Research Detail

Route: /research/{topicId}

Tabs:

1. Overview
2. Sources
3. Research Brief
4. Notebook Sync
5. Run History

Overview:

- Topic Score
- 확인된 사실
- 논쟁 또는 불확실한 부분
- Audience Questions
- 추천 Angle

Sources:

- Source 유형, Publisher, 날짜, 품질, 사용 권리, Citation 횟수
- URL 추가
- Text 업로드
- 중복 Merge
- 제외

Notebook Sync:

- 대상 Notebook
- Provider 상태
- Source별 sync 상태
- 실패 항목만 재시도
- Open in Notebook

## 8.7 Content Studio

Route: /studio/{projectId}

상단 Stepper:

~~~text
Research → Angles → Script → Shots → QA → Render → Publish
~~~

### Angles

- 세 개 카드 비교
- Hook, Promise, Audience Fit, Novelty, Risk
- 한 개 선택
- 선택 변경 시 이전 Script는 보존하고 새 버전 필요 알림

### Script

- 좌측 Editor
- 우측 Citation·QA Panel
- 문장 또는 Claim 선택 시 Source 확인
- Version History
- Duration Estimate
- Regenerate Selected Beat

### Shots

- Timeline과 카드 목록
- 시작·종료 시간
- Narration
- On-screen Text
- Visual Description
- Asset Strategy
- Prompt
- 한 Shot당 핵심 동작 하나

### QA

- Fact
- Originality
- Policy
- Brand
- Duration
- Caption Readability

Blocker가 있으면 Approve to Render를 비활성화하고 이유를 바로 옆에 표시한다.

## 8.8 Video Factory

Kanban:

- Queued
- Generating
- Ready
- Failed
- Approved

Render Detail:

- 9:16 Preview
- Shot별 Asset
- 자막 Safe Area
- Audio loudness
- 누락 Asset
- Render Manifest
- 비용
- Retry Selected Shot
- New Render Version

## 8.9 Publish Queue

목록:

- Thumbnail/Preview
- Channel
- Title
- Privacy
- Scheduled time
- QA
- Approval
- Upload status

Publish Dialog:

1. 정확한 Render version과 checksum
2. Title, Description, Tags
3. AI 또는 altered content disclosure 항목
4. Privacy를 기본 private로 설정
5. Publish approval checkbox
6. 최종 실행

## 8.10 Analytics와 Learning

Analytics:

- 24h, 48h, 7d Views
- Engaged Views
- Average View Duration
- Average View Percentage
- Subscribers per 1K Views
- Cost per 1K Views
- Estimated Revenue: 본인 채널이며 권한이 있을 때만

Learning:

- 상위 Niche
- 상위 Hook Pattern
- 길이 구간별 성과
- 정보 밀도와 유지율 관계
- 게시 시간대별 성과
- 다음 실험 제안

상관관계를 인과관계로 표현하지 않는다. 표본이 적으면 Sample too small을 표시한다.

## 8.11 디자인 가이드

- 배경: White 또는 매우 옅은 Gray
- Primary: Deep Navy
- Accent: Blue
- Produce: Blue/Green + 아이콘
- Watch: Amber + 아이콘
- Skip/Fail: Red + 아이콘
- Font: Pretendard, Inter fallback
- 숫자는 Tabular Numerals
- Score는 원형 Gauge 남용을 피하고 표·Bar·Waterfall 중심
- 한 화면의 Primary CTA는 하나
- 데이터 출처와 최신 시각을 항상 가까이 표시

---

# 9. 핵심 Domain 로직

## 9.1 YouTube 수집 절차

Topic 발견 한 번의 기본 흐름:

1. Niche의 Seed Keyword를 Locale에 맞게 Query 후보로 확장한다.
2. Query 중복과 너무 넓은 표현을 제거한다.
3. YouTube Search Provider로 최근 영상 ID를 찾는다.
4. Video Detail을 Batch 조회하여 제목, 설명, 게시일, 공개 통계를 정규화한다.
5. 같은 external_video_id는 Upsert한다.
6. 현재 Metric Snapshot을 추가한다.
7. Keyword와 영상의 관련도를 평가한다.
8. Cluster를 Topic 후보로 변환한다.
9. Topic Signal을 생성하고 Score를 계산한다.

### 필수 보호장치

- Workspace별 동시 수집 수 제한
- Provider별 Cache와 Quota Budget
- 검색 Page 수 상한
- 최근 수집 결과 재사용
- 취소된 Run은 다음 API Step을 실행하지 않음
- 외부 응답에 없는 값은 null
- 공개 통계의 숨김 또는 비공개 값은 0으로 변환하지 않음

### Shorts 판정

경쟁 영상에 대해서 YouTube API가 모든 경우에 확정적인 Shorts 표시를 주지 않을 수 있다.

- duration_seconds가 180 이하이면 short_candidate = true
- is_short는 확인 가능한 Provider 근거가 있을 때만 true 또는 false
- 그 외에는 null
- 세로 비율을 알 수 없는 경쟁 영상은 임의 추정하지 않음

UI에서는 확정 Shorts와 Short Candidate를 구분한다.

## 9.2 View Velocity

첫 수집:

~~~text
age_hours = max((collected_at - published_at) / 1 hour, 1)
view_velocity = view_count / age_hours
~~~

두 번째 이후 수집:

~~~text
incremental_velocity =
  (current_view_count - previous_view_count)
  / max(hours_between_snapshots, 1)
~~~

Breakout Ratio:

~~~text
channel_baseline =
  median(incremental_velocity of comparable recent videos)

breakout_ratio =
  video_incremental_velocity / max(channel_baseline, epsilon)
~~~

Comparable 기준:

- 같은 Channel
- 비슷한 게시 후 Age Bucket
- 최근 90일
- 최소 표본 5개

표본이 부족하면 cohort baseline을 사용하고 Confidence를 낮춘다.

## 9.3 점수 계산 TypeScript 기준

~~~typescript
export const SIGNAL_WEIGHTS = {
  youtubeVelocity: 25,
  searchInterest: 15,
  commercialIntent: 15,
  competitionGap: 15,
  shortsFit: 10,
  repeatability: 8,
  sourceQuality: 7,
  policySafety: 5,
} as const;

type SignalKey = keyof typeof SIGNAL_WEIGHTS;

type SignalValue = {
  score: number | null;
  freshness: number;
  reliability: number;
  sampleScore: number;
  source: string;
};

type ScoreResult = {
  opportunityScore: number;
  confidenceScore: number;
  availableWeight: number;
  missingSignals: SignalKey[];
  breakdown: Record<string, unknown>;
};

export function calculateOpportunityScore(
  signals: Record<SignalKey, SignalValue>,
  weights: Record<SignalKey, number> = SIGNAL_WEIGHTS,
): ScoreResult {
  const entries = Object.entries(signals) as [SignalKey, SignalValue][];
  const available = entries.filter(([, value]) => value.score !== null);

  const availableWeight = available.reduce(
    (sum, [key]) => sum + weights[key],
    0,
  );

  if (availableWeight === 0) {
    throw new Error("INSUFFICIENT_SIGNALS");
  }

  const weightedTotal = available.reduce((sum, [key, value]) => {
    return sum + Number(value.score) * weights[key];
  }, 0);

  const opportunityScore = weightedTotal / availableWeight;
  const coverage = availableWeight / 100;

  const weightedAverage = (
    selector: (value: SignalValue) => number,
  ): number => {
    const total = available.reduce(
      (sum, [key, value]) => sum + selector(value) * weights[key],
      0,
    );
    return total / availableWeight;
  };

  const confidenceScore =
    100 *
    (0.4 * coverage +
      0.25 * weightedAverage((value) => value.freshness) +
      0.2 * weightedAverage((value) => value.sampleScore) +
      0.15 * weightedAverage((value) => value.reliability));

  return {
    opportunityScore: round2(opportunityScore),
    confidenceScore: round2(confidenceScore),
    availableWeight: round2(availableWeight),
    missingSignals: entries
      .filter(([, value]) => value.score === null)
      .map(([key]) => key),
    breakdown: buildExplainableBreakdown(signals, weights),
  };
}
~~~

필수 Unit Test:

1. 모든 Signal이 있을 때 가중 평균
2. 결측 Signal Weight 재정규화
3. 결측값을 0으로 처리하지 않는지
4. 값 범위 0–100 검증
5. Weight 합 100 검증
6. availableWeight가 0일 때 실패
7. 동일 입력의 동일 결과
8. Config version 변화가 과거 Snapshot을 바꾸지 않는지

## 9.4 Decision Band

기본값:

~~~text
PRODUCE:
  opportunityScore >= 85
  and confidenceScore >= 60
  and blockerPenalty = false

RESEARCH_MORE:
  opportunityScore >= 85
  and confidenceScore < 60
  and blockerPenalty = false

WATCH:
  opportunityScore >= 70
  and opportunityScore < 85
  and blockerPenalty = false

SKIP:
  opportunityScore < 70

REJECT:
  blockerPenalty = true
~~~

민감 주제, 근거 부족, 정책 위험은 단순 감점이 아니라 Blocker 또는 Review Required로 분리할 수 있다.

## 9.5 Topic Cluster

MVP:

- 제목과 설명을 정규화한다.
- Stopword와 Channel boilerplate를 제거한다.
- Gemini Structured Output으로 후보 Topic을 묶되, 입력 Video ID를 근거로 반환하게 한다.
- 결과를 Zod로 검증한다.
- 같은 normalized_title은 Upsert한다.
- 사람이 Merge 또는 Split할 수 있다.

Topic Cluster 출력:

~~~json
{
  "clusters": [
    {
      "normalizedTitle": "ai agents for weekly reporting",
      "displayTitle": "AI agents for weekly reporting",
      "summary": "주간보고 자동화에 AI agent를 사용하는 방법",
      "videoIds": [
        "yt_01",
        "yt_02"
      ],
      "keywords": [
        "weekly report",
        "AI agent"
      ],
      "confidence": 0.86
    }
  ]
}
~~~

Video ID가 입력에 없거나 Confidence가 기준 미만이면 저장하지 않는다.

---

# 10. LLM Prompt Registry

모든 Prompt는 packages/providers/gemini/prompts 아래에 파일로 보관하고 다음 Metadata를 가진다.

~~~typescript
type PromptDefinition = {
  id: string;
  version: string;
  purpose: string;
  inputSchema: string;
  outputSchema: string;
  system: string;
  userTemplate: string;
};
~~~

DB에는 prompt_version, model_name, input_hash를 기록한다. Prompt 변경은 새 버전으로 처리한다.

## 10.1 Research Brief System Prompt

~~~text
You are a research editor for short-form informational video.

Use only the supplied sources and tool-grounded results. Every factual claim must cite one or more source IDs from the input. Never invent a URL, source ID, number, quote, date, product capability, policy, or causal claim.

Prefer primary and official sources. Distinguish:
- verified
- partially_supported
- disputed
- unverified

If sources disagree, preserve the disagreement. If evidence is weak, say what is missing. Do not convert advertising CPC into creator RPM and do not estimate a competitor's private revenue.

Extract useful facts and audience questions, then propose original content angles. Do not copy source phrasing, scripts, sequence, or distinctive examples.

Return only JSON matching the provided schema.
~~~

Research Brief Output은 다음 필드를 포함한다.

- executiveSummary
- keyFacts
- disputedClaims
- audienceQuestions
- contentGaps
- angleCandidates
- unknowns
- citations

## 10.2 DNA Analyzer System Prompt

~~~text
Analyze abstract communication structure, not protected expression.

Allowed output:
- hook category
- pacing
- beat purposes
- information order
- visual change rhythm when observable
- emotional curve
- CTA category
- general success hypotheses

Do not reproduce sentences, distinctive metaphors, scene-by-scene creative expression, character designs, branded visual identity, or copyrighted clips. Do not claim access to a transcript unless transcript text is explicitly included in the input.

Every observation must identify its evidence type: public_metadata, user_supplied_transcript, owned_caption, or visual_observation.

Return only JSON matching the schema.
~~~

## 10.3 Angle Generator System Prompt

~~~text
Create three materially different short-form content angles from the approved research brief and brand profile.

Each angle must:
- serve the target audience
- make a clear promise
- fit the target duration
- add an original point of view, example, synthesis, or demonstration
- avoid unsupported claims
- avoid imitating a reference video's distinctive wording or sequence
- identify claim IDs it expects to use

Score each angle for hook strength, audience fit, novelty, evidence coverage, production feasibility, and policy safety. Explain each score briefly.

Return only JSON matching the schema.
~~~

## 10.4 Script Generator System Prompt

~~~text
Write a concise short-form script using only approved facts and the selected angle.

Rules:
- Match the brand profile and target language.
- Use one clear narrative arc.
- Keep spoken language natural.
- Map factual sentences to supplied claim IDs.
- Do not add statistics or product claims without a claim ID.
- Do not copy source wording except a short attributed quote explicitly marked as such.
- Keep the estimated spoken duration within plus or minus 10 percent of the target.
- On-screen text must be shorter than narration and readable on a phone.
- End with a relevant CTA; do not use manipulative engagement bait.

Return title, hook, beats, CTA, factualClaims, and estimatedDurationSeconds as JSON.
~~~

## 10.5 QA Judge Prompt

QA는 한 번의 “전체 점수” 요청보다 Check별 독립 검사를 우선한다.

### Fact Check

- Script Claim과 Claim ID 연결
- Source가 실제로 지지하는지
- 날짜가 오래됐는지
- 숫자·단위·조건 누락

### Originality Check

- 문장 N-gram 중복
- Semantic similarity
- Beat sequence 유사
- 독자적 분석·사례·시각화 비중

### Policy Check

- 반복 Template 위험
- 오해를 부르는 합성 장면
- 민감 분야 AI Persona
- 무단 재사용
- 과장 또는 근거 없는 수익 표현

QA 결과는 Pass/Warn/Fail, Findings, Evidence, Suggested Fix를 반환한다. Score만으로 승인하지 않는다.

---

# 11. Notebook 자동 분류 규칙

## 11.1 기본 단위

Notebook은 Topic 하나당 만들지 않고 Niche + Language 단위로 만든다.

예:

~~~text
AI Automation · EN · 2026 Q3 · Vol 1
Career AI · KO · 2026 Q3 · Vol 1
~~~

## 11.2 분류 순서

1. Source가 연결된 Topic의 Niche를 우선 사용
2. Niche가 없으면 Gemini가 기존 Niche 중 하나를 추천
3. Confidence 0.75 미만이면 Unclassified Queue
4. 해당 Niche·Language의 활성 Notebook 조회
5. 없으면 생성
6. 구성 가능한 Soft Limit에 도달하면 다음 Volume 생성
7. canonical_url과 content_hash로 중복 방지
8. Source 추가 후 Provider 상태를 Poll

Soft Limit은 공식 Provider 제한이 변경될 수 있으므로 환경설정으로 관리한다.

## 11.3 실패 처리

- Notebook 생성 실패: Run Step만 실패, Research는 유지
- Source 일부 실패: 성공 항목 Commit, 실패 항목 Retry 가능
- 401/403: 재인증 필요
- 429: Retry-After 존중
- Provider Schema 변경: PROVIDER_BAD_RESPONSE
- 삭제: DB Source 삭제와 Notebook Source 삭제를 별도 명령으로 구분

---

# 12. 영상 제작 Pipeline

## 12.1 Shot 원칙

- 9:16
- 한 Shot에 주된 동작 또는 정보 하나
- 장면마다 목적, Narration, Text, Visual, Duration 명시
- AI가 영상 속 문자를 직접 그리게 하지 않음
- Text는 Renderer가 후처리
- 캐릭터·제품·공간 일관성 정보는 모든 관련 Prompt에 포함

## 12.2 Asset 생성

Provider Capability를 먼저 조회한다.

~~~typescript
type VideoProviderCapabilities = {
  textToVideo: boolean;
  imageToVideo: boolean;
  referenceImages: boolean;
  firstLastFrame: boolean;
  nativeAudio: boolean;
  conversationalEdit: boolean;
  aspectRatios: string[];
  maxDurationSeconds: number | null;
  outputResolutions: string[];
};
~~~

모델명이 아니라 Capability로 기능을 켜고 끈다.

## 12.3 Render Manifest

~~~json
{
  "version": 1,
  "canvas": {
    "width": 1080,
    "height": 1920,
    "fps": 30
  },
  "timeline": [
    {
      "shotId": "shot_01",
      "assetId": "asset_01",
      "startSeconds": 0,
      "endSeconds": 3.2,
      "transition": "cut"
    }
  ],
  "voice": {
    "assetId": "voice_01",
    "targetLufs": -16
  },
  "music": {
    "assetId": "music_01",
    "gainDb": -20,
    "duckUnderVoice": true
  },
  "captions": {
    "assetId": "caption_01",
    "format": "ass",
    "safeAreaBottomPercent": 18
  }
}
~~~

## 12.4 Renderer 검증

- 출력 1080×1920 또는 설정값
- Duration 오차 250ms 이내
- 영상 Stream과 Audio Stream 존재
- 검은 Frame·무음·깨진 파일 탐지
- 자막 Safe Area
- 평균 Loudness와 Peak
- SHA-256 checksum
- ffprobe 결과 저장

---

# 13. 개발 순서

## Phase 0 — Foundation

### 구현

1. pnpm/Turborepo Monorepo
2. Next.js Web과 Node Worker
3. TypeScript strict, ESLint, Prettier
4. Supabase Auth와 Workspace
5. Drizzle Schema와 Migration
6. RLS 테스트
7. Provider interface와 Mock provider
8. Env validation
9. Pino logging과 requestId
10. Demo Seed
11. 기본 Sidebar와 Dashboard Shell

### 완료 조건

- 로그인 후 Workspace 생성 가능
- 다른 Workspace 데이터 접근 차단 테스트 통과
- Demo Mode에서 외부 Key 없이 실행
- lint, typecheck, unit test, build 통과
- Secret이 Client bundle에 포함되지 않음

### Cursor 실행 Prompt

~~~text
Implement Phase 0 from the specification.

Use Supabase local development and Drizzle SQL migrations. Implement the secure create_workspace_with_owner RPC, role-aware access checks, provider interfaces, mock providers, environment validation, and a seeded demo workspace.

Add automated tests proving that a user cannot read or mutate another workspace and that a viewer cannot execute write commands.

Do not implement real Google or YouTube calls yet.
Stop after all Phase 0 completion criteria pass.
~~~

## Phase 1 — Niche Radar와 Topic Radar

### 구현

1. Niche CRUD
2. Score Config versioning
3. YouTube Data Provider
4. Search/Video batch 수집과 Cache
5. Metric Snapshot
6. View Velocity와 초기 Baseline
7. Topic Cluster
8. Explainable Score와 Confidence
9. Niche·Topic 화면
10. Topic 승인·보류·제외
11. Workflow Run 화면

### 완료 조건

- Demo와 실제 YouTube Provider를 설정으로 전환 가능
- 외부 값이 null일 때 가짜 0이 생성되지 않음
- Score Breakdown 합계가 결과와 일치
- 같은 Idempotency Key 재호출이 중복 Run을 만들지 않음
- Provider 429/5xx Mock 테스트 통과
- Top Topic을 승인할 수 있음

### Cursor 실행 Prompt

~~~text
Implement Phase 1 only.

Build one vertical slice:
create niche → collect YouTube signals → normalize video data → persist snapshots → discover topic candidates → calculate explainable score and confidence → approve or reject a topic.

Use the official YouTube API client or direct documented REST endpoints behind YouTubeDiscoveryProvider. Add quota accounting, caching, batching, timeouts, retries, and deterministic tests with fixtures.

The UI must expose raw values, missing signals, formula contribution, freshness, sample size, and confidence.

Do not implement Notebook, research generation, media generation, analytics, or publishing.
~~~

## Phase 2 — Research Brain과 Notebook Sync

### 구현

1. Gemini Interactions Adapter
2. Google Search Grounding
3. Source 정규화·Canonicalization·Dedup
4. URL SSRF 방어
5. Citation 기반 Research Brief
6. 수동 URL/Text Source
7. Notebook Enterprise Adapter
8. Niche·Language 자동 분류
9. Source Sync와 Partial Retry
10. Google Trends/Ads CSV Import
11. 권한이 있을 때만 Trends/Ads API Adapter

### 완료 조건

- Brief의 모든 verified Fact에 유효 Source ID 존재
- Source ID를 조작한 LLM 응답은 Reject
- URL 중복과 Redirect 중복 제거
- Notebook Off에서도 Research 성공
- Notebook 부분 실패가 개별 항목에 표시
- 근거 부족 Topic은 needs_review

### Cursor 실행 Prompt

~~~text
Implement Phase 2 only.

Use Gemini structured output with Zod validation. Build source-grounded research with citation integrity checks. Every factual claim must point to source IDs that exist in the exact input set.

Implement Notebook Enterprise as an optional provider using its documented management and source APIs. It must never be required to generate a brief. Add manual source entry and CSV imports as fallbacks.

Add SSRF tests, citation-forgery tests, partial provider failure tests, and prompt version persistence.
~~~

## Phase 3 — DNA Library와 Content Studio

### 구현

1. Reference Video 수동 Import
2. 허용된 입력만 사용하는 DNA Analyzer
3. 세 가지 Angle
4. Angle 선택
5. Script versioning
6. Claim–Citation 매핑
7. Shot List
8. Fact, Originality, Policy, Brand, Duration QA
9. Reviewer 승인과 반려

### 완료 조건

- 사용자 제공 Transcript 여부가 명확히 표시
- Transcript가 없으면 모델이 대본을 봤다고 주장하지 않음
- Script의 모든 Fact Claim에 Citation 또는 Unverified Flag
- 이전 버전 복구 가능
- Blocker QA가 승인 차단
- 승인 시 Snapshot hash 저장

### Cursor 실행 Prompt

~~~text
Implement Phase 3 only.

Build the Content Studio workflow from an approved research brief to angles, script versions, shot list, QA, and approval.

Use structured outputs and keep every factual claim linked to source IDs. DNA analysis may use only abstract structural patterns and must record its evidence type. Implement deterministic text-overlap checks plus model-assisted semantic review.

Do not treat originality score as legal clearance. A blocker finding must prevent approval.
~~~

## Phase 4 — Video Factory

### 구현

1. Media upload
2. Gemini video Provider와 Capability discovery
3. Clip 생성·Operation Polling
4. Asset versioning
5. TTS와 BGM Adapter
6. ASS/SRT Caption
7. Cloud Run FFmpeg Renderer
8. Render Manifest
9. Preview와 Shot 재시도
10. 비용 기록

### 완료 조건

- Provider가 없으면 수동 Asset 업로드로 Render 가능
- 긴 작업이 Web request timeout에 의존하지 않음
- 같은 Render 명령의 중복 과금 방지
- ffprobe·Loudness·checksum 검증
- 실패 Shot만 재생성 가능

### Cursor 실행 Prompt

~~~text
Implement Phase 4 only.

Build provider-capability-based media generation and a containerized FFmpeg renderer. Text must be rendered in post-production rather than generated inside AI footage.

Persist provider operations, render manifests, costs, checksums, and failure details. Support manual asset upload as the no-provider fallback.

Add a local fixture render test and a Cloud Run container health check.
~~~

## Phase 5 — Human Approval과 YouTube 게시

### 구현

1. YouTube Channel OAuth
2. 최소 Scope 분리
3. Publish draft
4. Render 승인
5. Private 기본값
6. Resumable Upload
7. 예약 게시
8. Upload Session 복구
9. Audit Log

### 완료 조건

- 명시적 승인 없이는 execute 불가
- 승인 이후 Render 변경 시 승인 무효
- 재시도해도 중복 업로드 없음
- Token 폐기와 연결 해제 가능
- Test Channel에 Private upload E2E 통과

### Cursor 실행 Prompt

~~~text
Implement Phase 5 only.

Add explicit human approval and official YouTube resumable upload. Default every new publish job to private. Bind approval to an immutable render checksum and metadata snapshot.

Use a token-vault abstraction, minimum OAuth scopes, auditable state transitions, and idempotent recovery from interrupted uploads.

Never test public publishing automatically.
~~~

## Phase 6 — Analytics와 Learning

### 구현

1. YouTube Analytics OAuth
2. 24h, 48h, 7d Snapshot
3. Retention과 Engagement
4. 본인 채널 Revenue
5. 비용 결합
6. Cohort 비교
7. Winning Pattern
8. 다음 실험 제안

### 완료 조건

- 경쟁 채널 Revenue Column 없음
- 통화와 날짜 범위 명시
- 작은 표본 Warning
- 과거 Score Config별 성과 비교
- 상관관계를 인과로 단정하지 않음
- 실제 비용이 없으면 Estimated로 표시

### Cursor 실행 Prompt

~~~text
Implement Phase 6 only.

Sync authorized first-party YouTube Analytics into immutable snapshots and combine them with project cost events. Build cohort-aware dashboards and evidence-limited learning insights.

Never estimate private competitor revenue. Label estimates, missing values, small samples, and correlation limits clearly.
~~~

---

# 14. 환경변수와 초기 설정

## 14.1 .env.example

Model ID와 Provider 제한은 바뀔 수 있으므로 환경변수에서 관리한다.

~~~dotenv
# App
NODE_ENV=development
APP_URL=http://localhost:3000
LOG_LEVEL=info
DEMO_MODE=true
TOKEN_ENCRYPTION_KEY=
INTERNAL_WORKER_SIGNING_SECRET=

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
DATABASE_DIRECT_URL=

# Gemini
GEMINI_API_KEY=
GEMINI_TEXT_MODEL=gemini-3.8-flash
GEMINI_REASONING_MODEL=gemini-3.1-pro-preview
GEMINI_VIDEO_MODEL=gemini-omni-1.1-flash
GEMINI_STORE_INTERACTIONS=false

# YouTube public discovery
YOUTUBE_DATA_API_KEY=

# Google OAuth for owned channels
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/api/v1/oauth/google/callback

# Gemini Notebook Enterprise
NOTEBOOK_API_ENABLED=false
GOOGLE_NOTEBOOK_PROJECT_NUMBER=
GOOGLE_NOTEBOOK_LOCATION=global
NOTEBOOK_SOURCE_SOFT_LIMIT=200

# Google Trends
GOOGLE_TRENDS_API_ENABLED=false

# Google Ads
GOOGLE_ADS_API_ENABLED=false
GOOGLE_ADS_DEVELOPER_TOKEN=
GOOGLE_ADS_CUSTOMER_ID=
GOOGLE_ADS_LOGIN_CUSTOMER_ID=

# Storage
GCP_PROJECT_ID=
GCS_BUCKET=
GCP_SERVICE_ACCOUNT_SECRET_REF=

# Orchestration
TRIGGER_SECRET_KEY=
TRIGGER_PROJECT_REF=

# Media worker
MEDIA_WORKER_URL=http://localhost:4000
MEDIA_MAX_INPUT_MB=500
MEDIA_JOB_TIMEOUT_SECONDS=1800

# Budgets and guards
DEFAULT_DAILY_AI_BUDGET_USD=10
DEFAULT_MONTHLY_AI_BUDGET_USD=100
MAX_TOPICS_PER_DISCOVERY_RUN=50
MAX_SOURCES_PER_RESEARCH_RUN=20
MAX_CONCURRENT_WORKFLOWS_PER_WORKSPACE=3
~~~

Production Secret은 .env 파일에 배포하지 않는다. 배포 플랫폼의 Secret Store와 TokenVault를 사용한다.

## 14.2 OAuth Scope 분리

연결을 한 번에 과도하게 요청하지 않는다.

| 기능 | Scope 그룹 |
|---|---|
| 기본 로그인 | openid, email, profile |
| 본인 채널 읽기 | youtube.readonly |
| 일반 Analytics | yt-analytics.readonly |
| 수익 Analytics | yt-analytics-monetary.readonly |
| 업로드 | youtube.upload |
| Notebook | cloud-platform 또는 문서가 요구하는 최소 Discovery Engine Scope |

수익과 업로드 Scope는 해당 기능을 켤 때 추가 동의를 받는다. Scope 문자열은 Provider 공식 문서와 SDK에서 최종 확인하고 Contract Test에 고정한다.

## 14.3 로컬 실행 목표

~~~bash
corepack enable
pnpm install
pnpm supabase:start
pnpm db:migrate
pnpm db:seed
pnpm dev
~~~

필수 Script:

~~~json
{
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "typecheck": "turbo typecheck",
    "test": "turbo test",
    "test:integration": "turbo test:integration",
    "test:e2e": "turbo test:e2e",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "db:generate": "pnpm --filter @shorts-os/db db:generate",
    "db:migrate": "pnpm --filter @shorts-os/db db:migrate",
    "db:seed": "pnpm --filter @shorts-os/db db:seed",
    "supabase:start": "supabase start",
    "supabase:stop": "supabase stop"
  }
}
~~~

## 14.4 Feature Flag 기본값

~~~json
{
  "youtubeDiscovery": true,
  "geminiResearch": false,
  "notebookSync": false,
  "googleTrendsApi": false,
  "googleAdsApi": false,
  "videoGeneration": false,
  "youtubePublishing": false,
  "youtubeAnalytics": false,
  "autoPublish": false
}
~~~

autoPublish는 Full Product에서도 false를 유지한다.

---

# 15. Test 전략

## 15.1 Test Pyramid

| 종류 | 대상 | 도구 |
|---|---|---|
| Unit | 점수, 상태 전이, URL 정규화, 비용 | Vitest |
| Contract | Provider 정규화, LLM JSON Schema | Vitest + Fixture |
| Integration | DB, RLS, Migration, Repository | Supabase local |
| Worker | Retry, Idempotency, Render Manifest | Vitest |
| Media | FFmpeg 결과와 ffprobe | Docker fixture |
| E2E | 로그인→Topic 승인, Script 승인 | Playwright |
| Security | Workspace 침범, SSRF, Secret 노출 | Automated tests |

## 15.2 필수 E2E Scenario

### MVP

1. Demo Workspace 생성
2. Niche 생성
3. Mock Signal 수집
4. Topic 후보 확인
5. Score Breakdown 열기
6. Topic 승인
7. Research Brief 생성
8. Citation Source 열기
9. Angle 선택
10. Script·Shot 생성
11. QA Fail 확인
12. 수정 후 승인

### Publishing

1. Test Channel 연결
2. Fixture MP4 업로드
3. Render 승인
4. Publish Draft 생성
5. 승인 없는 실행이 409 또는 422
6. 승인 후 Private Upload
7. 네트워크 중단 후 Resume
8. 같은 Idempotency Key 재호출 시 같은 Job 반환

## 15.3 Failure Injection

- YouTube 429
- Gemini Timeout
- Notebook 일부 Source 실패
- OAuth Token 만료
- LLM invalid JSON
- LLM이 존재하지 않는 Source ID 반환
- GCS 업로드 중단
- FFmpeg exit code non-zero
- Worker가 완료 직전 재시작
- Publish upload session 만료
- DB unique conflict

각 오류는 사용자에게 다음을 알려야 한다.

- 무엇이 실패했는가
- 이미 저장된 것은 무엇인가
- 자동 재시도 여부
- 사용자가 할 수 있는 다음 행동

## 15.4 Quality Gate

모든 Phase 종료 시:

~~~bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
~~~

Phase 1 이후 UI 변경은 핵심 Page Playwright smoke test를 추가한다. Phase 4 이후 Worker image build와 Fixture render를 추가한다.

---

# 16. 보안·정책·저작권 Guardrail

## 16.1 수집

- 공식 API와 사용자가 제공한 Source를 우선한다.
- YouTube 웹페이지 Scraping 또는 인증 우회 금지
- 임의 경쟁 영상 Caption 다운로드 금지
- Provider Terms와 robots 정책을 존중
- URL Fetch는 허용 Domain이 아니라도 가능하지만 SSRF 차단과 콘텐츠 크기 제한을 적용
- Paywall 또는 로그인 벽을 우회하지 않음

## 16.2 생성

- Reference는 구조적 Pattern만 학습
- Phrase overlap과 Semantic similarity를 함께 검사
- Source 문장의 장문 인용 금지
- 사실과 의견을 분리
- 합성 또는 변경된 현실적 장면은 필요한 Disclosure Field에 연결
- 금융, 의료, 법률, 정치 등 민감 분야는 별도 Policy Profile과 사람 검토

## 16.3 수익화

- AI 사용 자체보다 결과물의 독창성, 일관된 이야기, 시청자 가치가 중요
- 대량 반복 Template, 다른 Source의 낭독, 미미한 수정, 연결되지 않는 AI Clip 조합을 차단
- 수익화 정책은 변경되므로 Settings에 Policy Version과 Last Reviewed At을 표시
- YPP 진입 조건은 앱 상수로 고정하지 않고 Admin Config와 공식 링크로 관리
- 수익 예측은 Range와 근거를 표시하며 보장 문구 금지

## 16.4 승인

승인은 다음 Snapshot Hash에 묶인다.

~~~text
hash(
  render_checksum
  + title
  + description
  + tags
  + privacy_status
  + scheduled_at
  + disclosure_answers
)
~~~

승인 후 하나라도 바뀌면 기존 승인을 무효화하고 다시 요청한다.

---

# 17. 운영과 배포

## 17.1 환경

| 환경 | Web | DB | Worker | Storage |
|---|---|---|---|---|
| Local | Next dev | Supabase local | Docker/local | Local emulator 또는 temp |
| Preview | Vercel Preview | Supabase staging | Staging worker | Staging bucket |
| Production | Vercel | Supabase prod | Cloud Run | Production bucket |

Preview와 Production의 OAuth Callback, Bucket, DB, Secret을 완전히 분리한다.

## 17.2 배포 순서

1. Migration dry run
2. DB backup 확인
3. Migration 적용
4. Worker 배포
5. Worker health와 internal auth 확인
6. Web 배포
7. Smoke test
8. Feature Flag로 새 Provider 점진 활성화

## 17.3 Schedule

초기 기본값:

| Job | 주기 | 대상 |
|---|---|---|
| Niche signal collection | 매일 1회 | active Niche |
| Hot Topic refresh | 6시간 | Score 상위·최근 Topic |
| Reference metric snapshot | 6–24시간 | 최근 영상 |
| Notebook retry | 30분 | 실패 Source |
| Analytics sync | 매일 | 본인 게시 영상 |
| Cost reconciliation | 매일 | Provider 비용 |

주기는 Provider quota와 Workspace Budget에 따라 자동 완화한다.

## 17.4 Observability

모든 Log에 포함:

- requestId
- workspaceId
- workflowRunId
- workflowStepId
- provider
- providerRequestId
- entityType
- entityId
- durationMs
- retryCount
- estimatedCost
- errorCode

절대 포함하지 않음:

- OAuth access/refresh token
- API key
- Service account key
- 전체 사용자 입력 문서
- Signed URL의 민감 Query

## 17.5 Alert

- Workflow 실패율 급증
- Provider 401/403
- Quota 80% 이상
- 일·월 Budget 80% 이상
- Publish 실패
- Analytics 동기화 48시간 이상 지연
- DB Migration 실패
- Worker Queue 적체

---

# 18. 첫 개발 주간 실행 순서

## Day 1 — Foundation

- Monorepo
- Tooling
- Supabase local
- Initial migration
- Auth shell

## Day 2 — Workspace와 Security

- Workspace RPC
- Member role
- RLS
- Security tests
- App layout

## Day 3 — Domain과 Demo

- Provider interfaces
- Mock YouTube
- Seed
- Workflow run
- Error normalization

## Day 4 — Niche Radar

- Niche CRUD
- Score config
- Score engine
- Unit tests
- Radar table

## Day 5 — Topic Radar

- Video fixture normalization
- Topic candidates
- Score detail
- Decision flow
- Playwright smoke test

실제 YouTube Key 연결은 위 흐름이 Demo Mode에서 안정적으로 끝난 뒤 진행한다.

---

# 19. Definition of Done

기능 하나가 Done이 되려면 모두 만족해야 한다.

- PRD Acceptance Criteria 충족
- Zod Contract 존재
- 권한 검증 존재
- 정상·빈 값·오류·부분 실패 UI 존재
- Idempotency 또는 중복 방지 검토
- Audit 필요 여부 검토
- Unit 또는 Integration Test 존재
- Log에 추적 ID 존재
- Secret과 개인정보 미노출
- 비용 발생 기능은 Cost Event 기록
- 사용자 문서 업데이트
- lint, typecheck, test, build 통과

다음 상태는 Done이 아니다.

- 버튼만 있고 Handler 없음
- 성공으로 고정된 Mock
- TODO 주석만 있는 Provider
- 오류를 삼키는 catch
- 타입을 피하기 위한 광범위한 any
- DB에만 있고 UI에서 설명되지 않는 오류
- Source 없는 AI 사실
- 승인 없이 실행 가능한 Publish

---

# 20. 구현 의사결정 요약

| 항목 | 결정 |
|---|---|
| 제품의 중심 | Niche/Topic 판단과 학습 |
| Source of Truth | PostgreSQL |
| Notebook | 선택형 지식 Workspace |
| 생성 엔진 | Gemini Interactions API Adapter |
| 외부 데이터 | 공식 API와 사용자 제공 자료 |
| 경쟁 Caption | 권한 없는 자동 다운로드 금지 |
| Google Trends | Alpha 접근 시 활성 |
| Google Ads | 승인된 용도 또는 CSV Import |
| 영상 생성 | Phase 4, Capability 기반 |
| 자막 | FFmpeg 후처리 |
| 게시 | 사람 승인 필수, Private 기본 |
| 점수 | Explainable Score + Confidence |
| 결측값 | 0이 아니라 null, Weight 재정규화 |
| 수익 | 본인 Analytics만 실제값 |
| 목표 | 수익 보장이 아닌 제작 ROI 개선 |

---

# 21. 공식 문서

구현 시 날짜와 Provider 변경 여부를 다시 확인한다.

- Gemini Notebook Enterprise — Notebook API  
  https://docs.cloud.google.com/gemini/enterprise/notebooklm-enterprise/docs/api-notebooks

- Gemini Notebook Enterprise — Source API  
  https://docs.cloud.google.com/gemini/enterprise/notebooklm-enterprise/docs/api-notebooks-sources

- Gemini Interactions API  
  https://ai.google.dev/gemini-api/docs/interactions-overview

- Gemini Grounding with Google Search  
  https://ai.google.dev/gemini-api/docs/google-search

- Gemini Structured Output  
  https://ai.google.dev/gemini-api/docs/structured-output

- Gemini Video Models  
  https://ai.google.dev/gemini-api/docs/video

- Gemini Omni Flash  
  https://ai.google.dev/gemini-api/docs/omni

- YouTube Data API  
  https://developers.google.com/youtube/v3

- YouTube videos.list  
  https://developers.google.com/youtube/v3/docs/videos/list

- YouTube Caption Download 권한  
  https://developers.google.com/youtube/v3/docs/captions/download

- YouTube API Quota  
  https://developers.google.com/youtube/v3/determine_quota_cost

- YouTube Resumable Upload  
  https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol

- YouTube Analytics Metrics  
  https://developers.google.com/youtube/analytics/metrics

- Google Trends API Alpha  
  https://developers.google.com/search/apis/trends

- Google Ads Historical Metrics  
  https://developers.google.com/google-ads/api/docs/keyword-planning/generate-historical-metrics

- Google Ads API Access와 Permissible Use  
  https://developers.google.com/google-ads/api/docs/api-policy/access-levels

- YouTube Channel Monetization Policies  
  https://support.google.com/youtube/answer/1311392

- YouTube Partner Program Eligibility  
  https://support.google.com/youtube/answer/72851

- 2027 YPP 변경 안내  
  https://support.google.com/youtube/answer/12843009

---

# 22. Cursor 최종 체크리스트

Cursor는 각 Phase 시작 전 다음 질문에 코드와 문서로 답해야 한다.

1. 이 기능은 어떤 사용자 문제를 해결하는가?
2. Domain 책임과 Provider 책임이 분리됐는가?
3. Provider가 꺼지거나 실패하면 무엇이 남는가?
4. null을 0이나 성공으로 바꾸지 않았는가?
5. 같은 명령이 두 번 오면 어떻게 되는가?
6. 비용과 Quota를 어디에 기록하는가?
7. Source와 Citation을 검증하는가?
8. 누가 실행·승인할 수 있는가?
9. 어떤 Test가 회귀를 막는가?
10. 사용자에게 실패 이유와 다음 행동이 보이는가?

이 열 가지에 답하지 못하는 기능은 다음 Phase로 넘기지 않는다.
