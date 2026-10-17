import React, { useEffect, useState } from "react";
import {
  auth, AuthError, decodeAssertionOptions, decodeCreationOptions, deviceName,
  encodeAssertion, encodeAttestation, publicKeyOf, type AuthConfig,
} from "../auth.js";

/**
 * Optional player account sign-in through Squawk.
 *
 * Without `?login_challenge=` this page only offers "Sign in / Create account",
 * which sends the browser to /api/auth/start → Squawk /oauth/authorize. Squawk
 * parks the request and sends the browser back here with a `login_challenge`;
 * we then complete an emailed-code, passkey or Google ceremony and follow
 * `redirect_to` (our /api/auth/callback, which sets the session cookie).
 */

const CALLBACK_ERRORS: Record<string, string> = {
  access_denied: "Sign-in was cancelled.",
  state_mismatch: "This sign-in attempt expired or was already used. Start over.",
  invalid_token: "Squawk returned a token this app could not verify.",
  invalid_grant: "The sign-in code was rejected. Start over.",
  invalid_request: "Malformed sign-in response. Start over.",
  signup_closed: "Sign-ups are closed.",
  google_disabled: "Google sign-in is unavailable right now.",
  server_error: "The sign-in service is unavailable. Try again shortly.",
  login_expired: "This sign-in attempt expired. Start over.",
  not_found: "This sign-in attempt expired. Start over.",
};

const input =
  "w-full px-5 py-4 bg-white border border-gray-200 rounded-xl text-base text-gray-800 font-medium " +
  "placeholder:text-gray-400 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all";
const primary =
  "w-full py-4 bg-indigo-600 text-white font-bold text-base tracking-wider rounded-xl " +
  "hover:bg-indigo-700 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed";
const secondary =
  "w-full py-4 bg-white text-gray-800 border-2 border-gray-200 font-bold text-base tracking-wider rounded-xl " +
  "hover:border-gray-400 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed";
const link = "w-full py-2 text-sm text-gray-500 hover:text-indigo-600 tracking-wider transition-colors cursor-pointer disabled:opacity-60";

type Method = "choose" | "email" | "signup";

const isCancel = (err: unknown) =>
  err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "AbortError");

