# Google OAuth/OIDC First-login Plan — Hard-review Integration Handoff

- Team: `google-oauth-oidc-log-8f2389f6`
- Worker: `worker-2` / planner
- Task: `4` — final leader integrates two hard reviews into final plan
- Created: 2026-06-03
- Scope: planning artifact only; no application source edits

## Desired result

Produce a final, implementation-ready plan for Google OAuth/OIDC login and first-login local user creation for AX Knowledge Copilot that passes two severe review gates:

1. **Security/data-isolation review:** OAuth state/nonce, ID-token verification, session fixation, CSRF, cookie/CORS, secret leakage, user-owned data predicates, and legacy-global data quarantine.
2. **Deployability/testing/UX review:** dependency/runtime choice, SQLite/native build risk, migration/rollback, protected-route behavior, public `/copilot` preservation, Google-first-login copy, regression suite, and security scan coverage.

## Source-of-truth note

The team state contains conflicting inherited context:

- Task JSON and explicit context point to **Google OAuth/OIDC first-login signup planning**:
  - `/home/ncuri/.omx-runs/run-20260602055114-38dd/.omx/state/team/google-oauth-oidc-log-8f2389f6/tasks/task-4.json`
  - `.omx/context/google-auth-first-login-plan-20260603T010136Z.md`
  - `.omx/plans/auth-login-implementation-plan-20260602.md`
  - `.omx/plans/prd-auth-login-20260602.md`
  - `.omx/plans/test-spec-auth-login-20260602.md`
- The inherited Ultragoal label still mentions `G001-fix-shell-level-viewport-and-safe-ar`. Treat that as a stale/mismatched label for this task unless the leader explicitly changes scope.

## Evidence inspected

### Existing planning artifacts

- `.omx/context/google-auth-first-login-plan-20260603T010136Z.md` says current auth is local email/password, `/api/auth/google` is absent, first verified Google identity should create/upsert a local user, and existing singleton stores must be addressed.
- `.omx/plans/auth-login-implementation-plan-20260602.md` already proposes Broker-owned OAuth/OIDC, server-side sessions, SQLite persistence, AES-GCM secret storage, strict `returnTo`, CSRF, Origin/Referer guard, and user-scoped settings/history/audit.
- `.omx/plans/test-spec-auth-login-20260602.md` already includes tests for Google callback, state/nonce, returnTo sanitization, session rotation, CSRF, user A/B isolation, legacy global profile quarantine, production key policy, and secret-at-rest scanning.
- `.omx/plans/prd-auth-login-20260602.md` states `/copilot` and demo stay public while `/settings` and `/history` require login.

### Current repo facts

- `apps/broker/src/routes/auth.ts` implements local `/api/auth/signup`, `/api/auth/login`, `/api/auth/session`, `/api/auth/logout`; no Google start/callback routes exist.
- `apps/broker/src/services/auth/authStore.ts` stores local users in `auth-users.json` and sessions in memory keyed by email; no durable session DB, Google `sub`, or user ID exists.
- `packages/shared/src/schemas/contracts.ts` now enforces local signup password minimum of 8 characters with complexity rules.
- `apps/web/src/app/App.tsx` protects `/history` and `/settings` via `ProtectedRoute` while `/copilot` remains public.
- `apps/web/src/services/auth/authClient.ts` uses cookie credentials for local auth/session/logout.
- `apps/broker/src/routes/copilot.ts` requires auth for settings/history/action approval routes but still uses singleton settings/run/audit stores without `user_id` predicates.
- `apps/broker/package.json` has no Google OAuth, Fastify cookie/session, Google auth library, or SQLite dependencies yet.
- `scripts/security-scan.mjs` is frontend-oriented; it does not prove broker-side auth/session/DB secret leakage by default.

## Final plan amendments to integrate

### Gate 1 — Security/data isolation/CSRF/session/secret leakage

The final plan should make these requirements non-negotiable before implementation starts:

1. **Broker-owned Google OAuth/OIDC only**
   - Browser navigates to Broker login start route only.
   - Browser never handles Google ID/access tokens directly.
   - No Google/OIDC/session/CSRF material in localStorage, sessionStorage, IndexedDB, query strings, fragments, analytics, or frontend logs.
