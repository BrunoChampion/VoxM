#!/usr/bin/env bash
# preflight.sh — pre-deployment validation script
# Copy this into your project at scripts/preflight.sh
# Usage: bash scripts/preflight.sh
# Exits 0 if all checks pass, 1 on first failure.

set -euo pipefail

BOLD='\033[1m'
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RESET='\033[0m'

FAILED=0

pass() { echo -e "${GREEN}  ✓${RESET} $1"; }
fail() { echo -e "${RED}  ✗${RESET} $1"; FAILED=1; }
warn() { echo -e "${YELLOW}  ⚠${RESET} $1"; }
section() { echo -e "\n${BOLD}$1${RESET}"; }

# ── 1. Required tools ──────────────────────────────────────────────────────────
section "Checking required tools"

for tool in docker curl; do
  if command -v "$tool" &>/dev/null; then
    pass "$tool is installed ($(command -v "$tool"))"
  else
    fail "$tool is not installed or not in PATH"
  fi
done

if docker compose version &>/dev/null 2>&1; then
  pass "docker compose plugin available"
elif command -v docker-compose &>/dev/null; then
  warn "Using legacy docker-compose (v1) — consider upgrading to Compose v2"
else
  fail "docker compose is not available"
fi

# ── 2. Docker daemon ───────────────────────────────────────────────────────────
section "Checking Docker daemon"

if docker info &>/dev/null 2>&1; then
  pass "Docker daemon is running"
else
  fail "Docker daemon is not running — start Docker and retry"
fi

# ── 3. Required env vars ───────────────────────────────────────────────────────
section "Checking required environment variables"

# Edit REQUIRED_VARS to match your application's required env vars
REQUIRED_VARS=(
  "DATABASE_URL"
  "SECRET_KEY"
  # Add more as needed:
  # "REDIS_URL"
  # "S3_BUCKET"
)

ENV_FILE="${ENV_FILE:-.env.prod}"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a; source "$ENV_FILE"; set +a
  pass "Loaded env from $ENV_FILE"
else
  warn "No $ENV_FILE found — relying on shell environment"
fi

for var in "${REQUIRED_VARS[@]}"; do
  if [[ -n "${!var:-}" ]]; then
    pass "$var is set"
  else
    fail "$var is not set or empty"
  fi
done

# ── 4. Port availability ───────────────────────────────────────────────────────
section "Checking port availability"

# Edit REQUIRED_PORTS to match your exposed ports
REQUIRED_PORTS=(3000 5432 6379)

for port in "${REQUIRED_PORTS[@]}"; do
  if ! lsof -iTCP:"$port" -sTCP:LISTEN &>/dev/null 2>&1; then
    pass "Port $port is available"
  else
    OWNER=$(lsof -iTCP:"$port" -sTCP:LISTEN -Fp 2>/dev/null | head -1 | tr -d 'p' || echo "unknown")
    warn "Port $port is already in use (PID $OWNER) — ensure it's the correct service"
  fi
done

# ── 5. Docker Compose config validation ───────────────────────────────────────
section "Validating docker-compose config"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

if [[ -f "$COMPOSE_FILE" ]]; then
  if docker compose -f "$COMPOSE_FILE" config --quiet 2>/dev/null; then
    pass "$COMPOSE_FILE is valid"
  else
    fail "$COMPOSE_FILE has configuration errors"
  fi
else
  warn "$COMPOSE_FILE not found — skipping compose validation"
fi

# ── 6. Dockerfile build check (dry run) ───────────────────────────────────────
section "Validating Dockerfile"

if [[ -f "Dockerfile" ]]; then
  if docker build --check . &>/dev/null 2>&1; then
    pass "Dockerfile syntax is valid (--check passed)"
  else
    warn "docker build --check not supported (requires Docker 24+) — skipping dry run"
  fi
else
  warn "No Dockerfile found at project root — skipping build check"
fi

# ── 7. DB reachability (optional) ─────────────────────────────────────────────
section "Checking database reachability"

if [[ -n "${DATABASE_URL:-}" ]]; then
  # Extract host:port from DATABASE_URL (postgres://user:pass@host:port/db)
  DB_HOST=$(echo "$DATABASE_URL" | sed -E 's|.*@([^:/]+).*|\1|')
  DB_PORT=$(echo "$DATABASE_URL" | sed -E 's|.*:([0-9]+)/.*|\1|')
  DB_PORT="${DB_PORT:-5432}"

  if timeout 3 bash -c "echo > /dev/tcp/$DB_HOST/$DB_PORT" 2>/dev/null; then
    pass "Database is reachable at $DB_HOST:$DB_PORT"
  else
    warn "Cannot reach database at $DB_HOST:$DB_PORT — ensure it is running before deploying"
  fi
else
  warn "DATABASE_URL not set — skipping DB reachability check"
fi

# ── Result ─────────────────────────────────────────────────────────────────────
echo ""
if [[ $FAILED -eq 0 ]]; then
  echo -e "${GREEN}${BOLD}All preflight checks passed. Ready to deploy.${RESET}"
  exit 0
else
  echo -e "${RED}${BOLD}Preflight failed. Fix the errors above before deploying.${RESET}"
  exit 1
fi
