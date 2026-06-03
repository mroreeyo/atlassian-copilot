# Google 로그인 / 최초 로그인 가입 처리 최종 구현 계획

- 작성일: 2026-06-03
- 프로젝트: AX Knowledge Copilot
- 범위: Google OAuth/OIDC 로그인, 최초 Google 로그인 시 로컬 사용자 생성/갱신, 세션/DB/CSRF/사용자 데이터 격리, UI 노출, 테스트/배포 계획
- 상태: **계획 확정 전 최종 산출물**. 현재 앱에는 Google 로그인 UI/API가 아직 없고, 로컬 이메일/비밀번호 로그인만 있다.
- 선행 변경 완료: 로컬 비밀번호 기준은 서버/UI 모두 **8자 이상**으로 정렬됨.

## 1. 현재 레포 상태

### 이미 구현된 것

- `apps/broker/src/routes/auth.ts`
  - `POST /api/auth/signup`
  - `POST /api/auth/login`
  - `GET /api/auth/session`
  - `POST /api/auth/logout`
- `apps/broker/src/services/auth/authStore.ts`
  - 로컬 사용자를 `auth-users.json`에 저장한다.
  - 비밀번호는 `scrypt` + salt로 해시한다.
  - 세션은 프로세스 메모리 `Map`에 저장한다.
- `apps/broker/src/services/auth/sessionCookie.ts`
  - `akc_session` HttpOnly / SameSite=Lax 쿠키를 발급한다.
- `apps/web/src/app/App.tsx`
  - `/copilot`은 공개.
  - `/history`, `/settings`는 `ProtectedRoute`로 보호.
- `apps/web/src/pages/auth/LoginPage.tsx`, `SignupPage.tsx`
  - 현재는 로컬 이메일/비밀번호 UI만 있다.
- `packages/shared/src/schemas/contracts.ts`
  - 비밀번호 최소 길이 8자, 최대 128자, 기본 복잡도 검증.

### 아직 없는 것

- `/api/auth/google/start` 또는 `/api/auth/google/callback` 같은 Google OAuth/OIDC Broker 라우트.
- Google 로그인 버튼/문구.
- Google `sub` 기반 로컬 사용자 identity 테이블.
- DB 기반 durable session.
- per-user settings/runs/audit/action isolation.
- 세션 기반 CSRF 토큰.
- Google Cloud redirect URI / prod Broker deploy story.

결론: 사용자가 “Google 로그인 버튼이 안 보인다”고 한 것은 현재 소스 기준으로 맞다. 지금 상태에서는 Google 로그인/최초 로그인 가입 처리가 아직 구현되지 않았다.

## 2. 설계 결정

### 2.1 인증 소유권

- Google OAuth/OIDC는 **Broker 전용**으로 구현한다.
- 브라우저는 Google 로그인 시작 URL로 이동만 한다.
- 브라우저는 Google authorization code, access token, ID token, refresh token, client secret을 직접 처리/저장/검증하지 않는다.
- OpenAI/Jira/Confluence/MCP 자격증명 노출 금지 원칙을 그대로 유지한다.

### 2.2 로그인/가입 UX 정책

- P0 권장: **Google 로그인 primary**.
- 기존 로컬 이메일/비밀번호 인증은 production에서는 기본 비활성화하고, dev/demo fallback으로만 `AKC_ENABLE_LOCAL_AUTH=true`일 때 표시한다.
- `/signup`은 별도 Google 회원가입 폼이 아니라 “Google로 계속하면 최초 로그인 시 계정이 생성됩니다” 흐름으로 바꾼다.
- 최초 Google 로그인 성공 시:
  1. Google ID token 검증.
  2. Google `sub`로 `user_identities` 조회.
  3. 없으면 `users` + `user_identities` 생성.
  4. 있으면 email/name/avatar 등 표시 메타데이터만 갱신.
  5. 새 서버 세션 발급.
  6. 안전한 `returnTo`로 redirect.

### 2.3 DB 선택

- P0/local/portfolio에는 SQLite를 적용한다.
- 구현 시점의 후보:
  - `better-sqlite3@12.10.0` — 현재 npm 확인 기준, MIT, 단일 프로세스 Broker에 적합. native build 리스크가 있으므로 CI/build 검증 필수.
  - `sqlite@5.1.1` — promise wrapper 성격. 실제 driver 선택이 필요하다.
