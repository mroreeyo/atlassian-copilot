# Task 1 Plan — Google OAuth/OIDC Login and First-login Signup

- Team: `google-oauth-oidc-log-8f2389f6`
- Worker: `worker-1` / planner
- Created: 2026-06-03
- Source context: `/mnt/c/Users/ncuri/Downloads/atlassian-copilot/.omx/context/google-auth-first-login-plan-20260603T010136Z.md`
- Scope: planning artifact only; no application source modifications.

## Desired result

Add an implementation-ready plan for Broker-owned Google OAuth/OIDC login where the first verified Google login creates or upserts a local user, subsequent logins reuse that user, and authenticated private data is isolated per user. Browser code must never handle Google credential verification, OpenAI/Jira/Confluence/MCP credentials, or direct provider secrets.

## Repository evidence used

- `apps/broker/src/routes/auth.ts` currently exposes local `POST /api/auth/signup`, `POST /api/auth/login`, `GET /api/auth/session`, and `POST /api/auth/logout`; there is no Google route.
- `apps/broker/src/services/auth/authStore.ts` stores local users in `auth-users.json`, sessions in memory, and auth failure buckets in memory.
- `apps/broker/src/services/auth/sessionCookie.ts` issues an opaque `akc_session` HttpOnly cookie with `SameSite=Lax`, production/HTTPS `Secure`, and no server-persistent session backing.
- `apps/broker/src/app.ts` applies security headers, CORS with credentials, and an Origin/Referer guard for unsafe mutations before registering auth and Copilot routes.
- `apps/web/src/app/App.tsx` keeps `/copilot` public while `/history` and `/settings` are protected by `ProtectedRoute`; `/login` and `/signup` are present.
- `apps/web/src/pages/auth/LoginPage.tsx` and `SignupPage.tsx` use local email/password UI and redirect to a sanitized same-app return target.
- `apps/web/src/services/auth/authClient.ts` uses credentialed fetches for local auth/session/logout and parses only user email.
- `packages/shared/src/schemas/contracts.ts` and `packages/shared/src/contracts/domain.ts` define local auth request/session contracts.
- Prior plan artifacts under leader `.omx/plans/auth-login-implementation-plan-20260602.md`, `prd-auth-login-20260602.md`, and `test-spec-auth-login-20260602.md` proposed Google auth but current source diverged to local email/password P0.

## Implementation plan

### 1. Choose the auth surface and preserve current safe behavior

- Keep `/copilot` public for P0 demo use.
- Keep `/settings` and `/history` private through `ProtectedRoute` and backend guards.
- Add Google routes under the Broker, not the web app:
  - `GET /api/auth/google/start?returnTo=/settings` to create OAuth transaction state and redirect to Google.
  - `GET /api/auth/google/callback` to validate state/nonce, exchange code, verify ID token claims, upsert user, issue session, and redirect to a safe app path.
  - `GET /api/auth/session` or a new `GET /api/auth/me` to return authenticated user plus CSRF token if adopted for private mutations.
  - `POST /api/auth/logout` remains Broker-owned and invalidates the server session.
- Decide whether local email/password stays enabled. Default planning assumption: keep it as dev/local fallback until Google is implemented, then gate with explicit config such as `AKC_ENABLE_LOCAL_AUTH=true` if production should be Google-only.

### 2. Add Broker-owned Google OAuth/OIDC

- Add Google OAuth/OIDC service module, for example `apps/broker/src/services/auth/googleOidc.ts`.
- Required env/config:
  - `GOOGLE_OAUTH_CLIENT_ID`
  - `GOOGLE_OAUTH_CLIENT_SECRET`
  - `GOOGLE_OAUTH_REDIRECT_URI`
  - configured web origin / allowed return paths.
- Request only `openid email profile`; do not request Google API scopes or refresh tokens in this phase.
- Store no Google access/refresh token unless a future feature needs Google APIs; the login feature needs only verified identity claims.
- Verify ID token server-side and require:
  - expected audience/client ID;
  - issuer is Google;
  - token signature and expiry are valid;
  - `sub` is present;
  - `email_verified` policy is explicit before using email for display/contact.
- Use Google `sub` as immutable external identity key. Do not identify users solely by email because emails can change.

### 3. Replace JSON/in-memory auth storage with user/session persistence

- Introduce a storage layer before Google auth lands. SQLite is the likely single-host P0 fit; keep a Postgres migration seam behind a repository interface.
- Minimum tables:
  - `users(id, google_sub unique, email, email_verified, name, picture_url, created_at, updated_at)`.
  - `sessions(id_hash, user_id, csrf_secret_or_hash, created_at, last_seen_at, expires_at, revoked_at)`.
  - `oauth_transactions(state_hash, nonce_hash, return_to, created_at, expires_at, consumed_at)`.
- Store session IDs and OAuth state/nonce hashed at rest; send only opaque random values to the browser/Google redirect.
- Regenerate/replace any pre-login session on callback success to prevent session fixation.
- Keep `auth-users.json` migration explicit; do not auto-import singleton local users or settings into the first Google user.

