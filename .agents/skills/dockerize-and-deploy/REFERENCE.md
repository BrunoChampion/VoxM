# Dockerize & Deploy Reference

## Multi-Stage Dockerfile Patterns

### Node.js (npm / pnpm)
```dockerfile
FROM node:20.11-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --frozen-lockfile
COPY . .
RUN npm run build

FROM node:20.11-alpine AS runtime
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json .
USER app
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### Python
```dockerfile
FROM python:3.12-slim AS builder
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM python:3.12-slim AS runtime
WORKDIR /app
RUN useradd -r -u 1001 app
COPY --from=builder /install /usr/local
COPY . .
USER app
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Go
```dockerfile
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o server ./cmd/server

FROM scratch AS runtime
COPY --from=builder /app/server /server
EXPOSE 8080
CMD ["/server"]
```

---

## .dockerignore Template
```
node_modules
.git
.env
.env.*
!.env.example
dist
build
*.log
.DS_Store
coverage
```

---

## docker-compose.prod.yml Patterns

### Full production stack
```yaml
services:
  app:
    image: ${IMAGE_NAME}:${IMAGE_TAG}
    restart: unless-stopped
    env_file: .env.prod
    ports:
      - "3000:3000"
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
    mem_limit: 512m
    cpus: "0.5"

  db:
    image: postgres:16-alpine
    restart: unless-stopped
    env_file: .env.prod
    volumes:
      - db_data:/var/lib/postgresql/data
      - ./scripts/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3

volumes:
  db_data:
    driver: local
  redis_data:
    driver: local
```

---

## Volume Configuration Rules

| Data type | Volume type | Why |
|---|---|---|
| Database files | Named volume | Survives container recreation, managed by Docker |
| Uploaded files / assets | Named volume or S3 | Never bind mount in prod |
| Config / secrets | `configs:` or secrets mount | Read-only, never baked into image |
| Source code (dev only) | Bind mount | Hot reload; NEVER in prod |
| Logs | Named volume or stdout | Prefer stdout → log aggregator |

**Rule**: If data must survive `docker compose down`, it goes in a named volume.

---

## Healthcheck Templates by Service

```yaml
# HTTP API
healthcheck:
  test: ["CMD", "wget", "-qO-", "http://localhost:PORT/health"]
  interval: 30s
  timeout: 5s
  retries: 3
  start_period: 15s

# PostgreSQL
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U $POSTGRES_USER"]
  interval: 10s
  timeout: 5s
  retries: 5

# MySQL
healthcheck:
  test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
  interval: 10s
  timeout: 5s
  retries: 5

# Redis
healthcheck:
  test: ["CMD", "redis-cli", "ping"]
  interval: 10s
  timeout: 3s
  retries: 3
```

---

## Rolling Deploy Strategy (no Swarm/K8s)

```bash
# 1. Build new image
docker build -t app:$NEW_TAG .

# 2. Scale up new containers alongside old
docker compose -f docker-compose.prod.yml up -d --scale app=2 --no-recreate

# 3. Wait for new containers to be healthy
sleep 15

# 4. Remove old containers
docker compose -f docker-compose.prod.yml up -d --scale app=1

# 5. Prune dangling images
docker image prune -f
```

For proper zero-downtime rolling deploys: use Docker Swarm (`docker stack deploy`) or Kubernetes.

---

## Secrets Management

**Never** use `environment:` for secrets in prod compose. Prefer:

```yaml
# Option 1: env_file (file kept outside git)
env_file: .env.prod

# Option 2: Docker secrets (Swarm)
secrets:
  db_password:
    external: true

# Option 3: Mounted secrets file (read-only)
volumes:
  - /run/secrets/db_password:/run/secrets/db_password:ro
```

---

## Resource Limits Reference

| Service type | mem_limit | cpus |
|---|---|---|
| Node.js API | 256m–512m | 0.25–0.5 |
| Python API | 256m–512m | 0.25–0.5 |
| PostgreSQL | 256m–1g | 0.5–1.0 |
| Redis | 64m–256m | 0.1–0.25 |
| Background worker | 128m–256m | 0.1–0.25 |

Tune based on actual profiling — these are starting points only.
