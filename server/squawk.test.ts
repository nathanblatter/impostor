import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHash, createSign, generateKeyPairSync, type KeyObject } from "crypto";
import { SquawkClient, SquawkError, UserTokenVerifier, mapSquawkError, type SquawkConfig } from "./squawk.js";
import { decodeSession, encodeSession } from "./session.js";

const ISSUER = "https://squawk.test";
const SERVICE_ID = "svc_test";
const CFG: SquawkConfig = {
  issuer: ISSUER,
  serviceId: SERVICE_ID,
  credential: "nbk_test_secret",
  clientId: "nbc_test",
  resource: "https://impostor.test/api",
  siteUrl: "https://impostor.test",
};

// ── ES256 test key + minting ────────────────────────────────────────────────

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const KID = "kid-1";
const jwks = { keys: [{ ...(publicKey.export({ format: "jwk" }) as JsonWebKey), kid: KID, use: "sig", alg: "ES256" }] };

const b64url = (v: Buffer | string) => Buffer.from(v).toString("base64url");

/** DER ECDSA signature → raw r||s (64 bytes), the JWS encoding. */
function derToRaw(der: Buffer): Buffer {
  let i = 2; // skip SEQUENCE header
  const readInt = () => {
    if (der[i++] !== 0x02) throw new Error("bad der");
    const len = der[i++];
    let v = der.subarray(i, i + len);
    i += len;
    while (v.length > 32) v = v.subarray(1);
    return Buffer.concat([Buffer.alloc(32 - v.length), v]);
  };
  return Buffer.concat([readInt(), readInt()]);
}

function mint(claims: Record<string, unknown>, key: KeyObject = privateKey, kid = KID): string {
  const header = b64url(JSON.stringify({ alg: "ES256", typ: "at+jwt", kid }));
  const payload = b64url(JSON.stringify(claims));
  const der = createSign("sha256").update(`${header}.${payload}`).sign(key);
  return `${header}.${payload}.${b64url(derToRaw(der))}`;
}

const now = () => Math.floor(Date.now() / 1000);
const userClaims = (over: Record<string, unknown> = {}) => ({
  iss: ISSUER, sub: "usr:usr_abc", aud: SERVICE_ID, email: "p@example.com", email_verified: true,
  scope: "play", iat: now(), exp: now() + 3600, jti: "x", ...over,
});

describe("UserTokenVerifier", () => {
  const verifier = () => new UserTokenVerifier(ISSUER, SERVICE_ID, async () => jwks);

  it("accepts a valid user token", async () => {
    const claims = await verifier().verify(mint(userClaims()));
    expect(claims?.sub).toBe("usr:usr_abc");
    expect(claims?.email).toBe("p@example.com");
  });

  it("accepts an owner token without email", async () => {
    const claims = await verifier().verify(mint(userClaims({ sub: "owner", email: undefined, email_verified: undefined })));
    expect(claims?.sub).toBe("owner");
  });

  it("rejects wrong audience", async () => {
    expect(await verifier().verify(mint(userClaims({ aud: "svc_other" })))).toBeNull();
  });

  it("rejects wrong issuer", async () => {
    expect(await verifier().verify(mint(userClaims({ iss: "https://evil.test" })))).toBeNull();
  });

  it("rejects expired tokens", async () => {
    expect(await verifier().verify(mint(userClaims({ exp: now() - 120 })))).toBeNull();
  });

  it("rejects unverified usr: tokens", async () => {
    expect(await verifier().verify(mint(userClaims({ email_verified: false })))).toBeNull();
    expect(await verifier().verify(mint(userClaims({ email_verified: undefined })))).toBeNull();
  });

  it("rejects a bad signature / unknown key / garbage", async () => {
    const other = generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey;
    expect(await verifier().verify(mint(userClaims(), other))).toBeNull();
    expect(await verifier().verify(mint(userClaims(), privateKey, "kid-unknown"))).toBeNull();
    expect(await verifier().verify("not.a.jwt")).toBeNull();
    expect(await verifier().verify("")).toBeNull();
    const tampered = mint(userClaims()).split(".");
    tampered[1] = b64url(JSON.stringify(userClaims({ sub: "usr:usr_other" })));
    expect(await verifier().verify(tampered.join("."))).toBeNull();
  });

  it("caches JWKS by kid and refetches on an unknown kid", async () => {
    const fetchJwks = vi.fn(async () => jwks);
    const v = new UserTokenVerifier(ISSUER, SERVICE_ID, fetchJwks);
    await v.verify(mint(userClaims()));
    await v.verify(mint(userClaims()));
    expect(fetchJwks).toHaveBeenCalledTimes(1);
    await v.verify(mint(userClaims(), privateKey, "kid-2"));
    expect(fetchJwks).toHaveBeenCalledTimes(2);
  });
});

// ── Session cookie ──────────────────────────────────────────────────────────

describe("session cookie", () => {
  const secret = "0123456789abcdef0123456789abcdef";

  it("round-trips", () => {
    const s = { sub: "usr:usr_abc", email: "p@example.com", name: "Pat", exp: now() + 100 };
    expect(decodeSession(encodeSession(s, secret), secret)).toEqual(s);
  });

  it("rejects tampering, wrong secret, expiry and junk", () => {
    const s = { sub: "usr:usr_abc", exp: now() + 100 };
    const cookie = encodeSession(s, secret);
    const [payload, sig] = cookie.split(".");
    const forged = `${Buffer.from(JSON.stringify({ ...s, sub: "owner" })).toString("base64url")}.${sig}`;
    expect(decodeSession(forged, secret)).toBeNull();
    expect(decodeSession(`${payload}.${sig.slice(0, -1)}A`, secret)).toBeNull();
    expect(decodeSession(cookie, "another-secret")).toBeNull();
    expect(decodeSession(encodeSession({ sub: "x", exp: now() - 1 }, secret), secret)).toBeNull();
    expect(decodeSession("garbage", secret)).toBeNull();
    expect(decodeSession(undefined, secret)).toBeNull();
    expect(decodeSession(cookie, "")).toBeNull();
  });
});

