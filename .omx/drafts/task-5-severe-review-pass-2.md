# Task 5 — Severe Review Pass 2: Deployability / Testing / UX / Regression Attack

## Scope
Adversarial review of the proposed Broker-owned Google OAuth/OIDC + first-login signup plan, focused on dependency choice, Google Cloud configuration, deployment/reverse-proxy/cookie behavior, local dev fallback, test matrix, UI visibility/copy, preserving `/copilot` demo, regression risk, and rollback. No application source edited.

## Evidence inspected
- Planning context: `/mnt/c/Users/ncuri/Downloads/atlassian-copilot/.omx/context/google-auth-first-login-plan-20260603T010136Z.md`
- Current auth/session: `apps/broker/src/routes/auth.ts`, `apps/broker/src/services/auth/authStore.ts`, `apps/broker/src/services/auth/sessionCookie.ts`
- Browser auth UX: `apps/web/src/pages/auth/LoginPage.tsx`, `apps/web/src/pages/auth/SignupPage.tsx`, `apps/web/src/components/layout/AppShell.tsx`, `apps/web/src/components/auth/ProtectedRoute.tsx`, `apps/web/src/services/auth/authClient.ts`
- Deploy/dev/CI: `.github/workflows/ci.yml`, `.github/workflows/deploy-aws.yml`, `scripts/dev-local.mjs`, `apps/broker/.env.example`, `apps/web/vite.config.ts`, `package.json`
- Current storage isolation risks: `apps/broker/src/services/settings/*Store.ts`, `apps/broker/src/services/runs/runStore.ts`, `apps/broker/src/services/audit/auditLog.ts`
- Official docs consulted:
  - Google OAuth web-server flow: https://developers.google.com/identity/protocols/oauth2/web-server
  - Google OIDC: https://developers.google.com/identity/openid-connect/openid-connect
  - Fastify OAuth2 plugin: https://github.com/fastify/fastify-oauth2
  - MDN secure cookie guidance: https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/Cookies

## Verification run
- PASS: `npm run typecheck --if-present` → `tsc -b` completed successfully.
- PASS: `npm run lint --if-present` → `eslint . --max-warnings=0` completed successfully.
- PASS: `npm run test --if-present` → 15 test files / 178 tests passed, duration 148.32s.
- PASS/limited: end-to-end behavior inferred from route tests and current code; no browser/manual Google OAuth can run because no Google client credentials are configured and task forbids implementation.

## Severe blockers / required amendments

### 1) Deployment topology is under-specified; current AWS workflow deploys only static web
**Attack:** `.github/workflows/deploy-aws.yml` syncs `apps/web/dist` to S3/CloudFront only. Google OAuth requires a live Broker callback endpoint, persistent auth/session/user storage, stable `GOOGLE_REDIRECT_URI`, production secrets, and likely reverse proxy rules. A plan that only edits app code will pass CI but fail production login because `/api/auth/google/callback` has nowhere durable to run in the documented deploy path.

**Required amendment:** Add an explicit Broker deployment story before implementation: runtime target, HTTPS origin, callback route, health checks, process manager/container, secrets injection, persistent state volume/DB, log redaction, backup/restore, and how CloudFront/S3 web reaches Broker (`/api` proxy, separate subdomain, or same-origin reverse proxy).

### 2) Google Cloud Console configuration needs an environment matrix, not a generic checklist
**Attack:** Google requires exact authorized redirect URIs/origins for web OAuth. The repo uses variable local ports (`5173`, `5174`, `5180...`) and Broker ports (`8787...`) via `scripts/dev-local.mjs`; production has no documented Broker origin. If the plan says “configure redirect URI” without enumerating local/staging/prod values, developers will hit redirect mismatch or accidentally add broad origins.