### 4. User-scope private settings, runs, and audits

- Add `user_id` to private storage for Atlassian settings, LLM settings, runs/history, write actions, and audit entries.
- Require backend private route guards to resolve `user_id`; every private lookup/update must include `user_id` in the storage query/key.
- Keep global/demo `/copilot` behavior separate from authenticated private history. Public demo runs must not be silently attached to a later user unless an explicit product decision adds that flow.
- Quarantine existing singleton JSON profiles (`atlassian-profile.json`, `llm-profile.json`) by default. Provide an explicit migration command only if needed.

### 5. Frontend flow

- Add a Google login CTA on `/login` and optionally `/signup`; it navigates the browser to Broker start route, e.g. `/api/auth/google/start?returnTo=<safe path>`.
- Remove any plan that puts Google ID tokens or client secrets in frontend code. There should be no `VITE_GOOGLE_*` secret and no frontend token verification.
- After callback redirect, refresh `authSessionQueryKey` from Broker session/me endpoint.
- Keep local auth copy only if local auth remains enabled; otherwise replace signup copy with “first Google login creates your workspace.”
- Preserve path-only return target logic and extend it to an allowlist for `/copilot`, `/settings`, and `/history`.

### 6. CSRF, cookie, and browser boundary

- Keep HttpOnly, `SameSite=Lax`, `Path=/`, `Secure` in production/HTTPS, explicit credentialed CORS, and current Origin/Referer mutation guard.
- Add CSRF token strategy for cookie-backed private mutations if not relying solely on same-site + Origin/Referer:
  - issue token from authenticated session/me endpoint;
  - keep token in memory only;
  - require `X-CSRF-Token` for private unsafe mutations including logout, settings save/test/clear, action approve/cancel.
- Never put session, CSRF, OAuth state, Google tokens, provider keys, Atlassian tokens, or bearer tokens in URLs, browser storage, logs, snapshots, or analytics.

### 7. Acceptance criteria

- `GET /api/auth/google/start` redirects to Google with state, nonce, allowed scopes, and sanitized `returnTo`.
- Callback rejects missing/invalid/reused/expired state or nonce.
- Callback rejects invalid ID tokens, wrong audience, missing `sub`, untrusted issuer, and disallowed email policy.
- First valid Google login creates exactly one local user row keyed by `google_sub` and issues an HttpOnly session cookie.
- Later valid logins for the same `google_sub` update profile fields and reuse the same local user identity.
- User A cannot read or mutate User B settings, history, action state, audit entries, or stored secrets.
- `/copilot` remains public; `/settings` and `/history` remain auth-protected.
- Browser bundle contains no Google client secret and no direct external-provider token verification logic.
- Existing password 8-character behavior remains covered as a separate leader-owned fix and must not regress if local auth remains.

### 8. Verification plan

Run after implementation:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run security:scan
```

Targeted tests to add or update:

- Broker route tests for Google start/callback success/failure with mocked Google verifier and mocked OAuth exchange.
- Auth storage tests for first-login upsert, same-sub idempotency, changed email handling, session expiry/revocation, and consumed OAuth transaction replay rejection.
- Route authorization tests for user A/B isolation across settings, history, action approval/cancel, and audit reads.
- CSRF/Origin tests for private unsafe mutations.
- Web tests for Google CTA URL construction, post-login session refresh, protected route behavior, no private query firing while logged out, and safe return target handling.
- Static security scan coverage for frontend secret env names, browser storage token writes, token-in-URL patterns, and direct OpenAI/Jira/Confluence/MCP/Google verification calls from browser code.

### 9. Risks and handoff notes

- Current auth sessions are memory-only; Google login should not ship without persistent revocation-capable sessions.
- Current private stores are not fully user-owned; user upsert alone is insufficient without storage isolation.
- Callback security depends on state/nonce replay prevention and exact redirect URI config.
- Native SQLite dependency choice can affect deployment; define fallback/migration seam before adding packages.
- If production remains cross-origin, credentialed CORS and cookie attributes must be tested in the deployed origin topology, not just unit tests.

## Stop condition

This plan is complete when official-source evidence is attached, repository impact map and severe reviews are integrated, and final leader handoff includes concrete acceptance criteria plus verification commands. Task 1 provides the base plan; Tasks 2 and 3 should fill citations, impact map, and severe review findings.

## Subagent evidence integrated

- Subagents spawned: 1 (`019e8b03-3f21-7290-8912-240d8ad33b30`, planner repo/context mapping).
- Subagent model: `gpt-5.4-mini` via `planner` role.
- Findings integrated:
  - Confirmed auth routes are local-only and Google/OIDC routes are absent.
  - Confirmed settings/history/copilot private mutations already rely on credentialed Broker requests and route guards, while underlying personal stores still need durable user scoping.
  - Confirmed `SettingsPage` is the most likely first-login onboarding surface after Google auth.
  - Confirmed relevant verification targets include broker auth route tests, web auth client/route tests, security scan, lint, typecheck, test, and build.
- Serial searches before spawn: 1 failed context read in worker worktree; subagent spawned before further repo mapping.
