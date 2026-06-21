# VoxM Pro Billing And Usage

## Billing Provider

Use Lemon Squeezy through an internal `BillingProvider` interface.

Interface capabilities:

- `createCheckout`
- `createCustomerPortal`
- `verifyWebhook`
- `syncSubscription`
- `getEntitlements`

The rest of the application must depend on internal `Subscription` and `Entitlement` records, not Lemon Squeezy directly.

## Webhooks

Webhook rules:

- Verify HMAC signature using raw body.
- Store received event in `BillingWebhookEvent` before applying effects.
- Use idempotency by provider event id/hash.
- Do not rely on event ordering.
- On important events, fetch current subscription state from Lemon Squeezy and sync internal state.
- Run daily reconciliation job.
- Provide `Sync billing` action for users who paid but webhook delivery failed.

## Subscription States

Internal states:

- `free`
- `trialing`
- `active`
- `past_due`
- `cancelled`
- `expired`

Rules:

- `active` and `trialing` can start Pro processing.
- `past_due`, `cancelled`, and `expired` cannot start new Pro processing.
- Cancelled users can read existing cloud data for 7 days.
- Cloud data is scheduled for deletion 30 days after cancellation if not reactivated.

## Usage Events

Track usage, do not hardcode pricing assumptions in feature logic.

Usage kinds:

- `audio_seconds_uploaded`
- `audio_seconds_transcribed`
- `summary_input_tokens`
- `summary_output_tokens`
- `embedding_tokens`
- `ask_input_tokens`
- `ask_output_tokens`
- `storage_bytes_day`
- `video_stream_bytes`

## Cost Controls

MVP defaults:

- Monthly internal credit limit.
- Warning at 80%.
- Hard block at 100% for new processing and Ask.
- Reading existing cloud data does not consume AI credits.
- Ask usage is charged to the user asking the question.
- Anonymous share Ask is either disabled or limited to a tiny quota before sign-in.

## Quota UX

When quota is near limit:

- show warning in web dashboard;
- explain which features will stop;
- offer billing/upgrade action.

When quota is exhausted:

- block new upload processing;
- block Ask;
- keep playback, transcript, summary, downloads, and delete available.

