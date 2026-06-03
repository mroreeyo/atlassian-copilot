# Task 3 Severe Review Pass 1 — Security/Data-Isolation Attack

**Verdict: REJECT until hard gates below are explicit acceptance criteria in the Google OAuth/OIDC plan and test spec.**

## Evidence used

Primary/official references:
- Google OAuth 2.0 web-server flow: https://developers.google.com/identity/protocols/oauth2/web-server
- Google OpenID Connect and ID token validation: https://developers.google.com/identity/openid-connect/openid-connect
- Google server-side ID token verification: https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
- Fastify OAuth2: https://github.com/fastify/fastify-oauth2
- Fastify session: https://github.com/fastify/session
- OWASP OAuth2 Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/OAuth2_Cheat_Sheet.html
- OWASP CSRF Prevention Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- OWASP Session Management Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html

Repo/context evidence:
- Current planning context: `.omx/context/google-auth-first-login-plan-20260603T010136Z.md`.
- Current auth routes are local email/password only: `apps/broker/src/routes/auth.ts:6-42`.
- Current session is opaque cookie + in-memory map: `apps/broker/src/services/auth/sessionCookie.ts:22-49`, `apps/broker/src/services/auth/authStore.ts:40-97`.
- Current private mutations lack CSRF-token checks: `apps/broker/src/routes/copilot.ts:55-129`, `apps/broker/src/routes/copilot.ts:146-264`.
- Settings stores are singleton/global profiles, not user-owned rows: `apps/broker/src/services/settings/atlassianSettingsStore.ts:8-108`, `apps/broker/src/services/settings/llmSettingsStore.ts:121-163`.
- Runs/actions/audits are in-memory and not user-scoped: `apps/broker/src/services/runs/runStore.ts:23-58`, `apps/broker/src/services/audit/auditLog.ts:1-14`.
- Browser clients use cookies and avoid explicit token storage today, but no CSRF header exists: `apps/web/src/services/auth/authClient.ts:18-54`, `apps/web/src/services/copilot/brokerCopilotClient.ts:55-242`.

## Hard blockers and required amendments

### 1. OAuth login CSRF/state/nonce is not optional
**Attack:** attacker starts a Google flow under their account and tricks a victim into completing a callback, binding the victim browser to the attacker identity or replaying an old callback.

**Required amendment:** plan must require high-entropy `state` and `nonce` per login attempt, bound server-side or in hardened HttpOnly cookies with short TTL, exact callback comparison, atomic single-use consumption, and tests for missing/invalid/replayed/expired/mismatched values. Use PKCE `S256` when supported.

### 2. ID token verification must be local and complete before any user upsert/session
**Attack:** forged/wrong-audience/expired token creates or logs into a local account; email changes or unverified email are treated as identity.

**Required amendment:** verify Google signature/JWKS, `aud`, `iss`, `exp`, `iat` skew, `nonce`, and `azp` when applicable. Use Google `sub` as stable identity; never key accounts on email. Define `email_verified` policy before upsert. Never persist, return, log, or expose auth code/access token/ID token.

### 3. Session fixation and session persistence are under-specified
**Attack:** a pre-auth/session cookie survives login and becomes authenticated; process restart invalidates sessions unpredictably; DB compromise exposes live bearer session IDs.

**Required amendment:** destroy any pre-login session/auth attempt and issue a fresh random session after successful OIDC callback. Store only hashed session tokens in DB, with absolute + idle expiry, revocation/logout rows, `HttpOnly`, production `Secure`, intentional `SameSite`, no `Domain`, and preferably `__Host-` cookie naming where path/secure constraints can be met.

### 4. Cookie-backed mutations need CSRF tokens plus Origin/Referer checks
**Attack:** SameSite=Lax does not cover every browser edge and does not prove user intent for POST/DELETE settings, logout, action approval/cancel, or private run creation.

**Required amendment:** every authenticated mutation must require a per-session CSRF token and same-origin `Origin`/`Referer` guard in production. This includes `/api/auth/logout`, settings save/delete/test, action approve/cancel, private run creation, and any future Google callback POST if GIS POST mode is used. Do not rely on SameSite alone.

### 5. User isolation must be designed before first-login upsert
**Attack:** first Google user sees or overwrites singleton Atlassian/LLM settings, run records, action approvals, history, or audit entries.

