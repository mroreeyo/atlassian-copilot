# Implementation Plan: Broker-owned Google OAuth/OIDC login and first-login signup/upsert

## Outcome and stop condition

Deliver Google login for AX Knowledge Copilot without moving any auth or provider-secret responsibility into the browser. A first verified Google login creates or updates a local user, subsequent logins reuse that user, and authenticated private resources are scoped by `user_id`. Stop when all auth routes, storage, UI flows, migration policy, and regression tests below are implemented and passing.

## Evidence base

### Repo facts

- Current auth is local email/password only: `apps/broker/src/routes/auth.ts:6-42` exposes `/api/auth/signup`, `/api/auth/login`, `/api/auth/session`, `/api/auth/logout`.
- Current user persistence is `auth-users.json` and sessions are process-memory maps: `apps/broker/src/services/auth/authStore.ts:7-10`, `apps/broker/src/services/auth/authStore.ts:40-41`, `apps/broker/src/services/auth/authStore.ts:76-93`.
- Current cookie is raw session id in an HttpOnly `SameSite=Lax` cookie; `Secure` is environment/proxy dependent: `apps/broker/src/services/auth/sessionCookie.ts:34-49`.
- Current protected Broker endpoints depend only on `requireAuth` and do not yet carry user ownership through settings/history/action/audit stores: `apps/broker/src/routes/copilot.ts:55-220`.
- `/copilot` remains public demo-capable while `/history` and `/settings` are protected in the web router: `apps/web/src/app/App.tsx:14-21`; unauthenticated copilot runs are forced to `mock` mode: `apps/broker/src/routes/copilot.ts:29-34`.
- Frontend auth currently posts email/password to Broker and uses `credentials: 'include'`; it has no Google redirect helpers: `apps/web/src/services/auth/authClient.ts:18-54`.
- Frontend security scan already blocks browser secret strings and auth/session/token leakage patterns: `scripts/security-scan.mjs:7-39`.

### Primary docs constraints

- Google web-server OAuth is for apps that can store confidential info and maintain state, and Google recommends well-debugged OAuth libraries for security-sensitive flows. Source: https://developers.google.com/identity/protocols/oauth2/web-server
- Google requires authorization-code flow for web server apps (`response_type=code`), exact authorized redirect URI matching, secure storage of the client secret outside public locations, and `state` verification before handling the response. Source: https://developers.google.com/identity/protocols/oauth2/web-server
- Google OIDC ID tokens must be validated for signature/issuer/audience/expiry; use `sub`, not `email`, as the unique account key. Source: https://developers.google.com/identity/openid-connect/openid-connect
- `google-auth-library` `OAuth2Client` supports auth URL generation, code exchange, and `verifyIdToken`, including cert/audience verification. Source: https://docs.cloud.google.com/nodejs/docs/reference/google-auth-library/latest/google-auth-library/oauth2client
- `@fastify/oauth2` supports provider registration with start redirect/callback URI and Google configuration, and supports PKCE S256. Source: https://github.com/fastify/fastify-oauth2
- `@fastify/csrf-protection` can protect routes with an `onRequest` hook and a custom header token getter. Source: https://github.com/fastify/csrf-protection
- `@fastify/cookie` supports `httpOnly`, `secure`, and `sameSite` cookie attributes. Source: https://github.com/fastify/fastify-cookie
- OWASP treats session IDs as bearer-equivalent secrets, requires strong generated server-side tokens, renewal after auth privilege changes, and HttpOnly cookies for XSS resistance; cookie auth still needs CSRF defense. Sources: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html and https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html

## Decision summary

1. Implement Google auth only in the Broker.
2. Use Authorization Code + OIDC with `openid email profile` only; do not request Google API scopes or refresh tokens in this phase.
3. Use `google-auth-library` directly for auth URL/code exchange/ID-token verification. Add `@fastify/cookie` and `@fastify/csrf-protection`; use `@fastify/oauth2` only if the executor prefers plugin-managed route decoration, but direct `google-auth-library` is the smaller dependency surface for this repo.
4. Replace raw in-memory session ids with DB-backed hashed session tokens.
5. Scope all private data stores by `user_id`; keep public `/copilot` demo behavior unchanged.
6. Treat existing singleton JSON settings/history/audit data as quarantine/dev legacy data; do not auto-attach it to the first Google user.

## Implementation steps

### 1. Extend shared auth contracts

Files:
- `packages/shared/src/contracts/domain.ts`
- `packages/shared/src/schemas/contracts.ts`
- related shared tests

Add/adjust:
- `AuthProvider = 'local' | 'google'`.
- `AuthUser` shape: `id`, `email`, `displayName?`, `avatarUrl?`, `provider`, `createdAt`.
- `AuthSessionResponse` remains `{ user }` but accepts the richer user.
- Optional response for CSRF/bootstrap: `{ csrfToken: string }` if executor chooses server-issued CSRF token endpoint.

