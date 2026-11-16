# Production deploy (VPS)

1. Point DNS `APP_DOMAIN` and `API_DOMAIN` at the VPS.
2. `cp .env.production.example .env.production` and fill secrets.
3. Install Docker Engine + Compose plugin.
4. `./scripts/deploy-vps.sh`

Caddy terminates TLS automatically. API health: `https://$API_DOMAIN/ready`.

Meta webhook: `https://$API_DOMAIN/api/v1/webhooks/meta` — see `docs/30_execution/META_LIVE_LOOP.md`.