**Required amendment:** all private stores must carry and query by `user_id`: settings, runs, streams, action reviews/resolutions, history, audits, model/test routes. Route lookups must be `(user_id, id)` not just `runId` or `actionId`. Private SSE stream URLs must never expose another user's run by ID alone. `/copilot` public demo may remain unauthenticated, but authenticated/private runs must be user-owned.

### 6. Settings secret inheritance is a data leak risk
**Attack:** a new Google user gets access to existing singleton personal profiles or environment credentials intended for operator/demo use.

**Required amendment:** new Google users start with no personal Atlassian/LLM credentials unless explicitly configured. Environment credentials must be demo/operator fallback only under explicit config and non-secret response contracts. Writes must require user-owned credentials and allowlists; user settings APIs must never read or write singleton profiles in multi-user mode.

### 7. Legacy singleton profile migration can leak secrets
**Attack:** `atlassian-profile.json` / `llm-profile.json` is auto-imported into the first or every Google user.

**Required amendment:** quarantine legacy singleton profiles on multi-user startup, or require an explicit admin/operator migration. No automatic import. Add rollback/quarantine behavior and tests proving legacy profiles are not exposed to any Google user.

### 8. SSRF and credential exfiltration must remain hard-gated on every credential-bearing outbound request
**Attack:** a stored or changed Atlassian URL redirects Basic auth/API token to private/internal hosts or attacker-controlled hosts.

**Required amendment:** keep/extend Atlassian host allowlisting before every credential-bearing fetch; add redirect-blocking/manual redirect validation, DNS/private range checks where feasible, fixed HTTPS paths, timeouts, and tests for localhost, private IPs, IP literals, `.local`, redirect-to-private, and DNS rebinding scenarios. Current host normalization is a good start but plan must make this a required gate for every path that sends `Authorization`.

### 9. SQL injection risks move from theoretical to critical once SQLite is introduced
**Attack:** malicious `user_id`, `run_id`, `action_id`, provider, route param, sort/order value, or allowlist value alters cross-user queries.

**Required amendment:** all SQLite access must use prepared statements/bound parameters. Any dynamic table/column/order/provider identifiers must be allowlisted. Add malicious input tests for user IDs, run IDs, action IDs, provider names, route params, and migration inputs.

### 10. Browser token leakage must be forbidden explicitly in plan and static gates
**Attack:** OAuth code/token/CSRF/session material lands in localStorage/sessionStorage, query strings, fragments, analytics, logs, React Query cache snapshots, screenshots, or SSE URLs.

**Required amendment:** frontend never handles Google tokens. Browser may navigate only to Broker login start route and receive clean redirects. Keep session in HttpOnly cookie; CSRF token may be non-secret but should be scoped/in-memory and never placed in URL/storage. Extend static scans/tests to forbid OAuth/Google/session/CSRF/bearer material in storage, URL params/fragments, frontend logs, and snapshots.

## Required acceptance criteria before implementation starts

- Plan/test spec has explicit tests for invalid/missing/replayed/expired OAuth `state`, `nonce`, and PKCE verifier.
- Plan/test spec has explicit ID token verification tests for wrong `aud`, wrong `iss`, expired token, missing/mismatched nonce, unverified email policy, and stable `sub` upsert.
- Plan/test spec has session fixation tests proving session ID changes after login and logout revokes server-side session.
- Plan/test spec has CSRF/Origin tests for logout, settings, action approve/cancel, private run creation, and Google callback POST if applicable.
- Plan/test spec has cross-user isolation tests for settings, runs, stream, actions, audits, history, model/test routes, and write execution.
- Plan/test spec has legacy singleton quarantine tests and no auto-import of `atlassian-profile.json` / `llm-profile.json`.
- Plan/test spec has SSRF/redirect/private-network tests for every credential-bearing Atlassian path.
- Plan/test spec has SQL injection tests around every new SQLite query surface.
- Plan/test spec has static/browser leakage scans for OAuth/session/CSRF/Google/Atlassian/LLM/bearer secrets.

## Probe summary

- Repo probe confirmed no Google/OIDC wiring yet and identified the highest-risk surfaces: auth routes, session middleware, settings stores, run/action/audit stores, and browser client fetch helpers.
- Official-doc probe confirmed non-negotiable state, nonce, local ID-token verification, server-side client secret, hardened own-session cookie, session regeneration, and CSRF coverage.
- Critic probe independently rejected execution until the above gates are encoded in plan/test spec.
