# Task 1 Repair — Official Docs Evidence for Google OAuth/OIDC Auth Plan

- Team: `google-oauth-oidc-log-8f2389f6`
- Worker: `worker-1`
- Created: 2026-06-03
- Scope: official/primary docs only; no application source edits.

## Cited findings

### Google OAuth 2.0 web server flow

- Google's web-server OAuth flow is specifically for apps that can store confidential information and maintain state; that supports Broker-owned OAuth instead of browser-owned token handling. Source: Google OAuth web server docs, page summary and web-server description: https://developers.google.com/identity/protocols/oauth2/web-server
- Web-server authorization requests use `response_type=code`, a registered `redirect_uri`, scopes, client id, and a `state` value. Google states redirect URI values must exactly match Cloud Console authorized redirect URIs. Source: same Google web-server docs.
- Google explicitly calls out CSRF prevention for OAuth clients and says one way is using `state` between authorization request and response. The callback handler must compare received state to stored session state before exchanging the code. Source: same Google web-server docs.
- For this app's login-only goal, request the minimum OIDC scopes (`openid email profile` if profile display is needed). Do not request Google API scopes, offline access, or refresh tokens unless a later feature needs Google API access.

### Google OpenID Connect / ID token verification

- Google OIDC recommends hard-coding the discovery document URI `https://accounts.google.com/.well-known/openid-configuration` and using HTTPS endpoints. Source: Google OpenID Connect docs: https://developers.google.com/identity/openid-connect/openid-connect
- Server must validate ID tokens before relying on them: verify issuer signature/JWKS, `iss` is `https://accounts.google.com` or `accounts.google.com`, `aud` equals this app's client ID, `exp` has not passed, and `hd` only when enforcing a Workspace domain. Source: Google OpenID Connect docs.
- Use Google `sub` as the local identity key; Google warns not to use `email` as a unique identifier because it can change, while `sub` is unique and not reused. Source: Google OpenID Connect docs.
- If `nonce` is sent, the ID token includes it and the app should protect against replay by accepting that value only once. Source: Google OpenID Connect docs.
- ID tokens are sensitive; Google says to transmit them only over HTTPS and via POST data or request headers, and store them securely if stored server-side. Source: Google OpenID Connect docs.

### PKCE, state, and nonce guidance

- For this confidential web-server app, `state` is non-negotiable for login CSRF protection. Store it server-side or in a signed/HttpOnly same-site transaction cookie and consume it once.
- Use `nonce` for OIDC replay protection and bind it to the same one-time OAuth transaction.
- PKCE is documented by Google primarily for installed apps, where a high-entropy `code_verifier` and S256 `code_challenge` protect the authorization code. Source: Google OAuth native-app/PKCE docs: https://developers.google.com/identity/protocols/oauth2/native-app and RFC 7636: https://www.rfc-editor.org/rfc/rfc7636
- Recommendation for AX Knowledge Copilot: include PKCE with S256 if the selected library/Google client path supports it for the confidential web-server flow, but do not treat PKCE as a replacement for `state`, `nonce`, redirect URI exact-match, or server-side client-secret protection.

### Fastify OAuth/session/cookie integration

- `@fastify/oauth2` supports start redirect path, callback URI, custom `generateStateFunction`, and `checkStateFunction`; custom state is placed in an HttpOnly, SameSite=Lax cookie and must be validated. Source: Fastify OAuth2 README: https://github.com/fastify/fastify-oauth2
- `@fastify/session` cookie options include `httpOnly`, `secure`, `sameSite`, `path`, `maxAge`, and a pluggable session store with `set/get/destroy`; its default store is in-memory and should not be used in production. Source: Fastify Session README: https://github.com/fastify/session
- If TLS terminates at a reverse proxy, Fastify session docs require `trustProxy` for secure cookies to behave correctly. Source: Fastify Session README.
- `@fastify/cookie` documents `httpOnly`, `sameSite`, `secure`, cookie signing, `__Host-` prefix, and HTTPS precautions. Source: Fastify Cookie README: https://github.com/fastify/fastify-cookie

### OWASP authentication/session/CSRF/password guidance

- OWASP Authentication says login and all authenticated pages must use TLS/strong transport, or session IDs and credentials can be exposed. Source: OWASP Authentication Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- OWASP Session Management says session IDs must be meaningless client-side identifiers; user/role/state data belongs server-side in a session object or repository. It recommends CSPRNG-generated unique session IDs with at least 128 bits if self-generated. Source: OWASP Session Management Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- OWASP CSRF guidance recommends binding signed double-submit CSRF tokens to authenticated session-specific data and using HMAC with a server-side secret. Source: OWASP CSRF Prevention Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- If local password auth remains, OWASP Password Storage says passwords must never be stored in plaintext and should use strong slow hashes; it recommends Argon2id, or scrypt with cost parameter 2^17, block size 8, parallelization 1 when Argon2id is unavailable. Source: OWASP Password Storage Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html

## Non-negotiable security requirements for the plan

1. Broker owns Google OAuth start/callback, code exchange, ID-token verification, user upsert, session issuance, logout, and all provider secrets.
2. Browser only navigates to Broker start route and later uses HttpOnly cookie-backed session; no Google ID/access token verification or provider secret appears in frontend code, `VITE_*`, browser storage, URL fragments, logs, or snapshots.
3. OAuth transaction table/store must contain one-time `state` and `nonce` with expiry, replay prevention, safe return target, and optional PKCE verifier hash when used.
4. Callback must reject missing/invalid/reused/expired state or nonce before user/session creation.
5. ID token verification must check signature/JWKS, issuer, audience, expiry, `sub`, optional `hd`, and email verification/display policy.
6. First-login signup/upsert must key identities by Google `sub`, not email.
7. Sessions must be opaque, random, server-side, revocable, expired, rotated after login, and stored hashed at rest; production cannot use in-memory session stores.
8. Cookies must be HttpOnly, Secure in production, SameSite chosen for the deployment topology, path scoped, and proxy-aware (`trustProxy` if TLS terminates upstream).
9. Private unsafe mutations need CSRF protection bound to the authenticated session plus Origin/Referer enforcement.
10. Local password auth, if retained, must keep 8+ character contract alignment and use slow salted password hashing; do not weaken existing tests.