Compatibility rule: frontend may continue rendering `user.email`, but Broker responses must never expose session id, Google access token, ID token, refresh token, password hash/salt, CSRF secret, or OAuth state/nonce.

### 2. Add durable local DB storage boundary

Recommended dependency: SQLite for local portfolio/dev with a repository-local adapter boundary that can move to Postgres later.

Add files under `apps/broker/src/services/auth/` and `apps/broker/src/services/storage/`:
- `db.ts`: opens state-dir SQLite DB under `AKC_BROKER_STATE_DIR` or default Broker state dir.
- `migrations.ts`: idempotent SQL migrations.
- `userStore.ts`: user/identity/session CRUD.
- `oauthStateStore.ts`: one-time state/nonce/PKCE challenge records.

Tables:

```sql
users(
  id text primary key,
  primary_email text not null,
  display_name text,
  avatar_url text,
  created_at text not null,
  updated_at text not null,
  disabled_at text
);

user_identities(
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  provider text not null check(provider in ('google','local')),
  provider_subject text not null,
  email text not null,
  email_verified integer not null default 0,
  created_at text not null,
  updated_at text not null,
  unique(provider, provider_subject)
);

sessions(
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  token_hash text not null unique,
  csrf_token_hash text,
  created_at text not null,
  expires_at text not null,
  last_seen_at text,
  revoked_at text,
  user_agent_hash text,
  ip_hash text
);

oauth_login_challenges(
  id text primary key,
  state_hash text not null unique,
  nonce_hash text not null,
  pkce_verifier_hash text,
  return_to text not null,
  created_at text not null,
  expires_at text not null,
  consumed_at text
);
```

Later user-scoped app tables or columns:
- `atlassian_profiles.user_id`
- `llm_profiles.user_id`
- `copilot_runs.user_id`
- `action_reviews.user_id`
- `audit_log.user_id`

### 3. Replace session implementation with hashed-token DB sessions

Files:
- `apps/broker/src/services/auth/sessionCookie.ts`
- new `apps/broker/src/services/auth/sessionStore.ts`
- tests in `apps/broker/src/test/routes.test.ts`

Behavior:
- Generate raw session token with `randomBytes(32)` or stronger.
- Store only `sha256(rawToken + serverPepper)` or HMAC-SHA-256 hash in DB.
- Put only raw opaque token in `akc_session` HttpOnly cookie.
- Cookie attributes: `HttpOnly; SameSite=Lax; Path=/; Max-Age=<ttl>` plus `Secure` in production/HTTPS. Keep current dev behavior that does not set `Secure` on plain localhost.
- On every login/signup/auth privilege transition, issue a new session token and invalidate any OAuth challenge.
- Enforce absolute TTL; optionally idle TTL with `last_seen_at` update throttling.
- `logout` revokes the DB session and clears the cookie.

### 4. Add CSRF protection for cookie-authenticated unsafe requests

Files:
- `apps/broker/src/app.ts`
- `apps/broker/src/routes/auth.ts`
- `apps/web/src/services/auth/authClient.ts`
- `apps/web/src/services/copilot/brokerCopilotClient.ts`

Plan:
- Keep the current Origin/Referer guard in `apps/broker/src/app.ts` as defense-in-depth.
- Add server-issued synchronizer token per session: `GET /api/auth/csrf` returns a token for authenticated browser clients; store token hash on the session row.
- For unsafe authenticated routes, require `x-csrf-token` matching the session token hash.
- Exempt only routes that cannot have an authenticated session CSRF token yet: `GET /api/auth/google/start`, `GET /api/auth/google/callback`, and optionally `/api/auth/session`.
- Frontend fetch wrappers cache the CSRF token in memory and send it on POST/PUT/PATCH/DELETE. Do not store it in localStorage/sessionStorage.
- If using `@fastify/csrf-protection`, configure a custom header getter (`x-csrf-token`) and bind token material to user/session info; do not accept body/query CSRF tokens.

### 5. Add Broker-owned Google OAuth routes

Files:
- `apps/broker/src/routes/auth.ts` or new `apps/broker/src/routes/googleAuth.ts`
- `apps/broker/src/app.ts`
- new tests in `apps/broker/src/test/google-auth.test.ts` or existing route test file

Routes:
- `GET /api/auth/google/start?returnTo=/settings`
  - Validates `returnTo` with the existing same-origin path rules used by frontend return target helpers: must start with `/`, not `//`, and allow only `/copilot`, `/history`, `/settings` plus optional safe query/hash.
  - Creates random `state`, `nonce`, and PKCE verifier/challenge.
  - Stores hashed challenge record with short TTL, e.g. 10 minutes.
  - Sets a short-lived HttpOnly `akc_oauth_state` cookie with the challenge id or sealed challenge pointer, `SameSite=Lax`, `Path=/api/auth/google`, `Secure` in production.
  - Redirects to Google with `response_type=code`, `scope=openid email profile`, exact configured redirect URI, `state`, `nonce`, and PKCE S256.
