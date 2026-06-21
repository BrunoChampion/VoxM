# VoxM Pro Data Model

## Principles

- Postgres is the source of truth for Pro.
- Every tenant-owned row must include `workspaceId`.
- Object storage stores large blobs and generated artifacts.
- Postgres stores metadata, state, JSON structures, IDs, permissions, usage, and search vectors.
- Deletions must clean database rows, object storage, embeddings, share links, jobs, and access sessions.

## Core Entities

### User

Represents a signed-in Pro user.

Key fields:

- `id`
- `email`
- `displayName`
- `createdAt`
- `updatedAt`

### Workspace

Container for ownership, billing, meetings, collections, and members.

Key fields:

- `id`
- `name`
- `ownerUserId`
- `createdAt`
- `updatedAt`

### WorkspaceMember

Membership and role.

Roles:

- `owner`
- `admin`
- `member`
- `viewer`

### Subscription

Internal subscription state synced from Lemon Squeezy.

States:

- `free`
- `trialing`
- `active`
- `past_due`
- `cancelled`
- `expired`

### Entitlement

Runtime permissions derived from subscription state.

Examples:

- `proProcessingEnabled`
- `cloudStorageEnabled`
- `askEnabled`
- `shareEnabled`
- `monthlyCreditLimit`
- `videoRetentionDays`

### Recording

Cloud meeting record.

Key fields:

- `id`
- `workspaceId`
- `ownerUserId`
- `sourceTitle`
- `sourceUrlHash`
- `durationMs`
- `language`
- `status`
- `createdAt`
- `uploadedAt`
- `processedAt`
- `deletedAt`

### RecordingAsset

Object storage asset.

Types:

- `video_webm`
- `audio_chunk`
- `transcript_md`
- `transcript_json`
- `summary_md`
- `summary_json`

Key fields:

- `recordingId`
- `storagePath`
- `mimeType`
- `sizeBytes`
- `checksumSha256`
- `retentionUntil`

### UploadManifest

Tracks required and uploaded assets.

Key fields:

- `recordingId`
- `requiredAssets`
- `uploadedAssets`
- `attemptCount`
- `status`
- `lastErrorCode`

### AudioChunk

Tracks audio chunks and transcription status.

Key fields:

- `recordingId`
- `index`
- `offsetMs`
- `durationMs`
- `storagePath`
- `transcriptionStatus`
- `provider`
- `attemptCount`
- `errorCode`

### TranscriptSegment

Searchable transcript segment.

Key fields:

- `recordingId`
- `startMs`
- `endMs`
- `text`
- `chunkIndex`
- `speakerLabel` optional for future diarization

### MeetingSummary

Structured and markdown meeting summary.

Key fields:

- `recordingId`
- `schemaVersion`
- `modelProvider`
- `modelName`
- `summaryJson`
- `summaryMarkdown`
- `generatedAt`

### Collection

Named group of recordings for sharing and Ask.

Key fields:

- `id`
- `workspaceId`
- `name`
- `description`
- `createdByUserId`

### CollectionRecording

Join table for collections and recordings.

### EmbeddingChunk

Semantic search index.

Key fields:

- `workspaceId`
- `recordingId`
- `collectionId` optional
- `sourceType`
- `sourceText`
- `sourceStartMs`
- `sourceEndMs`
- `embedding`
- `embeddingProvider`
- `embeddingModel`

### ShareLink

Public share scope.

Scope types:

- `meeting`
- `collection`

Key fields:

- `tokenHash`
- `scopeType`
- `scopeId`
- `createdByUserId`
- `passwordHash`
- `expiresAt`
- `revokedAt`
- `allowDownloads`

### ShareSession

Short-lived authorized public viewer session.

Key fields:

- `shareLinkId`
- `sessionHash`
- `expiresAt`
- `revokedAt`

### ChatThread

Conversation over a meeting, collection, or shared scope.

Scopes:

- `meeting`
- `collection`
- `shared_with_me`

### ChatMessage

Stores user question, assistant answer, citations, model, and usage.

### ProcessingJob

Idempotent async job tracking.

Job types:

- `transcribe_recording`
- `summarize_recording`
- `embed_recording`
- `cleanup_audio_chunks`
- `delete_recording_assets`
- `billing_reconcile`

### UsageEvent

Granular usage accounting.

Kinds:

- `audio_seconds_uploaded`
- `audio_seconds_transcribed`
- `summary_input_tokens`
- `summary_output_tokens`
- `embedding_tokens`
- `ask_input_tokens`
- `ask_output_tokens`
- `storage_bytes_day`
- `video_stream_bytes`

### BillingWebhookEvent

Raw billing webhook receipt for idempotency and reconciliation.

### AuditEvent

Security and user-action log.

Events:

- `recording_uploaded`
- `recording_deleted`
- `share_created`
- `share_unlocked`
- `share_failed_unlock`
- `share_download`
- `share_revoked`
- `ask_submitted`
- `billing_status_changed`

## Retention Defaults

- Raw audio chunks: 7 days after successful processing.
- Cloud video: 90 days for Pro individual.
- Transcript, summary, embeddings: while account is active.
- Cancelled subscription: read-only for 7 days.
- Cancelled subscription deletion: schedule cloud data deletion 30 days after cancellation if not reactivated.
- Manual video deletion: allowed while preserving transcript/summary.