- 최종 권장: `better-sqlite3`를 pin하고 lockfile에 고정하되, 모든 DB 접근은 repository adapter 뒤로 감싼다.
- Postgres 전환 가능성을 위해 SQL/adapter 경계를 분리한다.
- production multi-instance로 갈 경우 SQLite 단일 파일은 부적합할 수 있으므로 Postgres 전환을 별도 phase로 둔다.

## 3. 구현 아키텍처

### 3.1 Broker 라우트

추가/수정 파일 후보:

- `apps/broker/src/routes/auth.ts`
- `apps/broker/src/services/auth/googleOidc.ts`
- `apps/broker/src/services/auth/oauthTransactionStore.ts`
- `apps/broker/src/services/auth/sessionStore.ts`
- `apps/broker/src/services/auth/userStore.ts`
- `apps/broker/src/services/storage/sqlite.ts`
- `apps/broker/src/config/auth.ts`

필수 라우트:

1. `GET /api/auth/google/start?returnTo=/settings`
   - `returnTo` allowlist 검증.
   - state, nonce, PKCE verifier/challenge 생성.
   - state/nonce/verifier hash를 DB에 저장.
   - Google Authorization URL로 redirect.
2. `GET /api/auth/google/callback`
   - state 조회/검증/atomic consume.
   - code exchange.
   - ID token 검증.
   - Google `sub` 기준 upsert.
   - 기존 pre-login session 폐기.
   - 새 hashed server session 생성.
   - clean app path로 redirect.
3. `GET /api/auth/me` 또는 기존 `GET /api/auth/session` 확장
   - 사용자 정보와 CSRF token 반환.
   - 세션 ID / Google token / OAuth state / nonce는 반환 금지.
4. `POST /api/auth/logout`
   - CSRF 필요.
   - DB session revoke.
   - 쿠키 삭제.

### 3.2 환경 변수

`apps/broker/.env.example`에 추가:

```env
AKC_AUTH_BASE_URL=http://localhost:8787
AKC_WEB_BASE_URL=http://localhost:5173
AKC_ENABLE_GOOGLE_AUTH=false
AKC_ENABLE_LOCAL_AUTH=true
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:8787/api/auth/google/callback
GOOGLE_ALLOWED_HOSTED_DOMAIN=
AKC_AUTH_SESSION_TTL_HOURS=168
AKC_AUTH_SESSION_IDLE_TTL_MINUTES=60
AKC_AUTH_OAUTH_TRANSACTION_TTL_MINUTES=10
AKC_AUTH_DB_PATH=.akc-state/auth.sqlite
```

운영 원칙:

- Google secret은 Broker env/secret manager에만 존재.
- `VITE_GOOGLE_CLIENT_SECRET`, `VITE_GOOGLE_TOKEN`, `VITE_ATLASSIAN_TOKEN` 같은 프론트 secret env는 만들지 않는다.
- local dev는 고정 Broker port를 우선 사용한다. 동적 port를 쓰면 Google redirect URI mismatch가 발생한다.

### 3.3 Google Cloud Console 설정 매트릭스

| 환경 | Redirect URI | Authorized JS Origin | 비고 |
| --- | --- | --- | --- |
| local | `http://localhost:8787/api/auth/google/callback` | 필요 없음 또는 `http://localhost:5173` | 브라우저가 Broker start로만 이동하면 JS origin 최소화 |
| staging | `https://staging.example.com/api/auth/google/callback` | 필요 없음 또는 staging web origin | same-origin `/api` 권장 |
| production | `https://app.example.com/api/auth/google/callback` | 필요 없음 또는 prod web origin | HTTPS 필수 |

## 4. DB 스키마