2. **Google identity contract**
   - Add `GET /api/auth/google` and `GET /api/auth/google/callback`.
   - Request only `openid profile email`.
   - Verify ID token server-side against `GOOGLE_CLIENT_ID`.
   - Use Google `sub` as the stable external identity; email is display/contact metadata only.
   - First verified login upserts the local user; subsequent logins reuse the same user row.
3. **State, nonce, and returnTo**
   - Generate high-entropy state and nonce with short TTL.
   - Store server-side and consume exactly once.
   - Reject missing, invalid, expired, or replayed state/nonce.
   - Sanitize `returnTo` server-side with an allowlist of app-relative routes; reject absolute, protocol-relative, encoded absolute, backslash, control-character, and off-route values.
4. **Session model**
   - Replace in-memory email-keyed sessions with durable server-side sessions tied to internal `user_id`.
   - Rotate/regenerate session after OAuth callback success.
   - Cookie is opaque, HttpOnly, SameSite=Lax, Path=/, Secure in production.
   - Configure Fastify trust-proxy / reverse-proxy assumptions so secure-cookie behavior is deterministic behind TLS termination.
5. **CSRF and browser mutation guard**
   - Origin/Referer checks remain defense-in-depth only.
   - Issue a CSRF token from `GET /api/auth/me` or a dedicated endpoint for authenticated sessions.
   - Require `X-CSRF-Token` for every private state-changing route, including logout, settings, LLM tests/saves, action approve/cancel, and any user-owned write action.
6. **User-owned data predicates**
   - Add internal `users.id` and require `user_id` in settings, runs, messages/history, audits, and action review lookups.
   - Every private query/mutation uses authenticated `user_id` in predicates.
   - Action approval/cancel lookup must be by `(user_id, action_id)` or equivalent ownership check.
7. **Legacy singleton data quarantine**
   - Do not auto-import `atlassian-profile.json`, `llm-profile.json`, local `auth-users.json`, or in-memory run/audit data into the first Google user.
   - Choose one explicit policy: quarantine, environment-only fallback, or authenticated manual import with rollback.
8. **Secret handling**
   - Reuse server-side AES-GCM envelope for Atlassian/LLM secrets.
   - Production requires explicit base64 32-byte `AKC_CREDENTIAL_ENCRYPTION_KEY`; fail startup if missing/malformed/dev-generated.
   - API responses never include raw Google tokens, session IDs, CSRF secrets, encryption keys, Atlassian API tokens, LLM API keys, or Authorization headers.

### Gate 2 — Deployability/testing/UX/regression/package choice

The final plan should add these execution-readiness checks:

1. **Dependency decision checkpoint**
   - Decide and record OAuth/session packages before implementation, likely:
     - `@fastify/oauth2`
     - `google-auth-library`
     - `@fastify/cookie`
     - `@fastify/session` or an explicitly justified custom cookie/session store
   - Decide SQLite driver: `better-sqlite3` vs `node:sqlite`.
   - If choosing `better-sqlite3`, require target Node/EC2 build validation and document required build tools.
2. **DB/storage rollout**
   - Add migration module with `foreign_keys=ON`, WAL where appropriate, file permission expectations, and rollback/quarantine behavior.
   - Include DB/WAL/SHM/temp/log plaintext leak scan for representative tokens and API keys.
3. **Local auth coexistence decision**
   - Current app has local email/password login/signup.
   - Final plan must choose: remove local auth, keep as dev-only, or coexist with Google under explicit account-linking/non-linking rules.
   - Do not leave local routes as implicit production auth if Google-first-login is the target.
4. **Google-first UX**
   - Replace or clearly demote local-login UI.
   - Add Korean Google login CTA and first-login account-created copy.
   - Preserve `/copilot` public demo.
   - Keep `/settings` and `/history` protected and return users to the sanitized requested route after callback.
5. **Frontend client contract**
   - Centralize private fetch/stream helpers with `credentials: 'include'`.
   - Private mutations attach `X-CSRF-Token`.
   - Authenticated SSE/fetch-stream path must send credentials if private runs become user-scoped.
