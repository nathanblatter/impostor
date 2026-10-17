/**
 * Player accounts (optional) via Squawk. JSON routes under /api/auth.
 *
 * Flow: GET /api/auth/start → 302 Squawk /oauth/authorize (PKCE) → Squawk parks
 * the request and sends the browser to our /login?login_challenge=… → the page
 * completes an emailed-code, passkey or Google ceremony (passkey/email proxied
 * through the routes below with the service token) → Squawk redirects to
 * GET /api/auth/callback?code&state → exchange, verify the user token, set the
 * `imp_session` cookie, land on "/".
 */

import { Router, type Request, type Response } from "express";
import { createHash, randomBytes } from "crypto";
import { SquawkClient, UserTokenVerifier, configFromEnv, mapSquawkError, type SquawkConfig } from "./squawk.js";
import { clearSessionCookie, readSession, setSessionCookie, SESSION_TTL_S } from "./session.js";
import { checkIpLimit } from "./rateLimit.js";
import { logger } from "./logger.js";

const STATE_TTL_MS = 5 * 60_000;
const LOGIN_PAGE = "/login";
const HOME_PAGE = "/";
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const CODE_RE = /^\d{6}$/;
const USER_ID_RE = /^usr_[A-Za-z0-9_-]{1,64}$/;
// Per-IP cap on the proxied ceremony endpoints (Squawk has its own limits on top).
const BEGIN_PER_MINUTE = 10;
const FINISH_PER_MINUTE = 30;

export interface AuthDeps {
  cfg?: SquawkConfig;
  sessionSecret?: string;
  secureCookies?: boolean;
}

function clientIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(",")[0].trim();
  return first || req.socket.remoteAddress || "unknown";
}

function str(v: unknown, max = 256): string | null {
  return typeof v === "string" && v.length > 0 && v.length <= max ? v : null;
}

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function bad(res: Response, message: string): void {
  res.status(400).json({ error: "invalid_request", message });
}

function sendSquawkError(res: Response, err: unknown): void {
  const m = mapSquawkError(err);
  if (m.status === 502) logger.warn(`squawk upstream error: ${err instanceof Error ? err.message : String(err)}`);
  if (m.retryAfter) res.setHeader("Retry-After", String(m.retryAfter));
  res.status(m.status).json(m.body);
}