### 4.1 사용자 / identity

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
  provider text not null,
  provider_subject text not null,
  email_at_login text,
  email_verified integer not null,
  hosted_domain text,
  raw_claims_hash text,
  created_at text not null,
  updated_at text not null,
  unique(provider, provider_subject)
);
```

정책:

- local user와 Google identity를 email만으로 자동 병합하지 않는다.
- Google `sub`가 유일한 외부 identity key다.
- email은 표시/연락용 metadata다.
- `email_verified=false` 처리 정책을 명시한다. 기본은 Google login 허용 전 verified email 요구.

### 4.2 OAuth transaction

```sql
oauth_transactions(
  state_hash text primary key,
  nonce_hash text not null,
  pkce_verifier_hash text not null,
  return_to text not null,
  created_at text not null,
  expires_at text not null,
  consumed_at text
);
```

정책:

- state/nonce/PKCE verifier 원문은 저장하지 않는다.
- TTL 기본 10분.
- callback에서 atomic consume.
- missing/invalid/expired/replayed/mismatched transaction은 전부 실패.

### 4.3 session / CSRF

```sql
sessions(
  id_hash text primary key,
  user_id text not null references users(id) on delete cascade,
  csrf_secret_hash text not null,
  created_at text not null,
  last_seen_at text not null,
  expires_at text not null,
  idle_expires_at text not null,
  revoked_at text,
  user_agent_hash text,
  ip_prefix_hash text
);
```

정책:

- 쿠키에는 opaque random session token만 담는다.
- DB에는 session token hash만 저장한다.
- OAuth callback 성공 시 기존 세션은 폐기하고 새 세션을 발급한다.
- absolute TTL + idle TTL 모두 적용한다.
- production cookie:
  - 가능하면 `__Host-akc_session`
  - `HttpOnly`
  - `Secure`
  - `SameSite=Lax` for same-site deployment
  - `Path=/`
  - `Domain` 없음

### 4.4 user-owned private data

현재 singleton/global store를 user-scoped store로 바꾼다.

- Atlassian settings: `user_atlassian_settings(user_id, ...)`
- LLM settings: `user_llm_settings(user_id, ...)`
- runs/history: `runs(id, user_id nullable, mode, ...)`
- action review: `actions(id, run_id, user_id, ...)`
- audit: `audit_entries(id, user_id, ...)`

정책:

- authenticated private route는 반드시 `user_id` predicate를 사용한다.
- public `/copilot` demo run은 `user_id=null`, `mode=mock`로 유지한다.
- private run stream은 `(run_id, user_id)`로 조회한다.
- action approve/cancel은 `(action_id, user_id)`로 조회한다.
- 기존 `atlassian-profile.json`, `llm-profile.json`는 multi-user mode에서 quarantine한다. 첫 Google user에게 자동 귀속하지 않는다.

## 5. 보안 acceptance criteria — 1차 강검토 반영

다음 항목은 구현 완료 조건이며 후순위로 미룰 수 없다.

1. OAuth transaction
   - high entropy state + nonce + PKCE S256.
   - 서버 저장, hash at rest, TTL, one-time consume.
   - state/nonce/PKCE mismatch/replay/expiry 테스트.
2. ID token verification
   - signature/JWKS.
   - issuer: `https://accounts.google.com` 또는 `accounts.google.com`.
   - audience: `GOOGLE_CLIENT_ID`.
   - `azp` 필요 시 검증.
   - exp/iat clock skew 정책.
   - nonce claim equality.
   - stable `sub` 사용.
   - token/code/access token 저장/응답/log 금지.
3. Session fixation 방지
   - callback 성공 시 pre-login session/auth attempt 폐기.
   - 새 random server-side session 발급.
   - DB에는 hash만 저장.
4. CSRF
   - 모든 cookie-backed mutation에 `X-CSRF-Token` 필요.
   - logout/settings/LLM test/action approve/cancel/write action 포함.
   - Origin/Referer 검증은 방어층으로 유지.
5. User isolation
   - settings/runs/streams/actions/audit/history 모두 `user_id`로 격리.
   - user A가 user B의 run/action/settings/audit에 접근하면 404/403.
6. Secret inheritance 금지
   - 새 Google user가 env/global Atlassian/LLM credentials를 자동 상속하지 않는다.
   - env credential은 명시적 demo/operator fallback일 때만 read-only/non-secret contract로 사용.
7. Legacy singleton quarantine
   - 기존 JSON singleton은 multi-user private route에서 접근 불가.
   - migration command가 없으면 startup warning/fail 정책 적용.
