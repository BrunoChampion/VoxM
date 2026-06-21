#!/usr/bin/env bash
# deploy.sh — production deployment script
# Copy this into your project at scripts/deploy.sh
# Usage: IMAGE_TAG=v1.2.3 bash scripts/deploy.sh
# Requires: preflight.sh in the same directory

set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
RESET='\033[0m'

log()     { echo -e "${CYAN}[deploy]${RESET} $1"; }
success() { echo -e "${GREEN}[deploy]${RESET} $1"; }
error()   { echo -e "${RED}[deploy] ERROR:${RESET} $1" >&2; exit 1; }

# ── Config ─────────────────────────────────────────────────────────────────────
IMAGE_NAME="${IMAGE_NAME:-app}"
IMAGE_TAG="${IMAGE_TAG:-$(git rev-parse --short HEAD 2>/dev/null || echo 'latest')}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.prod}"
MIGRATIONS_CMD="${MIGRATIONS_CMD:-}"   # e.g. "docker compose -f $COMPOSE_FILE run --rm app npx prisma migrate deploy"
HEALTH_URL="${HEALTH_URL:-http://localhost:3000/health}"
HEALTH_RETRIES=10
HEALTH_INTERVAL=5

echo -e "\n${BOLD}Deploying ${IMAGE_NAME}:${IMAGE_TAG}${RESET}\n"

# ── Step 1: Pre-flight ─────────────────────────────────────────────────────────
log "Running pre-flight checks..."
COMPOSE_FILE="$COMPOSE_FILE" ENV_FILE="$ENV_FILE" bash "$(dirname "$0")/preflight.sh" \
  || error "Pre-flight failed. Aborting deployment."
success "Pre-flight passed."

# ── Step 2: Build image ────────────────────────────────────────────────────────
log "Building image ${IMAGE_NAME}:${IMAGE_TAG}..."
docker build \
  --tag "${IMAGE_NAME}:${IMAGE_TAG}" \
  --tag "${IMAGE_NAME}:latest" \
  --label "deploy.timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --label "deploy.git-sha=$(git rev-parse HEAD 2>/dev/null || echo 'unknown')" \
  .
success "Image built."

# ── Step 3: Run migrations ─────────────────────────────────────────────────────
if [[ -n "$MIGRATIONS_CMD" ]]; then
  log "Running database migrations..."
  eval "$MIGRATIONS_CMD" || error "Migrations failed. Aborting."
  success "Migrations complete."
else
  log "No MIGRATIONS_CMD set — skipping migrations."
fi

# ── Step 4: Pull updated service images ───────────────────────────────────────
log "Pulling latest service images (db, cache, etc.)..."
docker compose -f "$COMPOSE_FILE" pull --ignore-pull-failures || true

# ── Step 5: Rolling restart ────────────────────────────────────────────────────
log "Starting updated containers..."
IMAGE_NAME="$IMAGE_NAME" IMAGE_TAG="$IMAGE_TAG" \
  docker compose -f "$COMPOSE_FILE" up -d --remove-orphans
success "Containers started."

# ── Step 6: Health check ───────────────────────────────────────────────────────
log "Waiting for application to become healthy at ${HEALTH_URL}..."
for i in $(seq 1 $HEALTH_RETRIES); do
  if curl -sf "$HEALTH_URL" &>/dev/null; then
    success "Application is healthy."
    break
  fi
  if [[ $i -eq $HEALTH_RETRIES ]]; then
    error "Application did not become healthy after $((HEALTH_RETRIES * HEALTH_INTERVAL))s. Check logs: docker compose -f $COMPOSE_FILE logs app"
  fi
  log "  Attempt $i/$HEALTH_RETRIES — retrying in ${HEALTH_INTERVAL}s..."
  sleep $HEALTH_INTERVAL
done

# ── Step 7: Prune old images ───────────────────────────────────────────────────
log "Pruning dangling images..."
docker image prune -f --filter "label=deploy.git-sha" &>/dev/null || true

# ── Done ───────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}Deployment complete.${RESET}"
echo -e "  Image:    ${IMAGE_NAME}:${IMAGE_TAG}"
echo -e "  Health:   ${HEALTH_URL}"
echo -e "  Status:   docker compose -f ${COMPOSE_FILE} ps"
echo ""
docker compose -f "$COMPOSE_FILE" ps