export function createAuthRouter(deps: AuthDeps = {}): Router {
  const cfg = deps.cfg ?? configFromEnv();
  const sessionSecret = deps.sessionSecret ?? process.env.SESSION_SECRET ?? "";
  const secure = deps.secureCookies ?? process.env.NODE_ENV === "production";
  const squawk = new SquawkClient(cfg);
  const enabled = squawk.enabled() && Boolean(sessionSecret);
  const verifier = enabled ? new UserTokenVerifier(cfg.issuer, cfg.serviceId) : null;
  if (squawk.enabled() && !sessionSecret) logger.warn("SQUAWK_ISSUER set but SESSION_SECRET missing: accounts disabled");

  // Pending authorizations: state -> PKCE verifier (single container; 5 min TTL).
  const pending = new Map<string, { verifier: string; exp: number }>();
  const sweep = () => {
    const now = Date.now();
    for (const [k, v] of pending) if (v.exp < now) pending.delete(k);
  };
  setInterval(sweep, 60_000).unref();

  const router = Router();

  router.get("/config", (_req, res) => {
    res.json({ enabled, google: enabled, issuer: enabled ? cfg.issuer : null });
  });

  router.get("/me", (req, res) => {
    const s = enabled ? readSession(req, sessionSecret) : null;
    res.setHeader("Cache-Control", "no-store");
    if (!s) return res.json({ signed_in: false });
    res.json({ signed_in: true, sub: s.sub, email: s.email ?? null, name: s.name ?? null });
  });

  router.post("/logout", (_req, res) => {
    clearSessionCookie(res, secure);
    res.status(204).end();
  });

  // Everything below needs Squawk.
  router.use((_req, res, next) => {
    if (!enabled) return res.status(404).json({ error: "not_found", message: "Accounts are not configured." });
    next();
  });

  const limit = (perMinute: number) => (req: Request, res: Response, next: () => void) => {
    if (!checkIpLimit(`auth:${clientIp(req)}`, perMinute)) {
      res.setHeader("Retry-After", "60");
      return res.status(429).json({ error: "too_many_attempts", message: "Too many attempts. Try again in a minute." });
    }
    next();
  };

  const loginError = (res: Response, code: string) => res.redirect(302, `${LOGIN_PAGE}?${new URLSearchParams({ error: code })}`);

  // ── start → Squawk → login page → callback ───────────────────────────────

  router.get("/start", limit(BEGIN_PER_MINUTE), (_req, res) => {
    sweep();
    const verifierStr = randomBytes(48).toString("base64url"); // 64 chars, within RFC 7636's 43–128
    const challenge = createHash("sha256").update(verifierStr, "ascii").digest("base64url");
    const state = randomBytes(24).toString("base64url");
    pending.set(state, { verifier: verifierStr, exp: Date.now() + STATE_TTL_MS });
    const params = new URLSearchParams({
      response_type: "code",
      client_id: cfg.clientId,
      redirect_uri: squawk.redirectUri(),
      state,
      resource: cfg.resource,
      scope: "play",
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
    res.redirect(302, `${cfg.issuer}/oauth/authorize?${params}`);
  });

  router.get("/callback", async (req, res) => {
    const q = req.query as Record<string, unknown>;
    const error = str(q.error);
    if (error) return loginError(res, error);
    const code = str(q.code, 512);
    const state = str(q.state);
    if (!code || !state) return loginError(res, "invalid_request");
    const stashed = pending.get(state);
    pending.delete(state); // single use
    if (!stashed || stashed.exp < Date.now()) return loginError(res, "state_mismatch");
    try {
      const tokens = await squawk.exchangeCode(code, stashed.verifier);
      const claims = await verifier!.verify(tokens.access_token ?? "");
      if (!claims) {
        logger.warn("squawk access token failed verification");
        return loginError(res, "invalid_token");
      }
      let name: string | undefined;
      if (claims.sub.startsWith("usr:")) {
        // Tokens carry email but not the display name; fetch it (best effort).
        const user = await squawk.getUser(claims.sub.slice(4)).catch(() => null);
        if (user?.name) name = user.name;
      } else {
        name = "Nathan";
      }
      setSessionCookie(
        res,
        { sub: claims.sub, email: claims.email, name, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_S },
        sessionSecret,
        secure
      );
      logger.info(`player signed in via squawk sub=${claims.sub}`);
      res.redirect(302, HOME_PAGE);
    } catch (err) {
      const m = mapSquawkError(err);
      logger.warn(`squawk code exchange failed: ${err instanceof Error ? err.message : String(err)}`);
      loginError(res, m.body.error);
    }
  });

  // ── Ceremony proxies ─────────────────────────────────────────────────────

  const proxy = (fn: (body: Record<string, unknown>, res: Response) => Promise<unknown | void>) =>
    async (req: Request, res: Response) => {
      const body = obj(req.body) ?? {};
      try {
        const out = await fn(body, res);
        if (out !== undefined) res.json(out);
      } catch (err) {
        if (!res.headersSent) sendSquawkError(res, err);
      }
    };

  router.post("/email/begin", limit(BEGIN_PER_MINUTE), proxy(async (b, res) => {
    const loginChallenge = str(b.login_challenge);
    const email = str(b.email, 254)?.trim().toLowerCase();
    if (!loginChallenge || !email || !EMAIL_RE.test(email)) return bad(res, "A login challenge and a valid email are required.");
    const out = await squawk.loginEmailBegin(loginChallenge, email);
    return { challenge_id: out.challenge_id, expires_in: out.expires_in ?? 600 };
  }));

  router.post("/email/finish", limit(FINISH_PER_MINUTE), proxy(async (b, res) => {
    const challengeId = str(b.challenge_id);
    const code = str(b.code, 6);
    if (!challengeId || !code || !CODE_RE.test(code)) return bad(res, "A challenge id and a 6-digit code are required.");
    const out = await squawk.loginEmailFinish(challengeId, code);
    return { redirect_to: out.redirect_to };
  }));

  router.post("/passkey/begin", limit(BEGIN_PER_MINUTE), proxy(async (b, res) => {
    const loginChallenge = str(b.login_challenge);
    if (!loginChallenge) return bad(res, "A login challenge is required.");
    const out = await squawk.loginPasskeyBegin(loginChallenge);
    return { challenge_id: out.challenge_id, options: out.options };
  }));

  router.post("/passkey/finish", limit(FINISH_PER_MINUTE), proxy(async (b, res) => {
    const challengeId = str(b.challenge_id);
    const credential = obj(b.credential);
    if (!challengeId || !credential) return bad(res, "A challenge id and a credential are required.");
    const out = await squawk.loginPasskeyFinish(challengeId, credential);
    return { redirect_to: out.redirect_to };
  }));

  // ── Sign up with a passkey (open pool) ───────────────────────────────────
  // POST /v1/users creates the (unverified) passkey account, then the passkey
  // ACTIVATION flow does the rest in one pass: a mailed code verifies the email
  // and yields WebAuthn creation options; storing the credential completes the
  // parked login_challenge (`redirect_to`). If the address already owns a passkey
  // account (409 identity_taken) we skip creation, so this doubles as
  // "set up a passkey on this device" for an existing account.

  router.post("/signup/passkey", limit(BEGIN_PER_MINUTE), proxy(async (b, res) => {
    const loginChallenge = str(b.login_challenge);
    const email = str(b.email, 254)?.trim().toLowerCase();
    const name = str(b.name, 64)?.trim();
    if (!loginChallenge || !email || !EMAIL_RE.test(email) || !name) {
      return bad(res, "A login challenge, a valid email and a display name are required.");
    }
    let created = true;
    try {
      await squawk.createUser(email, name);
    } catch (err) {
      const m = mapSquawkError(err);
      if (m.body.error !== "identity_taken") throw err;
      created = false;
    }
    const out = await squawk.passkeyActivateBegin(loginChallenge, email);
    return { challenge_id: out.challenge_id, expires_in: out.expires_in ?? 600, created };
  }));

  router.post("/signup/passkey/verify", limit(FINISH_PER_MINUTE), proxy(async (b, res) => {
    const challengeId = str(b.challenge_id);
    const code = str(b.code, 6);
    if (!challengeId || !code || !CODE_RE.test(code)) return bad(res, "A challenge id and a 6-digit code are required.");
    const out = await squawk.passkeyActivateFinish(challengeId, code);
    return { user_id: out.user.id, challenge_id: out.challenge_id, options: out.options };
  }));

  router.post("/signup/passkey/finish", limit(FINISH_PER_MINUTE), proxy(async (b, res) => {
    const userId = str(b.user_id, 72);
    const challengeId = str(b.challenge_id);
    const name = str(b.name, 64)?.trim() || "This device";
    const credential = obj(b.credential);
    if (!userId || !USER_ID_RE.test(userId) || !challengeId || !credential) {
      return bad(res, "A user id, challenge id and credential are required.");
    }
    const out = await squawk.passkeyRegisterFinish(userId, challengeId, name, credential);
    if (!out.redirect_to) {
      return res.status(502).json({ error: "server_error", message: "Passkey saved but sign-in did not complete. Sign in with your passkey." });
    }
    return { redirect_to: out.redirect_to };
  }));

  return router;
}