**Required amendment:** Define per-environment values:
- Local dev callback: Broker-owned callback, e.g. `http://localhost:8787/api/auth/google/callback` if Google permits loopback HTTP for local web clients; document fallback when script picks 8788+.
- Production callback: one HTTPS exact URL.
- Authorized JavaScript origins: only frontend origins if using a Google-rendered button; if browser only navigates to Broker start route, avoid browser Google client config entirely.
- Env names in `apps/broker/.env.example`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_ALLOWED_HOSTED_DOMAIN`/allowlist if needed, `AKC_AUTH_BASE_URL` or equivalent.

### 3) Cookie/proxy behavior will fail unless same-origin and forwarded-proto are designed
**Attack:** Current cookie code sets `Secure` when `NODE_ENV=production`, `x-forwarded-proto=https`, or `request.protocol=https`; cookie is `HttpOnly; SameSite=Lax; Path=/`. This is compatible with top-level OAuth callback on the same site, but deployment behind CloudFront/Nginx must preserve `X-Forwarded-Proto` and must not split web and Broker across sites unless `SameSite=None; Secure` and CORS are deliberately changed. The current CORS list is local-only via `BROKER_ALLOWED_ORIGINS`.

**Required amendment:** Require one of two explicit production shapes:
- Preferred: same-site/same-origin `/api` reverse proxy so `SameSite=Lax` remains sufficient and CORS stays narrow.
- Alternative: separate API domain with explicit `SameSite=None; Secure`, CORS `credentials: true`, exact allowed origins, CSRF hardening, and browser compatibility tests.
Also specify Nginx/CloudFront headers: `Host`, `X-Forwarded-Proto`, `X-Forwarded-For`, no buffering for SSE (`X-Accel-Buffering: no` already set in route), and no caching for auth callbacks/session endpoints.

### 4) Dependency choice is not implementation-ready
**Attack:** Current broker dependencies are only `fastify`, `@fastify/cors`, `zod`. Adding Google auth needs at least OAuth client/callback support and ID-token validation. A vague “use OAuth” plan risks either hand-rolled token exchange or browser-side token handling, both contrary to constraints. Also, root package uses many `latest` dependencies, making new auth dependencies harder to reproduce.

**Required amendment:** Pick and pin exact dependencies with rationale:
- Use `@fastify/oauth2` only if it is version-compatible with the locked Fastify version and its cookie/PKCE behavior is explicitly configured/tested.
- Use `google-auth-library` or an equivalent official verification path for ID-token verification: issuer, audience, expiry, email/email_verified, subject, hosted-domain policy if required.
- Do not use Google Identity Services tokens in browser for this plan; browser should start Broker route only.
- Update `package-lock.json`, CI install expectations, and security scan dependency allowlist if scan flags OAuth deps.

### 5) First-login “signup/upsert” cannot be safe on the current user model without schema changes and migration policy
**Attack:** Current `AuthUser` is email-centric (`email`, `createdAt`), local users live in `auth-users.json`, and sessions map session IDs to email in memory. Google identities need immutable provider subject (`sub`), provider, email verification state, optional display/avatar, account linking policy, and user IDs for ownership. Email-only upsert is vulnerable to account takeover if email verification/domain policy is mishandled and cannot safely support later provider linking.

**Required amendment:** Plan must require a storage schema before route work: `users(id, primary_email, created_at, ...)`, `identities(provider, provider_subject, user_id, email_at_login, email_verified, ...)`, `sessions(hashed_token, user_id, expires_at, idle_expires_at, created_at, revoked_at)`. Define whether existing local users are migrated, quarantined, or left dev-only. Do not merge Google identity into an existing local email account without an explicit verified-linking flow.

### 6) Existing singleton state makes “login works” misleading; private data remains cross-user
**Attack:** Settings stores (`atlassian-profile.json`, `llm-profile.json`), run store (`Map`), and audit log (`entries[]`) are singleton/global. Google login can succeed while every authenticated user shares credentials, runs, and audit history. The plan context knows this, but implementation must not ship until user-scoped settings/runs/audits are enforced.

**Required amendment:** Make user-scoping a release blocker, not follow-up. Every protected route must use authenticated `user.id`; settings paths must include `user_id`; run/action/audit stores must enforce owner on read/write/stream/approve/cancel/history; tests must prove user A cannot access user B runs/actions/settings/audit.

### 7) `/copilot` public demo preservation needs exact regression gates
**Attack:** Current `/copilot` is intentionally public; unauthenticated runs are forced to `mock` in `apps/broker/src/routes/copilot.ts`. It is easy to accidentally wrap `/copilot` in `ProtectedRoute` or require auth for `/api/copilot/runs`, breaking the P0 demo.

**Required amendment:** Add explicit non-negotiable acceptance tests:
- Unauthenticated `/copilot` renders.
- Unauthenticated `POST /api/copilot/runs` returns mock run and stream works without secrets.
- Unauthenticated write/action/settings/history routes remain 401/403 as appropriate.
- Login success returns to attempted protected route, not always `/settings` unless intentionally chosen.

### 8) UX/copy plan must prevent duplicate auth surfaces and clarify first-login signup
**Attack:** Current UI has `/login` and `/signup` with local email/password copy. Adding Google without deciding local-auth policy creates confusing duplicate “가입하기” vs “Google로 계속하기” flows. First Google login is signup/upsert, but users need clear copy: “Google로 계속하면 계정이 생성됩니다” and post-login settings onboarding.

**Required amendment:** Decide one of:
- Google primary + local dev-only hidden behind env flag;
- Google primary + local fallback visibly labeled;
- Google-only production with local routes disabled/removed.
Update `AppShell`, `LoginPage`, `SignupPage`, `ProtectedRoute`, and `authClient` copy/behavior accordingly. Include error states for Google denied consent, domain not allowed, callback expired/state mismatch, duplicate/linking conflict, and no cookies due to browser/proxy.

### 9) Local dev fallback is brittle with dynamic ports
**Attack:** `scripts/dev-local.mjs` may select alternate Broker/Web ports. Google Console redirect URIs are exact; a dev who lands on Broker `8788` will fail if only `8787` is registered. The plan cannot rely solely on automatic port selection for OAuth dev.

**Required amendment:** Add an OAuth dev mode:
- Either force strict `BROKER_PORT=8787` when Google auth env vars are present, with a clear error if occupied;
- Or document/register every permitted local callback port and expose selected callback in startup logs.
Prefer strict stable OAuth port for sanity.

### 10) Test matrix is too shallow unless it includes proxy/cookie and failure-mode tests
**Attack:** Current tests cover local password auth, session cookies, protected routes, and demo preservation. Google auth adds state/nonce/PKCE/callback complexity that route happy-path tests won’t catch.

**Required amendment:** Required tests before merge:
- Unit: state/nonce/PKCE storage TTL, single-use callback, replay rejection, missing/invalid state, callback error handling.
- Unit/integration: verified ID token creates new user once; second login reuses identity; unverified email rejected; wrong audience/issuer/expired token rejected; hosted-domain policy enforced if configured.
- Integration: cookie flags under local, `NODE_ENV=production`, and `x-forwarded-proto=https`.
- Multi-user isolation: settings, runs, action approval/cancel, history/audit, SSE stream ownership.
- UI: login page Google CTA, denied/error callback UX, first-login copy, return target preservation.
- Regression: unauthenticated `/copilot` demo and mock stream still work.

### 11) Rollback plan must include data compatibility and feature gating
**Attack:** OAuth migrations introduce durable DB/schema and identities. If rollout fails, simply reverting code may strand users or break sessions/settings.

**Required amendment:** Add feature flags and rollback:
- `AKC_AUTH_GOOGLE_ENABLED=false` disables Google start/callback and hides CTA while preserving local login/dev fallback.
- Migration is additive first; no destructive migration of existing `auth-users.json`/settings until verified.
- Rollback leaves DB readable and local auth path available or clearly disabled with admin recovery.
- Document session invalidation behavior and how to revoke Google sessions if callback bug leaks state.

## Recommended severity summary
- **Block final plan until amended:** deployment topology, Google Cloud exact env matrix, cookie/proxy shape, dependency/version choice, durable user/session schema, user-scoped storage, `/copilot` regression gates, OAuth-specific test matrix, rollback plan.
- **Proceed only after:** the plan treats Google login as a cross-cutting auth/storage/deployment migration, not a route/button addition.