6. **Regression coverage**
   - Backend: Google callback success/failure, invalid/replayed state/nonce, wrong audience, session rotation, logout invalidation, CSRF failures, origin failures, user A/B isolation for settings/history/audit/actions, legacy quarantine, production key fail-closed, DB secret-at-rest scan.
   - Frontend: public `/copilot`, protected `/settings` and `/history`, Google login CTA, callback/returnTo behavior, no private queries before auth resolves, no browser storage or URL token leakage, authenticated/private fetch helper behavior.
   - Static/security: extend `npm run security:scan` or add broker-focused scan for auth/session/OIDC/CSRF/DB/log secret leaks.
7. **Verification command set**
   - Required final implementation verification:
     ```bash
     npm run lint
     npm run typecheck
     npm run test
     npm run build
     npm run security:scan
     ```
   - Add targeted auth tests before full-suite verification.

## Recommended implementation sequence

1. Record the local-auth coexistence decision and DB/session package decision in the final plan.
2. Add shared auth contracts for `AuthMe`, Google login URL/returnTo behavior, logout response, and CSRF-bearing private mutation contract.
3. Add storage/migrations for users, sessions, user settings, private runs/history, audit/action ownership, and legacy quarantine markers.
4. Add Google auth service: OAuth start/callback, state/nonce store, ID-token verifier adapter, user upsert, session rotation, returnTo sanitizer.
5. Replace local session/auth plumbing with durable `user_id`-based session lookup; keep or remove local auth according to the explicit decision.
6. Add CSRF issuance/validation and apply it to every private mutation, with Origin/Referer retained as defense-in-depth.
7. Convert settings/history/audit/action stores and route handlers to require authenticated `user_id` for private data.
8. Update frontend auth UI to Google-first-login flow and protected route return behavior.
9. Centralize private fetch/stream helpers with credentials and CSRF handling.
10. Extend static/security scans for browser and broker leakage patterns.
11. Add targeted tests for both hard-review gates, then run the full verification suite.
12. Update deployment docs: Google Cloud redirect URI, production origins/CORS, Nginx same-origin preference, session/encryption secrets, DB/WAL backups/permissions, and SQLite build prerequisites.

## Acceptance criteria

- Final plan explicitly resolves local auth coexistence, SQLite/session package choice, legacy singleton migration/quarantine, and Google route names/UI copy.
- Final plan maps every private data surface to a `user_id` ownership rule.
- Final plan has both hard-review gates with pass/fail criteria, not just prose risks.
- Final plan keeps `/copilot` public and demo-safe while protecting `/settings`, `/history`, private settings, private history, and write audit/action ownership.
- Final plan requires tests for state/nonce replay, ID-token audience, returnTo sanitization, session rotation, CSRF, Origin/Referer, user A/B isolation, secret redaction, and DB/WAL plaintext absence.
- Final plan requires full verification commands plus targeted auth tests and names the known `npm run test` vmThreads configuration from `package.json`.

## Risks for leader to preserve

- Current source is not Google auth; it is local email/password with in-memory sessions and singleton settings/history/audit stores.
- Treating Origin/Referer as the only CSRF defense is insufficient for the desired Google/session plan.
- Without a user-owned DB model, Google first-login can create accounts but cannot safely isolate settings/history/audit data.
- `better-sqlite3` adds native build/deploy risk; do not adopt it without target-host validation or a documented fallback.
- Existing security scan coverage is not enough for broker-side auth/session/DB leakage.
- Stale viewport/safe-area Ultragoal context appears in worker handoff; do not let it override the Google OAuth task files.

## Subagent findings integrated

- Subagents spawned: 2
  - `019e8b03-2d9c-7833-9f04-8e4563fe4390` / Arendt — first review probe found state mismatch and viewport/safe-area artifacts; integrated as stale-context warning only.
  - `019e8b06-dcb9-7110-9496-cdc1165557f1` / Cicero — Google-auth review probe inspected plan artifacts and repo auth/settings/run/audit/frontend files; integrated PASS/GAP/RISK findings into Gate 1 and Gate 2 above.
- Subagent model: planner role (`gpt-5.4-mini` per role surface).
- Findings integrated: task/Ultragoal mismatch, current local-auth state, absent Google routes, missing state/nonce/CSRF/user-id storage, singleton store risks, deployability/package/test gaps, and required final-plan amendments.
- Serial searches before first spawn: 2.

## Stop condition

This worker's planning task is complete when the leader has this handoff artifact and can integrate it into the final Google OAuth/OIDC plan without relying on source edits from worker-2.