- `GET /api/auth/google/callback?state=...&code=...`
  - Rejects missing/expired/consumed challenge, mismatched cookie pointer, or state mismatch.
  - Exchanges code server-side using `google-auth-library` or `@fastify/oauth2`.
  - Verifies ID token with `audience=GOOGLE_OAUTH_CLIENT_ID`, issuer `accounts.google.com`/`https://accounts.google.com`, expiry, and nonce.
  - Requires `email_verified === true`.
  - Upserts local user by unique `(provider='google', provider_subject=sub)`; update display/email/avatar fields from claims, but never use `email` as the identity key.
  - Creates DB-backed session and redirects to sanitized return target.
  - Marks challenge consumed and clears `akc_oauth_state`.
  - On error, redirects to `/login?error=google_auth_failed` with sanitized reason class only.

Environment:
- `GOOGLE_OAUTH_CLIENT_ID` required.
- `GOOGLE_OAUTH_CLIENT_SECRET` required if using confidential web client code exchange.
- `GOOGLE_OAUTH_REDIRECT_URI` required; exact match with Google Console.
- `AKC_AUTH_SESSION_PEPPER` required in production for session-token hashing/HMAC.
- Optional: `AKC_ALLOWED_GOOGLE_HD` for workspace domain gating. If used, verify `hd` as an optimization/UX hint only after ID token verification; do not trust it as the sole authorization check.
- Optional: `AKC_ENABLE_LOCAL_AUTH` default `false` once Google auth is complete; keep local email/password for test/dev if needed.

### 6. First-login signup/upsert rules

Algorithm:

1. Parse verified ID-token payload.
2. Require `sub`, `aud`, `iss`, `exp`, `email`, and `email_verified`.
3. Lookup `user_identities(provider='google', provider_subject=sub)`.
4. If found: update email/display/avatar and `updated_at`; create session.
5. If not found: create `users` row and `user_identities` row in one transaction; this is first-login signup.
6. If a local user with the same email exists, do not automatically merge unless a future explicit account-linking flow is implemented. Return a safe conflict copy or create a separate Google-backed user depending on product decision. Recommended P0: safe conflict requiring manual admin/dev resolution to avoid account takeover by email collision.

### 7. Scope settings/history/action/audit by user

Files likely affected:
- `apps/broker/src/routes/copilot.ts`
- `apps/broker/src/services/settings/*`
- `apps/broker/src/services/runs/*`
- `apps/broker/src/services/audit/auditLog.ts`
- `apps/broker/src/services/mcp/mcpClient.ts`

Rules:
- `requireAuth` returns `AuthUser` with `id`; all private route handlers pass `user.id` to stores.
- Settings are stored and resolved by `user_id`; environment fallback can remain global but personal settings must be user-specific.
- Runs/action reviews/audit entries include `user_id`; lookup/approval/cancel must require matching user.
- `GET /api/history` returns only current user's runs.
- `findActionReview(id)` must become `findActionReview(userId, id)` or equivalent.
- Audit log must include `user_id` and target resource metadata, and no secret/token material.
- MCP/LLM calls use only current user's saved profiles or explicit environment fallback. Browser never receives raw tokens.

### 8. Frontend login/signup flow

Files:
- `apps/web/src/pages/auth/LoginPage.tsx`
- `apps/web/src/pages/auth/SignupPage.tsx`
- `apps/web/src/components/layout/AppShell.tsx`
- `apps/web/src/services/auth/authClient.ts`
- `apps/web/src/services/copilot/brokerCopilotClient.ts`

UI behavior:
- Login page primary CTA: “Google로 계속하기”. It navigates the browser to `brokerUrl('/api/auth/google/start?returnTo=...')`.
- Signup page copy: “Google 계정으로 처음 로그인하면 계정이 만들어집니다.” Avoid separate Google signup route.
- Keep local email/password visible only if `GET /api/auth/config` says local auth is enabled, or keep it behind dev-only copy.
- Preserve `/copilot` public demo route. If unauthenticated users click History/Settings, ProtectedRoute sends them to Login with `from` state; Google return target sends them back.
- After callback redirect, `getAuthSession` refreshes and AppShell shows email/display name.
- Add visible error copy for `/login?error=google_auth_failed` without exposing internal Google/DB errors.

### 9. Migration/quarantine policy

