/**
 * Squawk client — Nathan's auth service (https://squawk.nathanblatter.com).
 *
 * Player accounts sign in through Squawk: this app is registered there as an
 * OPEN user pool (anyone may create an account with an emailed code, a passkey,
 * or Google). This module holds everything that talks to Squawk:
 *
 * - a cached service token (client_credentials with the service credential),
 *   which authenticates our backend when it drives the login ceremonies on
 *   behalf of the /login page;
 * - thin helpers for /v1/login/* and /v1/users/*;
 * - the authorization-code exchange at /oauth/token;
 * - a JWKS verifier for the user access token that exchange returns (ES256,
 *   iss == SQUAWK_ISSUER, aud == SQUAWK_SERVICE_ID, and either sub `usr:…`
 *   with email_verified, or sub `owner`).
 *
 * When SQUAWK_ISSUER is empty `enabled()` is false and the auth routes answer
 * 404; the game keeps working with anonymous names only.
 */

import { createPublicKey, verify as cryptoVerify } from "crypto";

export interface SquawkConfig {
  issuer: string;
  serviceId: string;
  credential: string;
  clientId: string;
  resource: string;
  siteUrl: string;
}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): SquawkConfig {
  return {
    issuer: (env.SQUAWK_ISSUER ?? "").replace(/\/+$/, ""),
    serviceId: env.SQUAWK_SERVICE_ID ?? "",
    credential: env.SQUAWK_CREDENTIAL ?? "",
    clientId: env.SQUAWK_CLIENT_ID ?? "",
    resource: env.SQUAWK_RESOURCE ?? "",
    siteUrl: (env.SQUAWK_SITE_URL ?? "https://impostor.nathanblatter.com").replace(/\/+$/, ""),
  };
}

const HTTP_TIMEOUT_MS = 10_000;
const TOKEN_REFRESH_MARGIN_S = 30;
const JWKS_TTL_MS = 5 * 60_000;
const OWNER_SUBJECT = "owner";

export class SquawkError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly detail = "",
    public readonly retryAfter: number | null = null
  ) {
    super(`squawk ${status} ${code}${detail ? `: ${detail}` : ""}`);
    this.name = "SquawkError";
  }
}

type Json = Record<string, unknown>;

async function raiseFor(resp: Response): Promise<void> {
  if (resp.ok) return;
  let code = "server_error";
  let detail = "";
  const text = await resp.text().catch(() => "");
  try {
    const body = JSON.parse(text) as Json;
    if (typeof body.error === "string" && body.error) code = body.error;
    const d = body.detail ?? body.error_description;
    if (typeof d === "string") detail = d;
  } catch {
    detail = text.slice(0, 200);
  }
  const ra = resp.headers.get("Retry-After");
  const retryAfter = ra && /^\d+$/.test(ra) ? parseInt(ra, 10) : null;
  throw new SquawkError(resp.status, code, detail, retryAfter);
}

function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
}

export interface SquawkUser {
  id: string;
  email: string;
  email_verified: boolean;
  name?: string;
  method?: string;
  status?: string;
}

export class SquawkClient {
  private serviceToken: string | null = null;
  private serviceTokenExp = 0; // unix seconds

  constructor(readonly cfg: SquawkConfig) {}

  enabled(): boolean {
    return Boolean(this.cfg.issuer);
  }

  redirectUri(): string {
    return `${this.cfg.siteUrl}/api/auth/callback`;
  }

  // ── Service token ────────────────────────────────────────────────────────

  resetServiceToken(): void {
    this.serviceToken = null;
    this.serviceTokenExp = 0;
  }

