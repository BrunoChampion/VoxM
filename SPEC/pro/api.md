# VoxM Pro API Spec

## API Principles

- Version all endpoints under `/api/v1`.
- OpenAPI is required before implementation changes.
- All endpoints return typed errors.
- All tenant-owned resource endpoints must authorize with `AuthorizationService`.
- Public share endpoints must never expose debug JSON, provider raw responses, internal logs, or storage paths.

## Standard Errors

- `UNAUTHENTICATED`
- `FORBIDDEN`
- `NOT_FOUND`
- `QUOTA_EXCEEDED`
- `UPLOAD_FAILED`
- `PROCESSING_FAILED`
- `SHARE_PASSWORD_REQUIRED`
- `SHARE_PASSWORD_INVALID`
- `RATE_LIMITED`
- `BILLING_INACTIVE`
- `VALIDATION_FAILED`

## Auth

```txt
POST /api/v1/auth/login
POST /api/v1/auth/logout
POST /api/v1/auth/refresh
POST /api/v1/auth/extension/exchange
GET  /api/v1/auth/session
```

The extension stores only Pro session tokens. Provider API keys remain server-side in Pro mode.

## Recordings

```txt
POST   /api/v1/recordings
GET    /api/v1/recordings
GET    /api/v1/recordings/:id
DELETE /api/v1/recordings/:id
POST   /api/v1/recordings/:id/retry
POST   /api/v1/recordings/:id/delete-video
```

`POST /recordings` creates cloud metadata before upload.

## Uploads

```txt
POST /api/v1/recordings/:id/upload-urls
POST /api/v1/recordings/:id/complete-upload
POST /api/v1/recordings/:id/retry-upload
```

Upload requirements:

- Signed upload URLs.
- Checksum per required asset.
- 3 automatic client retries.
- `complete-upload` fails if required assets are missing.

## Collections

```txt
POST   /api/v1/collections
GET    /api/v1/collections
GET    /api/v1/collections/:id
PATCH  /api/v1/collections/:id
DELETE /api/v1/collections/:id
POST   /api/v1/collections/:id/recordings
DELETE /api/v1/collections/:id/recordings/:recordingId
```

Collections are the MVP mechanism for sharing multiple meetings safely.

## Share Links

```txt
POST   /api/v1/share-links
GET    /api/v1/share-links
PATCH  /api/v1/share-links/:id
POST   /api/v1/share-links/:id/revoke
POST   /api/v1/share-links/:id/invalidate-sessions
DELETE /api/v1/share-links/:id
```

Share scopes:

- `meeting`
- `collection`

## Public Share

```txt
GET  /api/v1/share/:token
POST /api/v1/share/:token/unlock
POST /api/v1/share/:token/ask
GET  /api/v1/share/:token/download/:assetId
```

Rules:

- If password is required, `GET /share/:token` returns locked metadata only.
- `unlock` sets a short-lived secure cookie.
- Download requires share permissions and active session.
- Ask uses only the shared scope.

## Search And Ask

```txt
POST /api/v1/search
POST /api/v1/ask
GET  /api/v1/chat-threads/:id
POST /api/v1/chat-threads/:id/messages
```

Search scopes:

- `my_workspace`
- `collection`
- `shared_with_me`

Ask requirements:

- return citations;
- include meeting/timestamp references when available;
- charge usage to the asking user when authenticated;
- anonymous share Ask has a very small limit or requires sign-in.

## Billing

```txt
POST /api/v1/billing/checkout
POST /api/v1/billing/portal
POST /api/v1/billing/sync
GET  /api/v1/billing/status
POST /api/v1/billing/webhooks/lemon-squeezy
```

Webhook handler must verify signature over raw request body and store the webhook event before processing.

