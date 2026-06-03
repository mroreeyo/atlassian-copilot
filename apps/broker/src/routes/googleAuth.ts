import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createHash, timingSafeEqual } from 'node:crypto';
import { googleAuthConfig, googleAuthDisabledPayload, sanitizeGoogleReturnTo } from '../config/googleAuth.js';
import { createOAuthTransaction, consumeOAuthTransaction } from '../services/auth/oauthTransactionStore.js';
import { googleOidcClient, GoogleOidcError, validateGoogleClaims, type GoogleTokenClaims } from '../services/auth/googleOidc.js';
import { pkceS256Challenge, randomOAuthToken, sha256Base64Url } from '../services/auth/oauthCrypto.js';
import { createSession, upsertGoogleIdentityUser } from '../services/auth/authStore.js';
import { invalidateRequestSession, setSessionCookie } from '../services/auth/sessionCookie.js';

interface GoogleStartQuery {
  returnTo?: string;
}

interface GoogleCallbackQuery {
  code?: string;
  state?: string;
  error?: string;
}

export function registerGoogleAuthRoutes(app: FastifyInstance): void {
  app.get('/api/auth/google/start', async (request: FastifyRequest<{ Querystring: GoogleStartQuery }>, reply) => {
    const config = googleAuthConfig();
    if (!config.enabled) return reply.code(503).send(googleAuthDisabledPayload(config));

    const returnTo = sanitizeGoogleReturnTo(request.query.returnTo);
    const state = randomOAuthToken();
    const nonce = randomOAuthToken();
    const pkceVerifier = randomOAuthToken(48);
    createOAuthTransaction({ state, nonce, pkceVerifier, returnTo, ttlMs: config.transactionTtlMs });

    return reply
      .header('Cache-Control', 'no-store')
      .redirect(googleOidcClient(config).authorizationUrl({ state, nonce, codeChallenge: pkceS256Challenge(pkceVerifier), returnTo }));
  });

  app.get('/api/auth/google/callback', async (request: FastifyRequest<{ Querystring: GoogleCallbackQuery }>, reply) => {
    const config = googleAuthConfig();
    if (!config.enabled) return reply.code(503).send(googleAuthDisabledPayload(config));
    reply.header('Cache-Control', 'no-store');

    if (request.query.error) return redirectAuthFailure(reply, 'google_denied');
    if (!request.query.code || !request.query.state) return redirectAuthFailure(reply, 'missing_google_callback');

    const transaction = consumeOAuthTransaction(request.query.state);
    if (!transaction) return redirectAuthFailure(reply, 'invalid_google_state');

    try {
      const client = googleOidcClient(config);
      const claims = await client.exchangeAndVerify({ code: request.query.code, pkceVerifier: transaction.pkceVerifier, nonce: transaction.nonceHash });
      validateNonceHash(claims, transaction.nonceHash);
      validateGoogleClaims(claims, { clientId: config.clientId, hostedDomain: config.hostedDomain });
      const identityUser = upsertGoogleIdentityUser({
        providerSubject: claims.sub,
        email: claims.email,
        emailVerified: claims.email_verified === true || claims.email_verified === 'true',
        hostedDomain: claims.hd,
        displayName: claims.name,
        avatarUrl: claims.picture,
        rawClaimsHash: hashClaims(claims)
      });
      invalidateRequestSession(request);
      const session = createSession(identityUser.user, identityUser.userId);
      setSessionCookie(reply, request, session.sessionId);
      const safeReturnTo = sanitizeGoogleReturnTo(transaction.returnTo);
      return reply.redirect(safeReturnTo);
    } catch (error) {
      const reason = error instanceof GoogleOidcError ? error.code : 'google_callback_failed';
      return redirectAuthFailure(reply, reason);
    }
  });
}

function validateNonceHash(claims: GoogleTokenClaims, nonceHash: string): void {
  const actual = Buffer.from(sha256Base64Url(claims.nonce));
  const expected = Buffer.from(nonceHash);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new GoogleOidcError('invalid_nonce');
}

function hashClaims(claims: GoogleTokenClaims): string {
  return createHash('sha256')
    .update(JSON.stringify({ iss: claims.iss, aud: claims.aud, azp: claims.azp, sub: claims.sub, email_verified: claims.email_verified, hd: claims.hd }))
    .digest('base64url');
}

function redirectAuthFailure(reply: FastifyReply, reason: string) {
  return reply.redirect(`/login?authError=${encodeURIComponent(reason)}`);
}
