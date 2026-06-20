# VoxM

Source-available browser meeting recorder and transcriber. Bring your own Groq API key.

VoxM is a Chrome Manifest V3 extension that records browser-tab meetings, saves the video locally, and transcribes the meeting audio with Groq `whisper-large-v3-turbo`.

Everything is local-first: recordings, chunks, transcripts, settings, and metadata stay inside your browser profile unless VoxM sends audio chunks to Groq for transcription.

## License

VoxM is source-available for non-commercial use under the [PolyForm Noncommercial License 1.0.0](./LICENSE).

This is intentionally **not** an OSI-approved open-source license, because OSI open source licenses cannot restrict commercial use. Personal use, research, experimentation, education, charitable use, government use, and other non-commercial uses are permitted by the license. Commercial use requires separate permission from the copyright holder.

See [COMMERCIAL.md](./COMMERCIAL.md) for commercial-use guidance.

## Features

- Record the active browser tab video and audio.
- Record local microphone audio.
- Mix tab audio and microphone audio into one `.webm` video.
- Transcribe audio chunks sequentially with Groq.
- Download transcript Markdown and JSON.
- Keep local recording history in IndexedDB.
- Retry failed transcription chunks.
- Retry video export if internal video chunks are still stored.
- Recover active recording state across MV3 service worker restarts.

## Current Limitations

- Browser tabs only. Native Zoom, Teams, Discord, or other desktop apps are not captured.
- Groq is the only provider exposed in V1.
- No live transcription.
- No speaker diarization or speaker names.
- No meeting summary or action items.
- No cloud sync or team accounts.
- Long videos can use significant memory during final export.
- Windows Media Player may not support every WebM codec. If a valid `.webm` does not open there, try Chrome or VLC.

## Requirements

- Google Chrome or Chromium-based browser with Manifest V3 support.
- Node.js compatible with this workspace.
- `pnpm`.
- A Groq API key.

## Install Dependencies

```bash
pnpm install
```

## Build The Extension

```bash
pnpm build
```

The unpacked extension is generated at:

```text
apps/extension/dist
```

## Load In Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select:

```text
apps/extension/dist
```

After every code change, run `pnpm build` again and click the reload button on the VoxM extension card in `chrome://extensions`.

## Set Up Groq

1. Create or open your Groq account.
2. Generate an API key in the Groq console.
3. Open VoxM.
4. Click **Open Settings**.
5. Paste the key.
6. Click **Save Key**.
7. Click **Test Key**.

The API key is stored only in Chrome extension storage:

```text
chrome.storage.local -> voxm:settings -> groqApiKey
```

It is not stored in this repository, not written to downloaded transcripts, and not logged by VoxM.

## First Recording

1. Open the meeting in a browser tab.
2. Click the VoxM extension icon while that meeting tab is active.
3. Click **Start Recording**.
4. Confirm the consent reminder.
5. If Chrome has not granted microphone access yet, VoxM opens a microphone setup page.
6. Click **Allow Microphone & Start** and approve Chrome's microphone prompt.
7. Return to the meeting tab.
8. Stop the recording from the VoxM popup when finished.

VoxM records in an offscreen extension document, so the popup can be closed while recording continues. Keep the meeting tab open until you stop recording.

## Where Files Go

By default, Chrome downloads generated files to your Downloads folder:

```text
voxm-recording_YYYY-MM-DD_HH-mm-ss.webm
voxm-transcript_YYYY-MM-DD_HH-mm-ss.md
voxm-transcript_YYYY-MM-DD_HH-mm-ss.json
```

Depending on Chrome's download behavior and MIME handling, transcript files may appear with `.txt` in some environments even though one contains Markdown and the other contains JSON.

## Recordings Page

Open the VoxM popup and click **Open Recordings**.

From there you can:

- View transcript.
- Copy transcript.
- Download Markdown.
- Download JSON.
- Retry transcription.
- Retry video export.
- Delete local data.

Retry video export requires internal video chunks to still exist. Enable **Keep internal video chunks after export** in Settings if you want reliable video export retries during testing.

## Recommended Settings For Testing

For development and QA:

- Enable **Keep internal video chunks after export**.
- Keep **Auto-download video** enabled.
- Keep **Auto-download transcript Markdown** enabled.
- Keep **Auto-download transcript JSON** enabled.
- Use headphones to reduce echo.
- Test with recordings longer than 4 minutes to verify multi-chunk transcription.

## How Transcription Works