8. SSRF / credential exfiltration
   - Atlassian host policy를 save/test뿐 아니라 credential-bearing outbound 전체에 적용.
   - private IP, `.local`, bare IP, redirect-to-private, DNS rebinding 케이스 테스트.
9. SQL injection
   - prepared statements/bound parameters만 사용.
   - dynamic table/column/order/provider는 allowlist.
10. Browser leakage
   - auth/session/CSRF/OAuth/Google/Atlassian/LLM/bearer material을 localStorage/sessionStorage/IndexedDB/query/hash/SSE URL/log/React Query cache에 저장 금지.

## 6. 배포/UX/회귀 acceptance criteria — 2차 강검토 반영

1. Broker deployment story
   - 현재 AWS workflow는 static web deploy 중심이므로 Broker runtime/callback/persistent DB/secrets/reverse proxy 배포 계획이 먼저 필요.
   - same-origin `/api` reverse proxy 권장.
2. Cookie/proxy
   - same-origin이면 `SameSite=Lax` 유지.
   - separate API domain이면 `SameSite=None; Secure`, exact CORS credentials, CSRF 강화, 브라우저 호환 테스트 필요.
   - proxy는 `Host`, `X-Forwarded-Proto`, `X-Forwarded-For`를 전달한다.
   - auth/session/callback은 no-cache.
   - SSE는 no buffering.
3. Dependencies
   - `google-auth-library`, `@fastify/cookie`, `@fastify/csrf-protection`, `better-sqlite3` 후보를 lockfile에 pin.
   - Fastify 5.8.5와 plugin major 호환성 검증.
   - `latest` 추가 금지.
4. `/copilot` public demo preservation
   - unauthenticated `/copilot` 렌더 PASS.
   - unauthenticated `POST /api/copilot/runs`는 mock run 유지.
   - unauthenticated private write/action/settings/history는 401/403.
5. UX/copy
   - Login/Signup 모두 Google CTA를 명확히 표시.
   - “Google로 계속하면 최초 로그인 시 계정이 생성됩니다.” 문구 추가.
   - domain denied/callback failed/cookie blocked/error states 추가.
   - local auth가 disabled면 이메일/비밀번호 폼 숨김.
6. Rollback
   - `AKC_ENABLE_GOOGLE_AUTH=false`로 Google auth route/CTA 비활성화 가능.
   - migration은 additive.
   - rollback 시 Google sessions revoke 가능.

## 7. UI 변경 계획

### LoginPage

- 상단 primary CTA: `Google로 계속하기`.
- 설명: `Google로 로그인하면 계정이 없을 경우 자동으로 작업 공간이 생성됩니다.`
- local auth enabled일 때만 email/password form 표시.

### SignupPage

- 기존 로컬 가입 폼은 dev fallback으로 이동.
- primary copy:
  - 제목: `Google로 작업 공간 만들기`
  - 본문: `최초 Google 로그인 시 AX Knowledge Copilot 계정이 생성됩니다.`
  - CTA: `Google로 계속하기`

### AppShell

- unauthenticated CTA를 Google primary로 변경.
- `/copilot` 공개 경험은 유지.

### Auth client

- `startGoogleLogin(returnTo)`는 token을 가져오지 않고 `window.location.assign('/api/auth/google/start?...')`만 수행.
- callback 후 URL에는 code/state/token이 남지 않아야 한다.
- session query는 Broker `/api/auth/session` 또는 `/api/auth/me`만 호출.

## 8. 구현 순서

### Phase 0 — dependency/env preparation

1. `apps/broker/package.json`에 pinned dependencies 추가.
2. lockfile 업데이트.
3. `.env.example` 업데이트.
4. security scan에 Google/CSRF/session/browser leakage 패턴 추가.

