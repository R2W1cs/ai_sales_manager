#!/usr/bin/env bash
# Deploy the production Compose stack on a VPS.
# Prerequisites: Docker + Compose plugin, DNS for APP_DOMAIN / API_DOMAIN, .env.production filled.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env.production ]]; then
  echo "Missing .env.production — copy .env.production.example and fill secrets."
  exit 1
fi

# shellcheck disable=SC1091
set -a
source .env.production
set +a

: "${APP_DOMAIN:?APP_DOMAIN required}"
: "${API_DOMAIN:?API_DOMAIN required}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD required}"
: "${BETTER_AUTH_SECRET:?BETTER_AUTH_SECRET required}"

echo "→ Building and starting stack for ${APP_DOMAIN} / ${API_DOMAIN}"
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build

echo "→ Waiting for API /ready"
for i in $(seq 1 60); do
  if docker compose -f docker-compose.prod.yml --env-file .env.production exec -T api \
    node -e "fetch('http://127.0.0.1:4000/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    echo "API is ready"
    break
  fi
  if [[ "$i" -eq 60 ]]; then
    echo "API did not become ready in time"
    docker compose -f docker-compose.prod.yml --env-file .env.production logs --tail=80 api
    exit 1
  fi
  sleep 3
done

echo "→ Running migrations / schema push"
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T api \
  sh -c 'pnpm db:push || npx prisma db push --schema=./prisma/schema.prisma || true'

echo "Done."
echo "App:  https://${APP_DOMAIN}"
echo "API:  https://${API_DOMAIN}/ready"
echo "Next: connect Meta webhooks to ${WEBHOOK_PUBLIC_URL:-https://${API_DOMAIN}/api/v1/webhooks/meta}"
