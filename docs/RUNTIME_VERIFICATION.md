# Runtime verification — 2026-09-10

## Final CI verification — 2026-09-11

Implementation commit: `466b94d4913ea3096dfae9b74aa07b9a93da0c4f`.
[CI run 34550933596](https://github.com/renee1004/shorts-studio-ai/actions/runs/34550933596): both `verify` and `container` succeeded.

- 151 unit tests across 26 files passed, including real FFmpeg fixture tests.
- 40 service integration tests across 5 files passed against native PostgreSQL 16 with pgvector. The 6 creation tests include concurrent replay, rollback, RLS, notes and an imported script through explicit QA/approval, cached synthetic audio and successful placeholder rendering with an audio track and output checksum.
- All package type checks and full web lint passed.
- Database migrations and seed completed in the isolated CI database.
- Production web and Worker builds passed. Worker health/auth/malformed-request smoke checks passed.
- Both production HTTP smoke and Docker Compose HTTP smoke passed, including saved script preservation, notes import, conflicting replay rejection, concurrent replay and reopening an imported script without regenerating research or angles.
- No paid Gemini API calls were made. Synthetic audio and placeholder visuals are test fixtures, not a finished user video. Real user Supabase login, Gemini output, existing user assets, MP4 download of a user project and public deployment remain unverified.
- Changes are in draft [PR #3](https://github.com/renee1004/shorts-studio-ai/pull/3) targeting `feat/simple-creation`; the user's running WSL checkout and database were not modified.

## 2026-09-11 continuation (separate Windows checkout)

- Remote `feat/simple-creation` was verified at `b407b4598c604431ea530eddcbfb566a2b94a6f6`, 12 commits ahead of `main` (`bd737ec5dd3d03b04b1186851390319737270147`).
- Web and services TypeScript checks passed with the installed Next.js 16.3.4 sources; changed web files passed ESLint. Local Next.js route and native-history documentation was read.
- An isolated in-memory PGlite 0.5.8 database with pgcrypto, citext and pgvector applied all six SQL migration files unchanged. Actual creation service calls under the authenticated role verified script preservation, scene storage, unverified claims, no automatic QA/approval, replay reuse, changed-input conflicts, 4000-character notes, invalid-input no-write behavior, non-member RLS rejection and zero cost events. This is an embedded PostgreSQL check, not a native PostgreSQL/HTTP/concurrency check.
- WSL access was denied (`E_ACCESSDENIED`). pnpm lifecycle and local Vitest subprocess startup were denied (`EPERM`). The dependency download completed, but a successful full install/test/build is not claimed for this Windows executor.
- Added native PostgreSQL integration tests for concurrent replay, rollback/retry, invalid input and RLS, plus HTTP smoke coverage for notes, imported scripts and resumed imported scripts. CI execution status must be checked separately.
- No paid Gemini calls, user secrets, existing user database or running deployment were used or changed. Real Gemini speech, stock/user video assets, end-to-end user-video download and public deployment remain unverified.

### Applying this change

Run the normal additive migration step before starting the updated app. `0005_creation_input_hash.sql` adds a nullable fingerprint column; it does not reset or delete existing projects. A replay of a legacy creation operation without a fingerprint is rejected conservatively; open its saved project in `/studio` or `/create?project=...` instead.

Creation now saves without requiring provider configuration. Notes/script validation is shared by browser and API. Saved project URLs survive refresh, existing scripts bypass preparation, and narration is always an explicit API-use button. Same-operation input fingerprints reject changed text/mode; this does not deduplicate independently started operations with different IDs or provide durable paid-job recovery after crashes.

The following sections are historical results from the preceding executor, not newly repeated checks.

## Verified locally

- Vitest: 24 files, 142 tests passed.
- FFmpeg fixture rendering actually executed, with and without generated test audio.
- Next.js production build and TypeScript passed.
- ESLint passed for the changed request helper, client, tests and API wrapper.
- Hung transport is bounded at 180 seconds, aborts the browser request and makes no automatic resubmission.
- A lost response is explicitly uncertain: the server may still be working. The current screen disables generation and directs the user to saved work. This is not a durable cross-browser idempotency guarantee.
- Stage elapsed time and request start/completion logging added. Request bodies and credentials are not logged.

## Not verified / not complete

- Docker and PostgreSQL are unavailable in this executor. The HTTP/PostgreSQL smoke script was not executed here.
- No paid Gemini calls were made. The reported empty research response remains unresolved until provider termination metadata is observed.
- Supabase login against the user's project has not been exercised here.
- Fixture rendering does not prove a user project can pass approval, enqueue, complete, and download successfully.
- Automatic stock acquisition, live AI video generation, and automatic YouTube publishing are not completed by this change.

## Acceptance still required

On an isolated test database, run scripts/smoke-webapp.mjs against the built app, then exercise a saved approved project through Worker rendering and download. After that, validate one explicitly budgeted live Gemini project. Do not describe this change as a fully verified topic-to-video production service until those checks pass.
