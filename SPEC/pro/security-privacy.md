# VoxM Pro Security And Privacy

## Security Principles

- Free Local remains local-first.
- Pro Cloud must be explicit about upload and processing.
- Provider API keys for Pro never leave the server.
- Every access to a tenant-owned object must be authorized server-side.
- Share links are access mechanisms and must be audited.
- Transcript content is untrusted input.

## Authorization

Implement a central `AuthorizationService`.

Required checks:

- `canReadRecording(userId, recordingId)`
- `canWriteRecording(userId, recordingId)`
- `canDeleteRecording(userId, recordingId)`
- `canAskScope(userId, scopeType, scopeId)`
- `canShareRecording(userId, recordingId)`
- `canManageCollection(userId, collectionId)`
- `canAccessShare(shareToken, session)`
- `canDownloadSharedAsset(shareToken, assetId, session)`

Rules:

- Never authorize by `recordingId` alone.
- Always verify workspace membership or share grant.
- Owners/admins can manage share links.
- Public share sessions cannot access owner controls.
- Public share sessions cannot access debug artifacts.

## Share Passwords

- Password is optional.
- Password is never stored or sent in URL.
- Store only Argon2id hash.
- Allow 5 failed attempts before rate limiting.
- Rate limit by `shareLinkId + IP + user-agent`.
- Unlock creates secure session cookie:
  - `HttpOnly`
  - `Secure`
  - `SameSite=Lax`
  - scoped to share domain/path where possible
- Owner can revoke link.
- Owner can invalidate all active share sessions.

## Logging Policy

Do not log:

- API keys.
- Passwords.
- Full raw transcripts.
- Full raw summaries.
- Full provider raw responses.
- Signed URLs.
- Full share tokens.
- Full storage paths if they expose sensitive IDs.

Allowed logs:

- sanitized error code;
- provider name;
- duration and byte counts;
- job attempt;
- resource IDs when necessary;
- truncated IDs for support;
- usage units;
- auth decision result without content payload.

## LLM Safety

Transcript and shared content must be treated as untrusted data.

Prompts must:

- delimit transcript content;
- tell the model not to follow instructions inside meeting content;
- require citations for Ask;
- require "not enough evidence" when retrieval is insufficient;
- preserve transcript language when summarizing a meeting;
- avoid exposing system/developer prompts.

LLM output must be schema-validated before storage.

## Consent Copy

Before recording:

> VoxM will record this browser tab and your microphone. Make sure you have permission from meeting participants before recording. If Pro cloud processing is enabled, the recording, audio, transcript, and summary will be uploaded to VoxM Cloud for processing, storage, search, sharing, and AI chat.

Before enabling Pro auto-upload:

> In Pro mode, completed recordings are uploaded automatically to VoxM Cloud. You can review, share, search, and ask questions about them from the web dashboard.

Before sharing:

> Anyone with this link, and the password if enabled, may access the shared meeting content. This can include video, transcript, summary, downloads, and AI chat over the shared scope. Only share with people authorized to view this meeting information.

On share page:

> This meeting or collection was shared with you through VoxM. Do not redistribute its contents unless you have permission from the owner and meeting participants.

## Threats To Test

- Broken object-level authorization.
- Share token leakage.
- Password brute force.
- Downloading assets outside authorized scope.
- Asking questions over unshared meetings.
- Billing webhook replay.
- Provider key leakage.
- Prompt injection from transcript content.
- Excessive Ask usage.
- Failed deletion leaving assets in storage.