검증:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run security:scan
```

### Phase 1 — DB adapter + migration

1. SQLite open/migration module 추가.
2. `users`, `user_identities`, `sessions`, `oauth_transactions` 생성.
3. local auth도 가능하면 새 user/session store로 이동.
4. 기존 `auth-users.json`는 dev migration만 제공하거나 quarantine.

### Phase 2 — session + CSRF

1. DB-backed session 구현.
2. cookie helper를 `@fastify/cookie` 기반으로 정리.
3. `/api/auth/session` 또는 `/api/auth/me`에서 CSRF token 제공.
4. private mutations에 CSRF guard 적용.

### Phase 3 — Google OAuth/OIDC routes

1. `/api/auth/google/start` 구현.
2. `/api/auth/google/callback` 구현.
3. `google-auth-library`로 code exchange/ID token verification.
4. `sub` 기반 upsert.
5. safe redirect.

### Phase 4 — user-scoped private stores

1. settings store user_id 적용.
2. runs/action/audit store user_id 적용.
3. public mock run과 private run 분리.
4. legacy singleton quarantine.

### Phase 5 — frontend UI

1. Google CTA 추가.
2. signup first-login copy 변경.
3. local auth feature flag 반영.
4. login returnTo allowlist 유지.
5. error state 추가.

### Phase 6 — deploy/local dev

1. dev-local fixed Broker callback port 옵션 추가.
2. production same-origin `/api` reverse proxy 문서화.
3. Google Cloud Console redirect URI matrix 문서화.
4. Broker persistent state/DB volume 및 secret injection 문서화.

## 9. 테스트 계획

### Broker route tests

- Google start returns redirect and stores transaction.
- returnTo absolute/protocol-relative/encoded absolute/control char/backslash rejected.
- callback rejects invalid/missing/replayed/expired state.
- callback rejects invalid nonce.
- callback rejects wrong issuer/audience/azp/expired token.
- callback upserts by `sub`, not email.
- callback rotates session.
- logout requires CSRF and revokes session.
- local 8-character password `Pass1234` accepted if local auth enabled.

### Data isolation tests

- user A cannot read/update user B settings.
- user A cannot stream user B private run.
- user A cannot approve/cancel user B action.
- audit/history filtered by user_id.
- legacy singleton profiles are not visible in multi-user mode.

### Frontend tests

- login page displays Google CTA.
- signup page explains first-login account creation.
- local form hidden when local auth disabled.
- protected route redirects to login and returnTo succeeds.
- `/copilot` remains public.

### Security scan/static tests

- no `VITE_GOOGLE_CLIENT_SECRET` / token leakage strings.
- no Google token persistence in browser storage.
- no direct browser integration imports for OpenAI/Jira/Confluence/MCP.
- SQL uses bound params in DB adapter.

### Build/CI

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run security:scan`

## 10. 최종 stop condition

구현 완료 선언은 다음이 모두 만족될 때만 가능하다.

1. Google 로그인 버튼이 `/login`과 `/signup`에 표시된다.
2. Google 최초 로그인으로 로컬 user + identity가 생성된다.
3. 같은 Google `sub`로 재로그인하면 같은 user가 재사용된다.
4. DB-backed hashed session이 발급되고 CSRF가 private mutations에 적용된다.
5. settings/runs/actions/audit/history가 user_id로 격리된다.
6. `/copilot` 공개 mock demo가 깨지지 않는다.
7. Google tokens/secrets가 브라우저와 로그에 남지 않는다.
8. 두 강검토의 P0 gates가 테스트/acceptance criteria로 모두 반영된다.
9. lint/typecheck/test/build/security:scan이 통과한다.

## 11. 참고한 공식/주요 자료

- Google OAuth 2.0 Web Server Applications: https://developers.google.com/identity/protocols/oauth2/web-server
- Google OpenID Connect: https://developers.google.com/identity/openid-connect/openid-connect
- Google OAuth 2.0 for Mobile & Desktop Apps / PKCE reference context: https://developers.google.com/identity/protocols/oauth2/native-app
- RFC 7636 PKCE: https://www.rfc-editor.org/rfc/rfc7636
- Google Auth Library OAuth2Client docs: https://cloud.google.com/nodejs/docs/reference/google-auth-library/latest/google-auth-library/oauth2client
- Fastify OAuth2: https://github.com/fastify/fastify-oauth2
- Fastify Cookie: https://github.com/fastify/fastify-cookie
- Fastify Session: https://github.com/fastify/session
- Fastify CSRF Protection: https://github.com/fastify/csrf-protection
- OWASP Authentication Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- OWASP Session Management Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- OWASP CSRF Prevention Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- OWASP Password Storage Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
