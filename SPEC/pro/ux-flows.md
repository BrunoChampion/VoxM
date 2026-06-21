# VoxM Pro UX Flows

## Extension Modes

Modes:

- `Local Free`
- `Pro Cloud`

Local Free:

- no account required;
- BYOK;
- local IndexedDB;
- manual downloads;
- local Recordings page.

Pro Cloud:

- signed-in user;
- no user provider key required for Pro processing;
- completed recordings auto-upload;
- cloud dashboard is primary review surface.

## Pro Recording Flow

1. User signs in to Pro from extension.
2. Extension shows Pro status and cloud upload notice.
3. User starts recording.
4. User stops recording.
5. Extension uploads automatically.
6. Primary action: `Open in VoxM Cloud`.
7. Secondary action: `Share`.
8. If upload fails after 3 retries, show `Retry Upload`.

No `do not upload this meeting` option in MVP.

## Cloud Dashboard

Dashboard must support:

- recording list;
- collection list;
- selected recording detail;
- video playback;
- summary;
- transcript;
- action items;
- add to collection;
- share;
- download;
- search;
- Ask.

## Collections UX

Collections solve multi-meeting sharing without exposing an entire workspace.

User can:

- create collection;
- name collection;
- add/remove recordings;
- share collection;
- ask questions over collection;
- revoke share.

## Share UX

Owner controls:

- create link;
- password optional;
- expiration optional;
- downloads enabled in MVP;
- copy link;
- revoke link;
- invalidate sessions;
- view audit summary.

Recipient flow:

1. Open link.
2. If password required, enter password.
3. View shared content.
4. Download allowed files.
5. Ask questions over shared scope.

## Ask UX

Ask must show:

- answer;
- cited meetings;
- cited timestamps;
- confidence or evidence warning when transcript is partial;
- quota warning if applicable.

If there is not enough evidence, answer with that explicitly.

## Distinguishing Local And Cloud

Use clear labels:

- `Local only`
- `Uploading`
- `Cloud processing`
- `Cloud ready`
- `Cloud failed`

Local recordings open in extension Recordings. Pro recordings open in web dashboard.

