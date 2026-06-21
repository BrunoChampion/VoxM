# VoxM Pro Architecture

## Product Split

VoxM has two separate product surfaces:

- **Local Free**: Chrome extension, BYOK, local IndexedDB, manual or Chrome Web Store install, no account required.
- **Pro Cloud**: paid SaaS layer, server-side provider keys, cloud history, collections, sharing, and AI chat.

The local extension must never require Pro. Pro mode is additive.

## Repository Strategy

Use two repositories:

```txt
voxm
  public/source-available
  Chrome MV3 extension
  local BYOK flow
  public docs/specs

voxm-cloud
  private
  NestJS API
  Next.js web app
  worker process
  Prisma schema and migrations
  Lemon Squeezy integration
  cloud prompts and provider orchestration
  deployment/infrastructure files
```

Rationale:

- The public repo drives adoption and trust.
- The private repo protects SaaS operations: billing, abuse prevention, provider keys, infrastructure, and premium workflow.
- The public extension can still call Pro APIs when the user signs in.

## MVP Infrastructure

Use AWS Lightsail for MVP:

- One Lightsail VPS running Docker Compose.
- Lightsail Object Storage for media and artifacts.
- Caddy or Nginx for TLS and reverse proxy.
- Daily database backups to object storage.

Containers:

```txt
web       Next.js dashboard and share pages
api       NestJS REST API
worker    NestJS standalone worker
postgres  Postgres with pgvector
redis     BullMQ queues, rate limits, short-lived cache
```

MVP target idle cost: USD 15-20/month. This means accepting no high availability at MVP.

## Future Infrastructure Target

When usage or revenue justifies it, migrate to:

- ECS Fargate for `api`, `web`, and `worker`.
- RDS Postgres.
- S3.
- SQS.
- Secrets Manager.
- CloudFront.
- CloudWatch alarms.

The MVP code must avoid Lightsail-specific assumptions so this migration is mechanical.

## Cloud Data Flow

1. User records through the Chrome extension.
2. If no Pro session exists, recording stays local.
3. If Pro mode is active, recording uploads automatically after stop.
4. Extension creates a cloud recording through API.
5. API returns an upload manifest.
6. Extension uploads WebM video, audio chunks, and metadata to object storage.
7. Extension calls upload complete.
8. API enqueues processing jobs.
9. Worker transcribes with Groq.
10. Worker summarizes with Groq `llama-3.3-70b-versatile`.
11. Worker embeds transcript/summary chunks with Voyage AI.
12. Web dashboard exposes video, transcript, summary, collection membership, share, search, and Ask.

## Processing States

Cloud recording states:

- `local_recorded`
- `uploading`
- `upload_failed`
- `uploaded`
- `transcribing`
- `summarizing`
- `indexing`
- `ready`
- `partial`
- `failed`
- `deleted`

Upload retry:

- 3 automatic retries.
- Failed upload shows a visible `Retry Upload` action.
- Upload complete is not accepted until required assets exist.

## Provider Strategy

Use provider interfaces:

```txt
TranscriptionProvider
SummaryProvider
EmbeddingProvider
BillingProvider
StorageProvider
```

Defaults:

- Transcription: Groq Whisper.
- Summary: Groq `llama-3.3-70b-versatile`.
- Embeddings: Voyage AI `voyage-4-lite`.
- Billing: Lemon Squeezy.
- Storage: Lightsail Object Storage compatible with S3 APIs.

Fallback:

- If Groq STT fails with timeout/5xx/provider outage, use a configured fallback STT provider.
- Do not fallback automatically on 400 invalid media errors.
- Store provider used per chunk.