VoxM records audio in independent overlapping chunks. Each chunk is sent to Groq sequentially. This avoids parallel API pressure and makes each audio chunk independently parseable by Groq.

The transcript merger:

- Sorts chunks by index.
- Applies each chunk offset to segment timestamps.
- Preserves failed chunks with explicit gap markers.
- Removes exact duplicate lines near overlap boundaries.
- Produces Markdown and JSON.

## Groq Free Plan Compatibility

VoxM transcribes chunks sequentially and waits between chunks. This is intended to be friendly to Groq free-tier limits.

Groq limits can change. Check your Groq console for your current account limits. If Groq returns a rate limit, VoxM preserves failed chunks so transcription can be retried later.

## Privacy Model

- No VoxM backend.
- No telemetry.
- No analytics.
- API key stays in `chrome.storage.local`.
- Recording metadata, chunks, and transcripts stay in browser IndexedDB.
- Audio chunks are sent to Groq only for transcription.
- Downloaded recordings and transcripts are written to your local Downloads folder.

## Permissions

VoxM uses:

- `activeTab`: identify and capture the user-selected meeting tab after explicit user action.
- `tabCapture`: capture browser-tab media.
- `offscreen`: keep recording running in MV3 while the popup is closed.
- `storage`: save settings and runtime state.
- `downloads`: download generated video and transcript files.
- `unlimitedStorage`: reduce risk of local chunk storage failures during longer recordings.
- `https://api.groq.com/*`: call Groq transcription APIs.

VoxM does not request broad host access to meeting sites.

## Development Commands

```bash
pnpm dev          # watch build for the extension
pnpm build        # production build
pnpm typecheck    # TypeScript type check
pnpm lint         # ESLint
pnpm test         # Vitest unit tests
pnpm format       # Prettier
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) before opening larger changes.

## Manual QA Checklist

- Load `apps/extension/dist` in Chrome.
- Save and test a Groq API key.
- Start recording from a meeting tab.
- Approve microphone access from the VoxM setup page if prompted.
- Record at least 4 minutes.
- Stop recording.
- Confirm a `.webm` downloads.
- Confirm Markdown and JSON transcripts download.
- Open **Recordings**.
- Confirm transcript crosses `00:03:00`.
- Confirm `failedChunks` is empty in JSON.
- Try **Retry Transcription**.
- Try **Retry Video Export** with **Keep internal video chunks after export** enabled.

## Troubleshooting

### No Open Recordings Button

Rebuild and reload the extension:

```bash
pnpm build
```

Then reload VoxM in `chrome://extensions`.

### Microphone Prompt Does Not Appear

- Open VoxM Settings and click **Check Microphone**.
- Make sure Chrome can ask for microphone access at `chrome://settings/content/microphone`.
- Check Windows microphone privacy settings for Chrome.
- Remove VoxM from blocked microphone sites if it appears there.

### No Microphone Audio

- Microphone capture is required.
- Close other apps that may be using the microphone.
- Re-run **Check Microphone** in VoxM Settings.

### No Tab Audio

- Start recording while the meeting tab is active.
- Confirm the tab is producing audio.
- Refresh the meeting tab and try again.

### Transcript Has Failed Chunk Markers

Open **Recordings** and click **Retry Transcription**. If failures persist, check:

- Groq API key validity.
- Groq quota.
- Network connectivity.
- Groq status or API errors.

### Video Export Cannot Be Retried

Video export retry requires stored internal chunks. Enable **Keep internal video chunks after export** before recording if you want retryable video exports.

### Downloaded WebM Does Not Open In Windows Media Player

Try opening it in Chrome or VLC. If it still fails, enable **Keep internal video chunks after export**, record again, and retry video export from the Recordings page.

### Storage Quota Exceeded

- Delete old recordings from the Recordings page.
- Disable **Keep internal video chunks after export** after testing.

## Repository Hygiene

Do not commit:

- `node_modules/`
- `apps/extension/dist/`
- `.env` files
- downloaded `voxm-recording_*` files
- downloaded `voxm-transcript_*` files
- any real API keys or local meeting data

The repository `.gitignore` excludes these by default.

## Security Notes

- Do not paste real API keys into tests, docs, issues, screenshots, or commits.
- If a key is exposed, revoke it in Groq and create a new one.
- VoxM sanitizes provider errors so raw Groq responses and API keys are not shown in user-visible errors.

See [SECURITY.md](./SECURITY.md) for vulnerability reporting guidance.
 
 
