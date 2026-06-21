# VoxM Pro Rollout And Acceptance

## Rollout Phases

### Phase 1: Cloud Foundation

- Create private `voxm-cloud` repo.
- Create Docker Compose local dev.
- Add NestJS API.
- Add Next.js web.
- Add worker process.
- Add Prisma schema and migrations.
- Add Postgres + pgvector.
- Add Redis/BullMQ.
- Add Lightsail deployment docs.
- Add backup/restore script.

### Phase 2: Processing Included

- Add Pro auth.
- Add extension login/session.
- Add automatic upload.
- Add upload manifest and retry.
- Add worker transcription.
- Add worker summary generation.
- Add cloud recording detail page.
- Add retention cleanup for audio chunks.

### Phase 3: Collections And Sharing

- Add collections.
- Add meeting-to-collection membership.
- Add share links.
- Add password gate.
- Add download permissions.
- Add audit events.
- Add session invalidation.

### Phase 4: Search And Ask

- Add embedding provider.
- Add pgvector search.
- Add full-text search.
- Add Ask over meeting.
- Add Ask over collection.
- Add Ask over shared_with_me.
- Add citations and quota accounting.

### Phase 5: Hardening

- Add Lemon Squeezy reconciliation.
- Add restore drill.
- Add CloudWatch or equivalent monitoring.
- Add abuse/rate-limit tuning.
- Add provider fallback.
- Add migration plan to ECS/RDS/S3/SQS.

## Unit Tests

Required:

- Prisma model constraints.
- AuthorizationService object-level access.
- Upload manifest state transitions.
- Share password hashing and unlock.
- Share rate limit.
- Lemon webhook signature and idempotency.
- Usage event accounting.
- LLM prompt construction.
- LLM output validation.
- Embedding chunking.
- Retention cleanup.

## Integration Tests

Required:

- Pro login from extension.
- Auto-upload after recording.
- Failed upload retries 3 times.
- Retry upload resumes failed upload.
- Worker transcribes, summarizes, and indexes recording.
- Collection creation and sharing.
- Password-protected share unlock.
- Share revoke invalidates sessions.
- Shared download respects permissions.
- Ask over shared collection returns cited answer.
- Ask consumes viewer quota.
- Billing webhook updates entitlement.
- Billing reconciler fixes missed webhook.
- Cancelled subscription blocks new Pro processing.

## E2E Acceptance Scenarios

- Local Free still works with no account.
- Pro user records, upload completes, cloud page opens.
- Pro user shares a collection with password.
- Recipient unlocks, downloads files, and asks questions.
- Recipient searches shared meetings.
- Groq outage triggers retry/fallback behavior.
- Partial transcript shows warning in summary and Ask.
- Cancelled user can read for 7 days.
- Cancelled user data is deleted after 30 days if not reactivated.

## Operational Acceptance

Before paid beta:

- daily backups running;
- restore tested once;
- billing webhook idempotency tested;
- upload failure tested;
- share password brute-force protection tested;
- object-level authorization tests passing;
- provider keys only in server environment;
- no raw transcript logging;
- delete recording removes storage assets;
- quota exceeded blocks new AI work without blocking read access.