- Do not auto-import existing `auth-users.json`, `atlassian-profile.json`, `llm-profile.json`, in-memory runs, or in-memory audit entries into the first Google account.
- On first boot after DB migration, leave legacy JSON files intact and mark them as `legacy_unscoped` in a migration metadata table or a `.quarantine` sidecar note.
- Provide a later explicit migration command if needed: it must require a target `user_id` and dry-run output. This is out of scope for the first Google auth implementation.
- Tests must prove a new Google user does not inherit previous singleton Atlassian/LLM profiles.

### 10. Dependency plan

Add runtime dependencies only if implementing this plan:
- `google-auth-library`: required for auth URL/code exchange and ID token verification.
- `@fastify/cookie`: recommended for robust cookie parsing/serialization instead of manual parsing.
- `@fastify/csrf-protection`: optional if executor wants plugin-managed token generation; otherwise implement small synchronizer-token check using DB session rows.
- SQLite driver: prefer `better-sqlite3` for simple sync local storage if native install is acceptable; otherwise evaluate `node:sqlite` only if the project's Node 22 runtime exposes the needed stable APIs. Keep DB calls behind a local interface so Postgres can replace it later.
- Avoid adding frontend Google SDKs, GIS scripts, or `VITE_GOOGLE_*` secret values.

### 11. Acceptance criteria

Security:
- Browser never handles Google client secret, ID token, access token, refresh token, password hash/salt, raw session DB hash, OAuth nonce, or OAuth state secret.
- OAuth callback rejects missing/mismatched/expired/consumed `state`, nonce mismatch, bad issuer, bad audience, expired token, unverified email, and reused code/challenge.
- Session cookie is HttpOnly, SameSite=Lax, Path=/, bounded Max-Age, and Secure under production/HTTPS.
- Sessions are stored hashed in DB; stealing the DB alone does not yield usable session tokens.
- Unsafe authenticated mutations fail without valid CSRF header and pass with a valid same-session header.
- Existing frontend security scan remains green and includes Google/auth token leakage patterns.

Product:
- First Google login creates a local user and signs in.
- Second login for the same Google `sub` reuses the same local user.
- `/copilot` remains public demo-capable.
- `/history`, `/settings`, action approve/cancel, personal settings save/test/delete are user-scoped and inaccessible without auth.
- A second authenticated user cannot read/update the first user's settings, runs, action reviews, or audit entries.
- Local password auth policy is explicit: disabled by default after Google auth, or dev-only with tests documenting the chosen flag.

UX:
- Login shows clear Google primary CTA.
- Signup explains first-login account creation.
- OAuth failures return to Login with safe Korean copy and no sensitive detail.
- Logout clears session and user-scoped cached queries.

### 12. Verification plan

Run after implementation:

1. Typecheck: `npm run typecheck`
2. Unit/integration tests: `npm test`
3. Lint: `npm run lint`
4. Security scan: `npm run security:scan`
5. Build: `npm run build`
6. Targeted route tests to add/verify:
   - `GET /api/auth/google/start` redirects to Google with code flow, state, nonce, PKCE, and only `openid email profile` scopes.
   - Callback state mismatch => 401/redirect error and no session.
   - Callback verified first login => 302 to return target, session cookie set, user row + identity row created.
   - Callback verified second login same `sub` => same user id, new session, no duplicate user.
   - Bad audience/issuer/expired/unverified email/nonce mismatch => no session.
   - CSRF missing on authenticated mutation => 403; valid token => route proceeds.
   - User A cannot access User B settings/history/action/audit.
   - Legacy JSON profiles are not visible to a new Google user.
7. Manual smoke:
   - Configure Google Console web client redirect URI exactly as `GOOGLE_OAUTH_REDIRECT_URI`.
   - Start Broker/Web, click “Google로 계속하기”, complete Google consent, land back on `/settings`, save/test Atlassian settings, logout, login again, confirm settings remain for the same user only.

## Risks and mitigations

- **Account takeover by email collision:** use Google `sub` as unique key; do not auto-merge with local users by email.
- **CSRF through cookie auth:** keep Origin/Referer guard, add per-session CSRF token, and verify OAuth `state`/nonce one-time.
- **Token leakage through URL/logs:** only authorization code returns in callback; do not log query strings; sanitize callback errors.
- **Session replay after DB leak:** hash/HMAC session tokens with production pepper.
- **SQLite dependency friction:** hide DB driver behind storage adapter; keep migration SQL idempotent and tested.
- **Legacy singleton data ambiguity:** quarantine by default; explicit migration only later.

## Handoff guidance

Recommended implementation order:
1. Add storage/migrations and hashed session store behind existing local auth tests.
2. Add Google OAuth challenge + callback tests with mocked Google client verification.
3. Add routes/env/config and session creation/upsert.
4. Add CSRF token endpoint and mutate-route enforcement.
5. User-scope settings/runs/action/audit stores.
6. Update web login/signup/AppShell and auth client.
7. Run full verification and severe security review before merging.