  async getServiceToken(): Promise<string> {
    const now = Date.now() / 1000;
    if (this.serviceToken && now < this.serviceTokenExp - TOKEN_REFRESH_MARGIN_S) return this.serviceToken;
    const resp = await fetchWithTimeout(`${this.cfg.issuer}/v1/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: this.cfg.serviceId,
        client_secret: this.cfg.credential,
      }),
    });
    await raiseFor(resp);
    const body = (await resp.json()) as { access_token: string; expires_in?: number };
    this.serviceToken = body.access_token;
    this.serviceTokenExp = now + (typeof body.expires_in === "number" ? body.expires_in : 900);
    return this.serviceToken;
  }

  /** Authenticated call to /v1/*; retries once with a fresh service token on 401 invalid_token. */
  async call<T = Json>(method: string, path: string, opts: { json?: unknown; params?: Record<string, string> } = {}): Promise<T> {
    const url = new URL(`${this.cfg.issuer}${path}`);
    for (const [k, v] of Object.entries(opts.params ?? {})) url.searchParams.set(k, v);
    const doFetch = async (): Promise<Response> =>
      fetchWithTimeout(url.toString(), {
        method,
        headers: {
          Authorization: `Bearer ${await this.getServiceToken()}`,
          ...(opts.json !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: opts.json !== undefined ? JSON.stringify(opts.json) : undefined,
      });
    let resp = await doFetch();
    if (resp.status === 401 && (resp.headers.get("content-type") ?? "").startsWith("application/json")) {
      const body = (await resp.clone().json().catch(() => ({}))) as Json;
      if (body.error === "invalid_token") {
        this.resetServiceToken();
        resp = await doFetch();
      }
    }
    await raiseFor(resp);
    if (resp.status === 204) return {} as T;
    return (await resp.json()) as T;
  }

  // ── Login ceremonies (driven for the /login page) ────────────────────────

  loginEmailBegin(loginChallenge: string, email: string) {
    return this.call<{ challenge_id: string; expires_in?: number }>("POST", "/v1/login/email/begin", {
      json: { login_challenge: loginChallenge, email },
    });
  }

  loginEmailFinish(challengeId: string, code: string) {
    return this.call<{ redirect_to: string; user?: SquawkUser }>("POST", "/v1/login/email/finish", {
      json: { code },
      params: { challenge: challengeId },
    });
  }

  loginPasskeyBegin(loginChallenge: string) {
    return this.call<{ challenge_id: string; options: Json }>("POST", "/v1/login/passkey/begin", {
      json: { login_challenge: loginChallenge },
    });
  }

  loginPasskeyFinish(challengeId: string, credential: Json) {
    return this.call<{ redirect_to: string; user?: SquawkUser }>("POST", "/v1/login/passkey/finish", {
      json: credential,
      params: { challenge: challengeId },
    });
  }

  /** Creates a passkey account (method `passkey`, email unverified). 409 identity_taken if it exists. */
  createUser(email: string, name: string) {
    return this.call<SquawkUser>("POST", "/v1/users", { json: { email, name } });
  }

  getUser(userId: string) {
    return this.call<SquawkUser>("GET", `/v1/users/${encodeURIComponent(userId)}`);
  }

  /** Mails a code to the passkey account with that address (first-device setup / sign-up). */
  passkeyActivateBegin(loginChallenge: string, email: string) {
    return this.call<{ challenge_id: string; expires_in?: number }>("POST", "/v1/login/passkey/activate/begin", {
      json: { login_challenge: loginChallenge, email },
    });
  }

  /** Code → WebAuthn creation options (also marks the email verified). */
  passkeyActivateFinish(challengeId: string, code: string) {
    return this.call<{ challenge_id: string; options: Json; user: SquawkUser }>("POST", "/v1/login/passkey/activate/finish", {
      json: { code },
      params: { challenge: challengeId },
    });
  }

  /** Stores the created credential; `redirect_to` completes the parked sign-in after an activation. */
  passkeyRegisterFinish(userId: string, challengeId: string, name: string, credential: Json) {
    return this.call<{ id: string; redirect_to?: string }>("POST", `/v1/users/${encodeURIComponent(userId)}/passkeys/finish`, {
      json: credential,
      params: { challenge: challengeId, name },
    });
  }

  // ── Authorization-code exchange ──────────────────────────────────────────

  async exchangeCode(code: string, codeVerifier: string): Promise<{ access_token: string; expires_in?: number; scope?: string }> {
    const resp = await fetchWithTimeout(`${this.cfg.issuer}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: this.cfg.clientId,
        code,
        code_verifier: codeVerifier,
        redirect_uri: this.redirectUri(),
      }),
    });
    await raiseFor(resp);
    return (await resp.json()) as { access_token: string; expires_in?: number; scope?: string };
  }
}

// ── User access-token verification ─────────────────────────────────────────

export interface UserClaims {
  iss: string;
  sub: string;
  aud: string;
  exp: number;
  iat: number;
  email?: string;
  email_verified?: boolean;
  scope?: string;
}

// Node's global JsonWebKey (lib.dom-style) plus the kid we cache by.
type Jwk = JsonWebKey & { kid?: string };

const b64urlDecode = (s: string): Buffer => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

