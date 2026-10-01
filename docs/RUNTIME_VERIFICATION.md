# Runtime verification — 2026-09-10

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
