# Vision

**One platform, retire the rest.** THE single home for all of Nathan's party games. Finishing the Secret Hitler merge and killing the standalone secreth/codenames deployments defines success; new modes wait until consolidation is done. A better platform name than "Impostor" is wanted (rename pending).

# Conventions

- Mobile-first party game platform: WS room/mode architecture (Impostor, Spyfall, Mafia, Codenames, Secret Hitler, etc.), esbuild via `node build.mjs`, strict TS — run `npm run typecheck` before marking work done.
- Deploy = push to `main` → self-hosted runner, zero-downtime docker-scale deploy (Docker Compose, shared Postgres, Cloudflare tunnel).
- AI features (word/hint generation, ghost players) call Claude with static fallbacks — `ANTHROPIC_API_KEY` must be in the container env.
- Mobile UX is a first-class constraint: safe areas, PWA, wake lock, QR join.
- This is the consolidation target for Nathan's game sites — add modes here, never to the standalone apps.