/** DER-encode a raw r||s ECDSA signature (64 bytes) for Node's verifier. */
function rawToDer(sig: Buffer): Buffer {
  if (sig.length !== 64) throw new Error("bad signature length");
  const enc = (n: Buffer) => {
    let i = 0;
    while (i < n.length - 1 && n[i] === 0) i++;
    let v = n.subarray(i);
    if (v[0] & 0x80) v = Buffer.concat([Buffer.from([0]), v]);
    return Buffer.concat([Buffer.from([0x02, v.length]), v]);
  };
  const body = Buffer.concat([enc(sig.subarray(0, 32)), enc(sig.subarray(32))]);
  return Buffer.concat([Buffer.from([0x30, body.length]), body]);
}

export class UserTokenVerifier {
  private keys = new Map<string, Jwk>();
  private fetchedAt = 0;

  constructor(
    private readonly issuer: string,
    private readonly audience: string,
    private readonly fetchJwks: () => Promise<{ keys: Jwk[] }> = async () => {
      const r = await fetchWithTimeout(`${issuer}/.well-known/jwks.json`, { method: "GET" });
      if (!r.ok) throw new Error(`jwks ${r.status}`);
      return (await r.json()) as { keys: Jwk[] };
    },
    private readonly leewaySeconds = 30
  ) {
    if (!issuer || !audience) throw new Error("issuer and audience are required");
  }

  private async resolveKey(kid: string): Promise<Jwk | null> {
    const stale = Date.now() - this.fetchedAt > JWKS_TTL_MS;
    if (!stale && this.keys.has(kid)) return this.keys.get(kid)!;
    if (stale || !this.keys.has(kid)) {
      const { keys } = await this.fetchJwks();
      this.keys = new Map(keys.filter((k) => typeof k.kid === "string").map((k) => [k.kid!, k]));
      this.fetchedAt = Date.now();
    }
    return this.keys.get(kid) ?? null;
  }

  /** Claims when the token is a valid, verified user (or owner) token for this service; null otherwise. Never throws. */
  async verify(token: string): Promise<UserClaims | null> {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return null;
      const header = JSON.parse(b64urlDecode(parts[0]).toString("utf8")) as { alg?: string; kid?: string };
      if (header.alg !== "ES256" || typeof header.kid !== "string") return null;
      const jwk = await this.resolveKey(header.kid);
      if (!jwk || jwk.kty !== "EC" || jwk.crv !== "P-256") return null;
      const key = createPublicKey({ key: jwk, format: "jwk" });
      const ok = cryptoVerify("sha256", Buffer.from(`${parts[0]}.${parts[1]}`), key, rawToDer(b64urlDecode(parts[2])));
      if (!ok) return null;

      const claims = JSON.parse(b64urlDecode(parts[1]).toString("utf8")) as Partial<UserClaims>;
      const now = Date.now() / 1000;
      if (claims.iss !== this.issuer) return null;
      if (claims.aud !== this.audience) return null;
      if (typeof claims.exp !== "number" || typeof claims.iat !== "number" || typeof claims.sub !== "string") return null;
      if (claims.exp + this.leewaySeconds < now) return null;
      if (claims.iat - this.leewaySeconds > now) return null;
      if (claims.sub === OWNER_SUBJECT) return claims as UserClaims;
      if (!claims.sub.startsWith("usr:") || claims.email_verified !== true) return null;
      return claims as UserClaims;
    } catch {
      return null;
    }
  }
}

// ── Error mapping for the JSON routes ──────────────────────────────────────

const ERROR_MESSAGES: Record<string, string> = {
  code_rejected: "That code is wrong or expired. Request a new one.",
  passkey_rejected: "Passkey not recognized.",
  signup_closed: "Sign-ups are closed.",
  account_disabled: "That account is disabled.",
  email_unverified: "Verify your email before signing in.",
  identity_taken: "An account with that email already exists.",
  already_verified: "That email is already verified.",
  too_many_attempts: "Too many attempts. Try again later.",
  not_found: "This sign-in attempt expired. Start over.",
  email_disabled: "Email sign-in is unavailable right now.",
  google_disabled: "Google sign-in is unavailable right now.",
};

export interface MappedError {
  status: number;
  body: { error: string; message: string };
  retryAfter: number | null;
}

/** Map any failure from a Squawk call to a clean JSON response. */
export function mapSquawkError(err: unknown): MappedError {
  if (err instanceof SquawkError) {
    const status = [400, 401, 403, 404, 409, 429].includes(err.status) ? err.status : 502;
    const message =
      status === 502
        ? "Sign-in service unavailable. Try again."
        : ERROR_MESSAGES[err.code] ?? err.detail ?? "Sign-in failed.";
    return { status, body: { error: err.code, message }, retryAfter: status === 429 ? err.retryAfter : null };
  }
  return { status: 502, body: { error: "server_error", message: "Sign-in service unavailable. Try again." }, retryAfter: null };
}
