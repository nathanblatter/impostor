/** Client helpers for the optional player account (server/auth.ts). */

export interface AuthConfig {
  enabled: boolean;
  google: boolean;
  issuer: string | null;
}

export interface Me {
  signed_in: boolean;
  sub?: string;
  email?: string | null;
  name?: string | null;
}

export class AuthError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = "AuthError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`/api/auth${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    credentials: "same-origin",
  });
  if (r.status === 204) return undefined as T;
  const body = (await r.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!r.ok) throw new AuthError(r.status, body.error ?? "error", body.message ?? "Request failed.");
  return body as T;
}

const post = <T>(path: string, json: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(json) });

type Opts = Record<string, unknown>;

export const auth = {
  startUrl: "/api/auth/start",
  config: () => request<AuthConfig>("/config"),
  me: () => request<Me>("/me"),
  logout: () => request<void>("/logout", { method: "POST" }),
  emailBegin: (login_challenge: string, email: string) => post<{ challenge_id: string }>("/email/begin", { login_challenge, email }),
  emailFinish: (challenge_id: string, code: string) => post<{ redirect_to: string }>("/email/finish", { challenge_id, code }),
  passkeyBegin: (login_challenge: string) => post<{ challenge_id: string; options: Opts }>("/passkey/begin", { login_challenge }),
  passkeyFinish: (challenge_id: string, credential: unknown) => post<{ redirect_to: string }>("/passkey/finish", { challenge_id, credential }),
  signupPasskey: (login_challenge: string, email: string, name: string) =>
    post<{ challenge_id: string; created: boolean }>("/signup/passkey", { login_challenge, email, name }),
  signupPasskeyVerify: (challenge_id: string, code: string) =>
    post<{ user_id: string; challenge_id: string; options: Opts }>("/signup/passkey/verify", { challenge_id, code }),
  signupPasskeyFinish: (user_id: string, challenge_id: string, name: string, credential: unknown) =>
    post<{ redirect_to: string }>("/signup/passkey/finish", { user_id, challenge_id, name, credential }),
};

// ── WebAuthn JSON <-> browser objects (base64url) ───────────────────────────

const toBuf = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
const toB64 = (buf: ArrayBuffer | null) =>
  buf ? btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : undefined;

interface CredDescriptorJSON { type: string; id: string; transports?: string[] }

export function decodeAssertionOptions(pk: Opts): PublicKeyCredentialRequestOptions {
  if ("parseRequestOptionsFromJSON" in PublicKeyCredential) {
    return PublicKeyCredential.parseRequestOptionsFromJSON(pk as unknown as PublicKeyCredentialRequestOptionsJSON);
  }
  return {
    challenge: toBuf(pk.challenge as string),
    rpId: pk.rpId as string | undefined,
    timeout: pk.timeout as number | undefined,
    userVerification: pk.userVerification as UserVerificationRequirement | undefined,
    allowCredentials: ((pk.allowCredentials as CredDescriptorJSON[] | undefined) ?? []).map((c) => ({
      type: c.type as PublicKeyCredentialType,
      id: toBuf(c.id),
      transports: c.transports as AuthenticatorTransport[] | undefined,
    })),
    extensions: pk.extensions as AuthenticationExtensionsClientInputs | undefined,
  };
}

export function decodeCreationOptions(pk: Opts): PublicKeyCredentialCreationOptions {
  if ("parseCreationOptionsFromJSON" in PublicKeyCredential) {
    return PublicKeyCredential.parseCreationOptionsFromJSON(pk as unknown as PublicKeyCredentialCreationOptionsJSON);
  }
  const user = pk.user as { id: string; name: string; displayName: string };
  return {
    challenge: toBuf(pk.challenge as string),
    rp: pk.rp as PublicKeyCredentialRpEntity,
    user: { ...user, id: toBuf(user.id) },
    pubKeyCredParams: (pk.pubKeyCredParams as { type: string; alg: number }[]).map((p) => ({
      type: p.type as PublicKeyCredentialType,
      alg: p.alg,
    })),
    timeout: pk.timeout as number | undefined,
    attestation: pk.attestation as AttestationConveyancePreference | undefined,
    authenticatorSelection: pk.authenticatorSelection as AuthenticatorSelectionCriteria | undefined,
    excludeCredentials: ((pk.excludeCredentials as CredDescriptorJSON[] | undefined) ?? []).map((c) => ({
      type: c.type as PublicKeyCredentialType,
      id: toBuf(c.id),
      transports: c.transports as AuthenticatorTransport[] | undefined,
    })),
    extensions: pk.extensions as AuthenticationExtensionsClientInputs | undefined,
  };
}

export function encodeAssertion(cred: PublicKeyCredential): unknown {
  if ("toJSON" in cred && typeof cred.toJSON === "function") return cred.toJSON();
  const r = cred.response as AuthenticatorAssertionResponse;
  return {
    id: cred.id,
    rawId: toB64(cred.rawId),
    type: cred.type,
    authenticatorAttachment: cred.authenticatorAttachment ?? undefined,
    clientExtensionResults: cred.getClientExtensionResults(),
    response: {
      clientDataJSON: toB64(r.clientDataJSON),
      authenticatorData: toB64(r.authenticatorData),
      signature: toB64(r.signature),
      userHandle: toB64(r.userHandle),
    },
  };
}

export function encodeAttestation(cred: PublicKeyCredential): unknown {
  if ("toJSON" in cred && typeof cred.toJSON === "function") return cred.toJSON();
  const r = cred.response as AuthenticatorAttestationResponse;
  return {
    id: cred.id,
    rawId: toB64(cred.rawId),
    type: cred.type,
    authenticatorAttachment: cred.authenticatorAttachment ?? undefined,
    clientExtensionResults: cred.getClientExtensionResults(),
    response: {
      clientDataJSON: toB64(r.clientDataJSON),
      attestationObject: toB64(r.attestationObject),
      transports: typeof r.getTransports === "function" ? r.getTransports() : undefined,
    },
  };
}

/** A human label for the passkey, e.g. "iPhone" — editable later in the Squawk console. */
export const deviceName = () => (navigator.platform || "This device").slice(0, 64);

/** The options object Squawk returns is `{publicKey: …}` (WebAuthn JSON); unwrap if so. */
export const publicKeyOf = (options: Opts): Opts => (options.publicKey as Opts | undefined) ?? options;