// ── Error mapping ───────────────────────────────────────────────────────────

describe("mapSquawkError", () => {
  it("passes through known statuses with friendly messages", () => {
    expect(mapSquawkError(new SquawkError(401, "code_rejected"))).toMatchObject({ status: 401, body: { error: "code_rejected" } });
    expect(mapSquawkError(new SquawkError(403, "email_unverified")).body.message).toMatch(/verify/i);
    expect(mapSquawkError(new SquawkError(409, "identity_taken")).status).toBe(409);
    expect(mapSquawkError(new SquawkError(404, "not_found")).status).toBe(404);
  });

  it("carries Retry-After on 429", () => {
    expect(mapSquawkError(new SquawkError(429, "too_many_attempts", "", 42))).toMatchObject({ status: 429, retryAfter: 42 });
  });

  it("collapses everything else to 502", () => {
    expect(mapSquawkError(new SquawkError(500, "server_error")).status).toBe(502);
    expect(mapSquawkError(new TypeError("fetch failed"))).toMatchObject({ status: 502, body: { error: "server_error" } });
  });
});

// ── Client: service token cache + retry, exchange ───────────────────────────

type Call = { url: string; init: RequestInit };

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

describe("SquawkClient", () => {
  const calls: Call[] = [];
  let responder: (c: Call) => Response;

  beforeEach(() => {
    calls.length = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init: RequestInit = {}) => {
      const c = { url: String(url), init };
      calls.push(c);
      return responder(c);
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("mints the service token once and reuses it", async () => {
    responder = (c) =>
      c.url.endsWith("/v1/token")
        ? jsonResponse(200, { access_token: "svc-token", expires_in: 900 })
        : jsonResponse(200, { challenge_id: "ch_1", expires_in: 600 });
    const client = new SquawkClient(CFG);
    await client.loginEmailBegin("lc_1", "p@example.com");
    await client.loginEmailBegin("lc_1", "q@example.com");
    const tokenCalls = calls.filter((c) => c.url.endsWith("/v1/token"));
    expect(tokenCalls).toHaveLength(1);
    expect(String(tokenCalls[0].init.body)).toContain("grant_type=client_credentials");
    const begin = calls.find((c) => c.url.endsWith("/v1/login/email/begin"))!;
    expect((begin.init.headers as Record<string, string>).Authorization).toBe("Bearer svc-token");
    expect(JSON.parse(String(begin.init.body))).toEqual({ login_challenge: "lc_1", email: "p@example.com" });
  });

  it("retries once with a fresh token on 401 invalid_token", async () => {
    let tokenN = 0;
    responder = (c) => {
      if (c.url.endsWith("/v1/token")) return jsonResponse(200, { access_token: `t${++tokenN}`, expires_in: 900 });
      const authz = (c.init.headers as Record<string, string>).Authorization;
      if (authz === "Bearer t1") return jsonResponse(401, { error: "invalid_token" });
      return jsonResponse(200, { redirect_to: "https://squawk.test/oauth/continue?x" });
    };
    const client = new SquawkClient(CFG);
    const out = await client.loginEmailFinish("ch_1", "123456");
    expect(out.redirect_to).toContain("continue");
    expect(tokenN).toBe(2);
    const finish = calls.filter((c) => c.url.includes("/v1/login/email/finish"));
    expect(finish).toHaveLength(2);
    expect(finish[0].url).toContain("challenge=ch_1");
  });

  it("surfaces Squawk errors with code and Retry-After", async () => {
    responder = (c) =>
      c.url.endsWith("/v1/token")
        ? jsonResponse(200, { access_token: "t", expires_in: 900 })
        : jsonResponse(429, { error: "too_many_attempts" }, { "Retry-After": "30" });
    const client = new SquawkClient(CFG);
    const err = await client.loginPasskeyBegin("lc").catch((e) => e);
    expect(err).toBeInstanceOf(SquawkError);
    expect(err).toMatchObject({ status: 429, code: "too_many_attempts", retryAfter: 30 });
  });

  it("exchanges a code with PKCE at /oauth/token", async () => {
    responder = () => jsonResponse(200, { access_token: "user-token", expires_in: 3600 });
    const client = new SquawkClient(CFG);
    const out = await client.exchangeCode("nbac_1", "verifier-xyz");
    expect(out.access_token).toBe("user-token");
    expect(calls[0].url).toBe(`${ISSUER}/oauth/token`);
    const form = new URLSearchParams(String(calls[0].init.body));
    expect(form.get("grant_type")).toBe("authorization_code");
    expect(form.get("client_id")).toBe("nbc_test");
    expect(form.get("code_verifier")).toBe("verifier-xyz");
    expect(form.get("redirect_uri")).toBe("https://impostor.test/api/auth/callback");
  });

  it("is disabled without an issuer", () => {
    expect(new SquawkClient({ ...CFG, issuer: "" }).enabled()).toBe(false);
    expect(new SquawkClient(CFG).enabled()).toBe(true);
  });

  it("PKCE challenge derivation matches S256", () => {
    // Sanity check of the primitive /start relies on.
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    expect(createHash("sha256").update(verifier, "ascii").digest("base64url")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
});
