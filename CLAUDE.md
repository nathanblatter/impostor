# Vision

**One platform, retire the rest.** THE single home for all of Nathan's party games. Finishing the Secret Hitler merge and killing the standalone secreth/codenames deployments defines success; new modes wait until consolidation is done. A better platform name than "Impostor" is wanted (rename pending).

# Conventions

- Mobile-first party game platform: WS room/mode architecture (Impostor, Spyfall, Mafia, Codenames, Secret Hitler, etc.), esbuild via `node build.mjs`, strict TS — run `npm run typecheck` before marking work done.
- Deploy = push to `main` → self-hosted runner, zero-downtime docker-scale deploy (Docker Compose, shared Postgres, Cloudflare tunnel).
- AI features (word/hint generation, ghost players) call Claude with static fallbacks — `ANTHROPIC_API_KEY` must be in the container env.
- Mobile UX is a first-class constraint: safe areas, PWA, wake lock, QR join.
- This is the consolidation target for Nathan's game sites — add modes here, never to the standalone apps.

# Accounts (Squawk)

Optional player accounts sign in through **Squawk**, Nathan's auth service (`SQUAWK_ISSUER`,
https://squawk.nathanblatter.com). Playing anonymously (just type a name) still works; an account is
small in scope. The pool is **open sign-up by design** (Nathan's decision 2026-10-16: the games are public,
and this is the testbed for Squawk's open sign-up) — anyone can create an account with an emailed 6-digit
code, a passkey, or Sign in with Google.

- **Env (all in the compose `environment` block, values in `~/deploy/impostor/.env`):** `SQUAWK_ISSUER`,
  `SQUAWK_SERVICE_ID`, `SQUAWK_CREDENTIAL` (service credential for client_credentials), `SQUAWK_CLIENT_ID`
  (public PKCE client, redirect_uri `https://impostor.nathanblatter.com/api/auth/callback`),
  `SQUAWK_RESOURCE`, `SQUAWK_SITE_URL`, `SESSION_SECRET` (32-byte hex signing the `imp_session` cookie).
  **Empty `SQUAWK_ISSUER` = accounts off**: `/api/auth/config` reports `enabled:false`, the rest 404.
- **Flow (`server/auth.ts` + `server/squawk.ts`, page `client/components/Login.tsx`):** `GET /api/auth/start`
  stashes a PKCE verifier by `state` (in-memory, 5 min) and 302s to Squawk `/oauth/authorize` (`scope=play`).
  Squawk sends the browser to `/login?login_challenge=…`; the page offers an emailed code
  (`/api/auth/email/*`), a passkey (`/api/auth/passkey/*`), Google (plain link to Squawk
  `/v1/login/google/start`), or **create an account with a passkey** (`/api/auth/signup/passkey` → Squawk
  `POST /v1/users` then the passkey *activation* flow: mailed code verifies the email and returns creation
  options; `…/signup/passkey/finish` stores the credential and its `redirect_to` completes the parked
  sign-in — the same path adds a new device to an existing passkey account). Every path ends at
  `GET /api/auth/callback`: exchange at `/oauth/token`, verify the ES256 user token against Squawk's JWKS
  (`iss`, `aud == SQUAWK_SERVICE_ID`, `sub` `usr:…` + `email_verified`, or `sub owner`), set the signed
  `imp_session` cookie (HMAC-SHA256, 30 days, no DB table), land on `/`.
- **What an account does today:** Home shows "Signed in as …" and prefills the player name from the
  account. Nothing else in gameplay reads the session yet.
- **Manage users** in the Squawk console (service "Impostor"): list/disable/delete users, passkeys, audit.
- **Verify:** `npm run typecheck && npm test` (`server/squawk.test.ts` mints ES256 tokens in-test and mocks
  `fetch`). Prod: `curl -s https://impostor.nathanblatter.com/api/auth/config` → `enabled:true`.