export default function Login() {
  const params = new URLSearchParams(window.location.search);
  const loginChallenge = params.get("login_challenge");
  const callbackError = params.get("error");

  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [error, setError] = useState<string | null>(
    callbackError ? (CALLBACK_ERRORS[callbackError] ?? `Sign-in failed (${callbackError}).`) : null
  );
  const [busy, setBusy] = useState(false);
  const [method, setMethod] = useState<Method>("choose");
  const [email, setEmail] = useState("");
  const [name, setName] = useState(localStorage.getItem("playerName") || "");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");

  useEffect(() => {
    document.title = "Sign in — Impostor";
    auth.config().then(setConfig).catch(() => setConfig({ enabled: false, google: false, issuer: null }));
  }, []);

  const fail = (err: unknown, fallback: string) => setError(err instanceof AuthError ? err.message : fallback);

  const go = (url: string) => window.location.assign(url);

  const signInWithPasskey = async () => {
    if (!loginChallenge) return;
    setError(null);
    setBusy(true);
    try {
      const begin = await auth.passkeyBegin(loginChallenge);
      const cred = await navigator.credentials.get({ publicKey: decodeAssertionOptions(publicKeyOf(begin.options)) });
      if (!cred) throw new Error("no credential");
      const { redirect_to } = await auth.passkeyFinish(begin.challenge_id, encodeAssertion(cred as PublicKeyCredential));
      go(redirect_to);
    } catch (err) {
      if (isCancel(err)) setError("Passkey prompt was cancelled.");
      else fail(err, "Passkey sign-in failed.");
      setBusy(false);
    }
  };

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginChallenge) return;
    setError(null);
    setBusy(true);
    try {
      const addr = email.trim();
      const { challenge_id } = method === "signup"
        ? await auth.signupPasskey(loginChallenge, addr, name.trim())
        : await auth.emailBegin(loginChallenge, addr);
      setChallengeId(challenge_id);
      setCode("");
    } catch (err) {
      fail(err, "Could not send a code.");
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challengeId) return;
    setError(null);
    setBusy(true);
    try {
      if (method === "signup") {
        const setup = await auth.signupPasskeyVerify(challengeId, code);
        const cred = await navigator.credentials.create({ publicKey: decodeCreationOptions(publicKeyOf(setup.options)) });
        if (!cred) throw new Error("no credential");
        const { redirect_to } = await auth.signupPasskeyFinish(
          setup.user_id, setup.challenge_id, deviceName(), encodeAttestation(cred as PublicKeyCredential));
        go(redirect_to);
        return;
      }
      const { redirect_to } = await auth.emailFinish(challengeId, code);
      go(redirect_to);
    } catch (err) {
      if (isCancel(err)) {
        // The code was consumed and the creation challenge is single-use: start over.
        setError("Passkey creation was cancelled. Request a new code to try again.");
        setChallengeId(null);
      } else {
        fail(err, "That code was not accepted.");
        if (err instanceof AuthError && err.code !== "code_rejected") setChallengeId(null);
      }
      setBusy(false);
    }
  };

  const back = (to: Method) => { setMethod(to); setChallengeId(null); setError(null); setCode(""); };

  let body: React.ReactNode;
  if (loginChallenge && method !== "choose" && challengeId) {
    body = (
      <form onSubmit={submitCode} className="flex flex-col gap-4">
        <p className="text-sm text-gray-500 text-center">
          We emailed a 6-digit code to <span className="text-gray-800 font-semibold">{email}</span>. It expires in 10 minutes.
          {method === "signup" && " After the code, your device will ask to create a passkey."}
        </p>
        <input
          type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6}
          value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} required autoFocus
          placeholder="000000" className={`${input} tracking-[0.4em] text-center font-bold`}
        />
        <button type="submit" disabled={busy || code.length !== 6} className={primary}>
          {busy ? (method === "signup" ? "CREATING PASSKEY…" : "CHECKING…") : method === "signup" ? "VERIFY & CREATE PASSKEY" : "VERIFY CODE"}
        </button>
        <button type="button" onClick={() => { setChallengeId(null); setError(null); }} className={link}>
          Use a different address
        </button>
      </form>
    );
  } else if (loginChallenge && method === "email") {
    body = (
      <form onSubmit={sendCode} className="flex flex-col gap-4">
        <p className="text-sm text-gray-500 text-center">No account yet? Entering the code creates one.</p>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required autoFocus
          placeholder="you@example.com" className={input} />
        <button type="submit" disabled={busy} className={primary}>{busy ? "SENDING…" : "EMAIL ME A CODE"}</button>
        <button type="button" onClick={() => back("choose")} className={link}>Back</button>
      </form>
    );
  } else if (loginChallenge && method === "signup") {
    body = (
      <form onSubmit={sendCode} className="flex flex-col gap-4">
        <p className="text-sm text-gray-500 text-center">
          We verify your email with a code, then this device creates its passkey. Also works to add this device to an existing passkey account.
        </p>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname" required autoFocus
          maxLength={20} placeholder="Display name" className={input} />
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required
          placeholder="you@example.com" className={input} />
        <button type="submit" disabled={busy || !name.trim()} className={primary}>{busy ? "SENDING…" : "EMAIL ME A CODE"}</button>
        <button type="button" onClick={() => back("choose")} className={link}>Back</button>
      </form>
    );
  } else if (loginChallenge) {
    body = (
      <div className="flex flex-col gap-3">
        <button type="button" onClick={() => back("email")} disabled={busy} className={primary}>EMAIL ME A CODE</button>
        <button type="button" onClick={signInWithPasskey} disabled={busy} className={secondary}>
          {busy ? "WAITING FOR PASSKEY…" : "USE A PASSKEY"}
        </button>
        {config?.google && config.issuer && (
          <a
            href={`${config.issuer}/v1/login/google/start?${new URLSearchParams({ login_challenge: loginChallenge })}`}
            className={`${secondary} text-center block`}
          >
            SIGN IN WITH GOOGLE
          </a>
        )}
        <button type="button" onClick={() => back("signup")} disabled={busy} className={`${link} pt-3`}>
          Create an account with a passkey
        </button>
      </div>
    );
  } else if (config === null) {
    body = <div className="h-14 rounded-xl bg-gray-200 animate-pulse" aria-hidden />;
  } else if (!config.enabled) {
    body = <p className="text-sm text-gray-500 text-center">Accounts are not available right now. You can still play — just type a name.</p>;
  } else {
    body = (
      <div className="flex flex-col gap-3">
        <button type="button" onClick={() => { setBusy(true); go(auth.startUrl); }} disabled={busy} className={primary}>
          {busy ? "REDIRECTING…" : "SIGN IN / CREATE ACCOUNT"}
        </button>
        <p className="text-xs text-gray-400 tracking-widest text-center">EMAIL CODE · PASSKEY · GOOGLE</p>
      </div>
    );
  }

  return (
    <div
      className="min-h-dvh flex flex-col items-center px-4"
      style={{ paddingTop: "max(1rem, env(safe-area-inset-top))", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="w-full max-w-md flex flex-col items-center gap-10 pt-28 animate-fade-in">
        <div className="text-center">
          <h1 className="text-4xl font-extrabold tracking-wide text-gray-800">IMPOSTOR</h1>
          <p className="text-base text-gray-500 tracking-wider mt-2">ACCOUNT</p>
        </div>

        <div className="w-full flex flex-col gap-4">
          {error && (
            <div className="w-full text-center text-base text-red-600 font-medium animate-fade-in" role="alert">{error}</div>
          )}
          {body}
        </div>

        <a href="/" className="text-sm text-gray-400 hover:text-gray-600 tracking-wider transition-colors">
          ← Back to the game
        </a>
      </div>
    </div>
  );
}
