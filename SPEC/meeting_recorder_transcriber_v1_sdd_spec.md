# SDD Spec — Open-source Chrome Extension V1: Browser Meeting Recorder + Groq Transcriber

**Version:** 1.0  
**Date:** 2026-06-19  
**Package manager:** pnpm only  
**Backend:** Not required for V1  
**Database:** Local browser storage only for V1  
**Primary target:** Chrome Manifest V3 extension  
**Transcription provider:** Groq, using the user's own API key  
**Diarization:** Not included in V1  

---

## 0. Executive Summary

Build an open-source, local-first Chrome extension that records browser-tab meetings, saves the meeting video locally, transcribes the meeting using the user's own Groq API key, and saves the transcript locally.

The extension must not depend on Google Meet UI scraping. It must work with any browser-based meeting platform where the meeting runs inside a Chrome tab, including Google Meet web, Zoom web, Microsoft Teams web, Discord web, Whereby, etc.

The extension must capture:

1. The remote speakers' audio coming from the browser tab.
2. The local computer owner's microphone audio.
3. The visual content of the browser tab as video.

The extension must save:

1. A `.webm` video file containing the captured tab video and the mixed audio:
   - remote tab audio;
   - local microphone audio.
2. A transcript file:
   - `.md`;
   - `.json`.
3. Local metadata about the recording session.

The extension must use the user's own API key. There must be no required backend for V1.

---

## 0.1 Product Name and Branding

The official product name is **VoxM**.

Pronunciation: **“vox-em”**.

VoxM is an open-source, local-first Chrome extension for recording browser-based meetings, saving the meeting video locally, and transcribing the meeting using the user’s own API key.

The implementation must consistently use **VoxM** as the product name across:

* README title;
* extension name;
* extension short name;
* popup UI;
* options page;
* recordings page;
* downloaded file metadata where appropriate;
* package names where appropriate;
* repository references;
* documentation.

The product must not be referred to as:

* Meeting Recorder Transcriber;
* Meeting Recorder;
* Google Meet Recorder;
* Meet Transcriber;
* Browser Meeting Recorder;
* any other placeholder name.

The extension should use the following naming conventions:

```txt
Product name: VoxM
Pronunciation: vox-em
Repository name: voxm
Root package name: voxm
Extension package name: @voxm/extension
Extension display name: VoxM
Extension short name: VoxM
```

Default downloaded filenames must use `voxm` as prefix:

```txt
voxm-recording_YYYY-MM-DD_HH-mm-ss.webm
voxm-transcript_YYYY-MM-DD_HH-mm-ss.md
voxm-transcript_YYYY-MM-DD_HH-mm-ss.json
```

IndexedDB database name:

```txt
voxm_v1
```

Chrome storage keys should use the `voxm:` prefix.

Examples:

```txt
voxm:settings
voxm:recording-state
voxm:last-active-recording-id
```

The README title must be:

```md
# VoxM
```

The README subtitle should be:

```md
Open-source browser meeting recorder and transcriber. Bring your own API key.
```

Suggested tagline:

```txt
VoxM records your browser meetings locally and transcribes them with your own API key.
```

The implementation must keep the branding simple and professional. Do not use Godzilla, kaiju, monster, or copyrighted creature references in the branding, logo, README, UI copy, or iconography.

## 1. Core Product Decision

This is not a Google Meet add-on.  
This is not a Google Meet bot.  
This is not a desktop recording app.  
This is not a transcription SaaS with centralized user data.

V1 is a Chrome extension that records the active browser tab and the user's microphone.

V1 must not support native desktop apps such as Zoom desktop or Microsoft Teams desktop. Users who want to record Zoom/Teams in V1 must use the browser version.

The product positioning for V1:

> Open-source local-first meeting recorder and transcriber for browser tabs, using your own API key.

---

## 2. Non-Negotiable Requirements

### 2.1 Functional Requirements

The system must:

- Allow the user to enter and save their own Groq API key.
- Allow the user to start recording the current active tab.
- Capture tab video.
- Capture tab audio.
- Capture microphone audio.
- Mix tab audio and microphone audio into one audio track.
- Save a final `.webm` video file containing:
  - tab video;
  - mixed audio from tab + mic.
- Generate audio-only chunks from the same mixed audio stream for transcription.
- Send audio-only chunks to Groq Whisper Large v3 Turbo.
- Merge chunk transcripts into one complete transcript.
- Save the transcript locally.
- Export transcript as Markdown.
- Export transcript as JSON.
- Keep video and transcript saved until the user explicitly deletes them.
- Show clear recording state:
  - idle;
  - preparing;
  - recording;
  - stopping;
  - transcribing;
  - completed;
  - failed.
- Preserve partial progress where feasible if the extension popup closes.
- Never require a backend in V1.
- Never require PostgreSQL in V1.
- Never require Next.js in V1.
- Never require NestJS in V1.

### 2.2 Technical Requirements

The system must:

- Use Chrome Manifest V3.
- Use TypeScript.
- Use pnpm.
- Use an offscreen document for long-running audio/video recording work.
- Use `chrome.tabCapture` for tab capture.
- Use `navigator.mediaDevices.getUserMedia` for microphone capture.
- Use `AudioContext` to mix tab audio and mic audio.
- Use `MediaRecorder` for video recording and audio chunk recording.
- Use IndexedDB for local persistent metadata, chunks, and transcript storage.
- Use `chrome.storage.local` only for small settings such as API key, preferences, and selected model/provider.
- Use `chrome.downloads.download` to save final video/transcript files to the user's Downloads folder.
- Use no remote JavaScript.
- Use no analytics by default.
- Use no server-side storage.
- Use no telemetry by default.
- Use no hidden recording.
- Start recording only after an explicit user action.

### 2.3 Security and Privacy Requirements

The system must:

- Be local-first.
- Store the Groq API key locally only.
- Never send the API key anywhere except to Groq API requests.
- Never log the API key.
- Never sync the API key through `chrome.storage.sync`.
- Provide a "clear API key" action.
- Provide a "clear local recordings metadata/transcripts" action.
- Show a consent reminder before recording.
- Make it explicit that audio is sent to Groq for transcription when the user starts transcription.
- Avoid broad host permissions.
- Avoid content scripts for meeting-page scraping.
- Avoid reading page DOM.
- Avoid requesting permissions unrelated to recording/transcription.

---

## 3. Critical Chunking and Persistence Requirements

This section is mandatory. The code agent must treat it as one of the highest-priority parts of the implementation.

### 3.1 No Full Recording in Memory

The implementation must never rely on keeping the full video or full audio recording in memory during the meeting.

The system must persist recording data progressively as chunks are produced.

Required behavior:

- Video data must be emitted by `MediaRecorder` as periodic chunks.
- Audio-only transcription data must be emitted by `MediaRecorder` as periodic chunks.
- Each chunk must be assigned a monotonically increasing `index`.
- Each chunk must be persisted as soon as it is received.
- The system must be able to survive popup closure without losing already persisted chunks.
- The system must avoid storing the complete meeting recording as a single in-memory array during recording.
- The system must avoid creating the final video blob until the user stops recording and all chunks are finalized.
- If storage fails, the system must stop gracefully, preserve already saved chunks, and show a clear error.

Recommended intervals:

- Video chunk interval: 10 seconds.
- Audio transcription chunk interval: 3–5 minutes.

### 3.2 Video Chunk Persistence

Each video chunk must be saved with this metadata:

```ts
type VideoChunkEntity = {
  id: string;
  recordingId: string;
  index: number;
  createdAt: string;
  blob: Blob;
  sizeBytes: number;
  mimeType: string;
};
```

Rules:

- `index` starts at `0`.
- `index` increments by `1` for each new video chunk.
- Chunks must be stored in IndexedDB or an equivalent persistent local store.
- Chunks must never be reordered.
- Chunks must never be deleted before final video export succeeds.
- Temporary video chunks may be deleted only after:
  1. final video export succeeds;
  2. recording metadata is updated;
  3. user settings allow clearing temporary chunks.

### 3.3 Final Video Assembly

When the user stops recording, the system must assemble the final video from all saved video chunks in exact ascending order by `index`.

Required algorithm:

```ts
const chunks = await videoChunkRepository.listByRecordingId(recordingId);
const orderedChunks = chunks.sort((a, b) => a.index - b.index);

assertNoMissingIndexes(orderedChunks);

const finalVideoBlob = new Blob(
  orderedChunks.map((chunk) => chunk.blob),
  { type: selectedVideoMimeType }
);

await downloadBlob(finalVideoBlob, finalVideoFilename);
```

The implementation must validate chunk continuity before export.

Example:

```ts
function assertNoMissingIndexes(chunks: VideoChunkEntity[]) {
  for (let i = 0; i < chunks.length; i++) {
    if (chunks[i].index !== i) {
      throw new AppError(
        'VIDEO_CHUNK_SEQUENCE_BROKEN',
        `Missing or out-of-order video chunk at index ${i}`
      );
    }
  }
}
```

If chunks are missing or corrupted:

- Do not silently export an incomplete video.
- Mark recording as `failed` or `partial_video_failed`.
- Show clear error.
- Keep available chunks for possible manual recovery.

### 3.4 Memory-Safe Video Export Requirement

The implementation must prefer memory-safe export strategies.

Preferred strategy for V1:

1. Persist chunks during recording.
2. On stop, assemble the final video only after all chunks are persisted.
3. Use chunk ordering validation before export.
4. Warn the user if the estimated final video size is large.

Important note:

Creating a final `Blob` from many chunks may still require significant memory for very long recordings. Therefore:

- The extension must show warnings for long recordings.
- The extension must show estimated video size.
- The extension must recommend recordings under 2 hours for V1.
- The implementation should be structured so a future version can replace final Blob assembly with a streaming file writer.

Optional better implementation if feasible:

- Use the File System Access API to ask the user for a save location at the start of recording.
- Write video chunks progressively to a file stream.
- Keep IndexedDB metadata and transcript storage.
- This reduces memory pressure during final export.

If File System Access API is not implemented in V1, the IndexedDB chunking + final ordered Blob assembly approach is acceptable, but the code must be structured so streaming export can be added later.

### 3.5 Audio Chunk Persistence for Transcription

Audio-only chunks must be saved separately from video chunks.

Each audio chunk must be saved with this metadata:

```ts
type AudioChunkEntity = {
  id: string;
  recordingId: string;
  index: number;
  offsetMs: number;
  durationMs?: number;
  createdAt: string;
  blob: Blob;
  sizeBytes: number;
  mimeType: string;

  transcriptionStatus:
    | 'pending'
    | 'transcribing'
    | 'completed'
    | 'failed';

  transcriptionAttempts: number;
  groqRawResponse?: unknown;
  transcriptSegments?: TranscriptSegment[];
  errorCode?: string;
  errorMessage?: string;
};
```

Rules:

- `index` starts at `0`.
- `index` increments by `1` for each transcription chunk.
- `offsetMs` must represent the chunk's start time relative to the beginning of the recording.
- Audio chunks must be persisted before being sent to Groq.
- If transcription fails, the original audio chunk must remain available for retry.
- Completed chunks must keep their raw Groq response and normalized transcript segments.

### 3.6 Transcription Ordering

The transcription orchestrator must process chunks in ascending order by `index`.

Default behavior:

```ts
const chunks = await audioChunkRepository.listByRecordingId(recordingId);
const orderedChunks = chunks.sort((a, b) => a.index - b.index);

assertNoMissingIndexes(orderedChunks);

for (const chunk of orderedChunks) {
  await transcribeChunk(chunk);
}
```

Parallel transcription is not allowed in V1 unless the final merge still guarantees deterministic ordering by `index`.

For V1, sequential transcription is preferred because it:

- preserves order;
- simplifies retries;
- reduces API rate-limit risk;
- simplifies progress tracking;
- avoids memory spikes.

### 3.7 Transcript Merge Ordering

The final transcript must be generated only from audio chunks sorted by ascending `index`.

For every segment returned by Groq, the system must adjust timestamps using the chunk's `offsetMs`.

Example:

```ts
const normalizedSegment = {
  startMs: chunk.offsetMs + segment.start * 1000,
  endMs: chunk.offsetMs + segment.end * 1000,
  text: segment.text
};
```

Final transcript generation rules:

- Sort audio chunks by `index`.
- Validate no missing chunk indexes.
- For each chunk, normalize timestamps using `offsetMs`.
- Append segments in order.
- Preserve failed chunks as explicit transcript gaps if needed.

If a chunk failed permanently, the final transcript must show a gap marker:

```md
[00:15:00] [Transcription failed for this audio segment]
```

The system must not silently skip failed chunks.

---

## 4. Recommended Architecture

Use a pnpm monorepo even though V1 only has one app. This keeps the project open for future packages.

Recommended structure:

```txt
meeting-recorder-transcriber/
  package.json
  pnpm-lock.yaml
  pnpm-workspace.yaml
  README.md
  LICENSE
  .gitignore
  .editorconfig
  .prettierrc
  eslint.config.js
  tsconfig.base.json

  apps/
    extension/
      package.json
      vite.config.ts
      tsconfig.json
      index.html

      public/
        icons/
          icon16.png
          icon32.png
          icon48.png
          icon128.png

      src/
        manifest.ts
        background/
          service-worker.ts
        offscreen/
          offscreen.html
          offscreen.ts
        popup/
          Popup.tsx
          popup.html
          main.tsx
        options/
          Options.tsx
          options.html
          main.tsx
        recordings/
          RecordingsPage.tsx
          recordings.html
          main.tsx

        core/
          audio/
            createMixedAudioStream.ts
            preserveTabAudioPlayback.ts
            getMicrophoneStream.ts
            getTabStreamFromStreamId.ts
            mimeTypes.ts
          recording/
            RecordingController.ts
            VideoRecorder.ts
            AudioChunkRecorder.ts
            recordingTypes.ts
          transcription/
            GroqTranscriptionClient.ts
            TranscriptionOrchestrator.ts
            transcriptMerger.ts
            transcriptionTypes.ts
          storage/
            db.ts
            recordingRepository.ts
            settingsRepository.ts
            chunkRepository.ts
          downloads/
            downloadBlob.ts
            fileNaming.ts
          messaging/
            messageTypes.ts
            sendMessage.ts
          errors/
            AppError.ts
            errorCodes.ts
          utils/
            assertNever.ts
            formatDuration.ts
            sanitizeFilename.ts
            sleep.ts

        styles/
          global.css
```

Do not create a NestJS backend for V1.

Do not create a Next.js frontend for V1.

Do not create a PostgreSQL database for V1.

---

## 5. Package Manager and Scripts

Use pnpm only.

Root `package.json`:

```json
{
  "name": "meeting-recorder-transcriber",
  "private": true,
  "packageManager": "pnpm@latest",
  "scripts": {
    "dev": "pnpm --filter @app/extension dev",
    "build": "pnpm --filter @app/extension build",
    "typecheck": "pnpm -r typecheck",
    "lint": "pnpm -r lint",
    "test": "pnpm -r test",
    "format": "pnpm -r format"
  },
  "devDependencies": {
    "@typescript-eslint/eslint-plugin": "latest",
    "@typescript-eslint/parser": "latest",
    "eslint": "latest",
    "prettier": "latest",
    "typescript": "latest"
  }
}
```

Extension scripts:

```json
{
  "name": "@app/extension",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite build --watch",
    "build": "vite build",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src --ext .ts,.tsx",
    "test": "vitest run",
    "format": "prettier --write ."
  }
}
```

The code agent must not generate `package-lock.json`.

The code agent must not run `npm install`.

The code agent must not add yarn config.

---

## 6. Browser Compatibility Target

Target Chrome Manifest V3.

Set `minimum_chrome_version` to `"116"` because V1 should rely on modern MV3 behavior for `tabCapture.getMediaStreamId` and offscreen document media handling.

---

## 7. Extension Manifest Requirements

Generate Manifest V3 from TypeScript or static JSON.

Required permissions:

```json
{
  "permissions": [
    "activeTab",
    "tabCapture",
    "offscreen",
    "storage",
    "downloads",
    "unlimitedStorage"
  ],
  "host_permissions": [
    "https://api.groq.com/*"
  ]
}
```

Notes:

- `activeTab` is preferred over broad host permissions.
- Do not request access to all URLs.
- Do not inject content scripts into meeting pages.
- `unlimitedStorage` is allowed because recording metadata/chunks/transcripts may exceed default small storage limits.
- Large final files should still be exported through downloads, not stored forever inside `chrome.storage.local`.

Required extension pages:

- `popup.html`
- `options.html`
- `recordings.html`
- `offscreen.html`

Required background:

- MV3 service worker.

Content Security Policy:

```json
{
  "extension_pages": "script-src 'self'; object-src 'self'"
}
```

Do not use remote scripts.

---

## 8. Main User Flows

### 8.1 First-Time Setup

1. User installs extension.
2. User opens extension popup.
3. Popup shows setup state: “Groq API key required.”
4. User opens Options page.
5. User enters Groq API key.
6. User can select:
   - transcription model: default `whisper-large-v3-turbo`;
   - language: auto by default, optional manual ISO-639-1 code;
   - recording quality: balanced by default;
   - microphone capture: enabled by default;
   - save transcript as Markdown: enabled;
   - save transcript as JSON: enabled;
   - auto-download video after stop: enabled.
7. API key is saved in `chrome.storage.local`.
8. API key is never displayed again in full after saving.

### 8.2 Start Recording

1. User opens a meeting in a Chrome tab.
2. User clicks extension icon.
3. Popup checks:
   - API key exists;
   - active tab is capturable;
   - no recording is already active.
4. Popup shows consent reminder:
   - “Make sure participants know the meeting is being recorded/transcribed.”
5. User clicks “Start Recording.”
6. Service worker creates or reuses offscreen document.
7. Service worker calls `chrome.tabCapture.getMediaStreamId` for the active tab.
8. Service worker sends stream ID and recording settings to offscreen document.
9. Offscreen document obtains tab stream using `getUserMedia` with `chromeMediaSource: "tab"` and the stream ID.
10. Offscreen document obtains microphone stream using `navigator.mediaDevices.getUserMedia`.
11. Offscreen document creates mixed audio stream from:
    - tab audio;
    - mic audio.
12. Offscreen document creates final video stream:
    - video tracks from tab stream;
    - mixed audio track from `AudioContext` destination.
13. Offscreen document starts:
    - video recorder for final `.webm`;
    - audio-only chunk recorder for transcription chunks.
14. UI state changes to `recording`.

### 8.3 During Recording

The extension must:

- Show elapsed duration.
- Show recording status.
- Show whether microphone is active.
- Show whether tab audio is active.
- Allow user to stop recording.
- Avoid losing recording if popup closes.
- Keep recording in offscreen document.
- Persist important recording metadata periodically.
- Store chunks as they arrive, not only at the end.
- Avoid keeping all chunks only in memory.

The extension should not provide pause/resume in V1 unless trivial. Start/Stop is enough.

### 8.4 Stop Recording

1. User clicks “Stop Recording.”
2. Popup sends `STOP_RECORDING` to service worker.
3. Service worker forwards to offscreen document.
4. Offscreen document stops MediaRecorders.
5. Offscreen document stops media tracks.
6. Offscreen document closes/cleans AudioContext.
7. Offscreen document finalizes video chunk persistence.
8. Extension loads video chunks from IndexedDB ordered by ascending `index`.
9. Extension validates no missing video chunk indexes.
10. Extension assembles final video blob from ordered chunks.
11. Extension downloads video file:
    - filename: `meeting-recording_YYYY-MM-DD_HH-mm-ss.webm`.
12. Extension starts or continues transcription from audio-only chunks.
13. UI state changes to `transcribing`.

### 8.5 Transcription

1. Audio-only chunks are processed sequentially.
2. Chunks are loaded from IndexedDB sorted by ascending `index`.
3. The system validates that there are no missing audio chunk indexes.
4. Each chunk is sent to Groq using the user's API key.
5. Use model `whisper-large-v3-turbo`.
6. Use `response_format: "verbose_json"`.
7. Request segment timestamps.
8. Include language setting only if user explicitly set it.
9. Each chunk transcript is stored after completion.
10. Transcription progress is displayed:
    - chunks completed / total chunks;
    - current status;
    - errors if any.
11. Failed chunk requests must retry with exponential backoff.
12. If a chunk fails permanently, mark recording as `partial_transcript_failed` and preserve completed chunks.
13. The final transcript must include an explicit failure marker for failed chunks.
14. The system must never silently skip failed chunks.

### 8.6 Transcript Merge

The system must merge chunk transcripts into a complete transcript.

Requirements:

- Preserve chunk order.
- Sort chunks by ascending `index`.
- Validate chunk continuity.
- Adjust timestamps by chunk `offsetMs`.
- Remove obvious duplicate overlap text if overlapping chunks are implemented.
- Store:
  - raw Groq response per chunk;
  - merged plain text;
  - merged Markdown;
  - merged JSON with segments.

Markdown format:

```md
# Meeting Transcript

- Date: YYYY-MM-DD
- Duration: HH:mm:ss
- Source: Browser tab recording
- Model: Groq whisper-large-v3-turbo
- Diarization: Not included in V1

## Transcript

[00:00:00] Text...
[00:00:12] Text...
```

JSON format:

```json
{
  "recordingId": "uuid",
  "createdAt": "ISO string",
  "durationMs": 0,
  "source": "browser-tab",
  "model": "whisper-large-v3-turbo",
  "diarization": false,
  "segments": [
    {
      "startMs": 0,
      "endMs": 12000,
      "text": "..."
    }
  ],
  "failedChunks": []
}
```

If a chunk fails permanently, include:

```json
{
  "failedChunks": [
    {
      "chunkIndex": 5,
      "offsetMs": 900000,
      "errorCode": "GROQ_TRANSCRIPTION_FAILED",
      "errorMessage": "Redacted human-readable error"
    }
  ]
}
```

### 8.7 Saving Files

After transcription completes:

- Download `.md` transcript.
- Download `.json` transcript.
- Keep transcript in IndexedDB.
- Keep metadata in IndexedDB.
- Keep reference to downloaded video filename and download ID if available.
- Do not auto-delete video.
- Do not auto-delete transcript.
- Only delete when user explicitly clicks delete.

### 8.8 Recordings Page

Create a `recordings.html` extension page.

It must show a list of local recordings:

- title or generated name;
- date/time;
- duration;
- status;
- transcript status;
- downloaded video filename;
- actions:
  - view transcript;
  - copy transcript;
  - download transcript Markdown again;
  - download transcript JSON again;
  - delete local metadata/transcript;
  - retry failed transcription chunks.

V1 does not need video playback inside the app, because the video file is saved to Downloads. It may show the filename and a note.

---

## 9. Audio and Video Capture Details

### 9.1 Streams

There are two input streams:

1. `tabStream`
   - source: captured browser tab;
   - contains tab video;
   - contains remote meeting audio from the tab.

2. `micStream`
   - source: user microphone;
   - contains local speaker audio.

Create one mixed audio output:

```txt
tabStream audio track
  + micStream audio track
  -> AudioContext
  -> MediaStreamDestination
  -> mixedAudioStream
```

Create final video stream:

```txt
tabStream video track(s)
  + mixedAudioStream audio track
  -> finalVideoStream
```

Create audio-only transcription stream:

```txt
mixedAudioStream
  -> audioChunkRecorder
```

### 9.2 Preserve Tab Audio Playback

Important: when tab audio is captured, Chrome may stop playing the tab audio to the user. The implementation must re-route the tab audio to the default output device using `AudioContext`.

Implementation requirement:

- Create an `AudioContext`.
- Create a `MediaStreamSource` from the tab stream.
- Connect it to `audioContext.destination`.
- Ensure this does not create a feedback loop into the recording.
- Recommend user uses headphones to avoid microphone re-capturing remote speakers through physical speakers.

### 9.3 Microphone Constraints

Use:

```ts
{
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  },
  video: false
}
```

Allow user to disable mic capture in settings, but default must be enabled.

If mic capture fails:

- Show clear error.
- Allow user to record tab-only only after explicit confirmation.
- Since the product requirement says owner audio must be included, default behavior should block recording unless user explicitly accepts tab-only mode.

### 9.4 Echo/Duplicate Audio Risk

If the user is not wearing headphones, remote speaker audio may be captured both from tab audio and through the microphone, causing echo/doubling.

The extension must show a recommendation:

> Use headphones for best quality. Without headphones, remote voices may be captured twice through your microphone.

Do not attempt advanced echo removal in V1.

---

## 10. Recording Strategy

### 10.1 Video Recorder

Use `MediaRecorder(finalVideoStream)`.

Preferred MIME types, tested in order:

1. `video/webm;codecs=vp9,opus`
2. `video/webm;codecs=vp8,opus`
3. `video/webm`

Implement helper:

```ts
export function getSupportedVideoMimeType(): string
```

Use `MediaRecorder.isTypeSupported`.

Recommended balanced settings:

```ts
{
  mimeType,
  videoBitsPerSecond: 1_500_000,
  audioBitsPerSecond: 96_000
}
```

V1 should optimize for reasonable file size, not maximum visual quality.

The video must be chunked with `mediaRecorder.start(timesliceMs)`.

Recommended video timeslice: 10 seconds.

Each video chunk must be persisted to IndexedDB or an equivalent persistent local store as soon as it arrives.

Do not keep all video chunks only in memory.

### 10.2 Audio Chunk Recorder

Use `MediaRecorder(mixedAudioStream)`.

Preferred MIME types, tested in order:

1. `audio/webm;codecs=opus`
2. `audio/webm`
3. `audio/ogg;codecs=opus`

Recommended audio bits:

```ts
{
  audioBitsPerSecond: 64_000
}
```

Recommended transcription chunk length: 3–5 minutes.

Reason:

- Avoid large uploads.
- Avoid Groq file-size limits.
- Keep retry scope small.
- Enable progress display.

Implementation can either:

- create one audio MediaRecorder with 3-minute timeslice; or
- record smaller chunks and group them into transcription chunks.

For V1, prefer 3-minute audio chunks.

### 10.3 File Size and Duration Guardrails

V1 must include guardrails:

- Show estimated video file size while recording.
- Warn after 60 minutes.
- Warn after 90 minutes.
- Soft recommended max duration: 2 hours.
- Do not hard-stop unless storage is critically low.
- Detect storage write failures and stop gracefully if needed.

---

## 11. Local Storage Design

### 11.1 Do Not Store Large Blobs in chrome.storage.local

Use `chrome.storage.local` for:

- API key;
- selected model;
- selected language;
- feature flags;
- simple preferences.

Use IndexedDB for:

- recording metadata;
- transcript text;
- transcript JSON;
- video chunk metadata and blobs;
- audio chunk metadata and blobs;
- temporary chunk blobs if needed.

### 11.2 IndexedDB Schema

Use an IndexedDB wrapper such as `idb`, or write a minimal typed wrapper.

Database name:

```txt
meeting_recorder_transcriber_v1
```

Object stores:

#### `recordings`

```ts
type RecordingEntity = {
  id: string;
  createdAt: string;
  updatedAt: string;
  startedAt: string;
  stoppedAt?: string;
  durationMs?: number;

  status:
    | 'preparing'
    | 'recording'
    | 'stopping'
    | 'video_saved'
    | 'transcribing'
    | 'completed'
    | 'failed'
    | 'partial_video_failed'
    | 'partial_transcript_failed';

  sourceType: 'browser_tab';
  sourceTabTitle?: string;
  sourceTabUrl?: string;

  videoDownloadId?: number;
  videoFilename?: string;
  videoMimeType?: string;
  videoSizeBytes?: number;

  transcriptMarkdown?: string;
  transcriptJson?: TranscriptJson;

  transcriptMarkdownDownloadId?: number;
  transcriptJsonDownloadId?: number;

  modelProvider: 'groq';
  modelName: 'whisper-large-v3-turbo';
  language?: string;

  diarization: false;

  videoChunkCount?: number;
  audioChunkCount?: number;

  errorCode?: string;
  errorMessage?: string;
};
```

#### `videoChunks`

```ts
type VideoChunkEntity = {
  id: string;
  recordingId: string;
  index: number;
  createdAt: string;
  blob: Blob;
  sizeBytes: number;
  mimeType: string;
};
```

Indexes:

- `recordingId`
- `[recordingId+index]`

#### `audioChunks`

```ts
type AudioChunkEntity = {
  id: string;
  recordingId: string;
  index: number;
  offsetMs: number;
  durationMs?: number;
  createdAt: string;
  blob: Blob;
  sizeBytes: number;
  mimeType: string;

  transcriptionStatus:
    | 'pending'
    | 'transcribing'
    | 'completed'
    | 'failed';

  transcriptionAttempts: number;
  groqRawResponse?: unknown;
  transcriptSegments?: TranscriptSegment[];
  errorCode?: string;
  errorMessage?: string;
};
```

Indexes:

- `recordingId`
- `[recordingId+index]`
- `transcriptionStatus`

#### `settings`

Settings can be in `chrome.storage.local`, but repository abstraction should hide this.

```ts
type Settings = {
  groqApiKey?: string;
  modelProvider: 'groq';
  modelName: 'whisper-large-v3-turbo';
  language?: string;
  captureMic: boolean;
  autoDownloadVideo: boolean;
  autoDownloadMarkdown: boolean;
  autoDownloadJson: boolean;
  showConsentReminder: boolean;
  keepInternalVideoChunksAfterExport: boolean;
};
```

---

## 12. Download Strategy

Use `chrome.downloads.download`.

File names:

```txt
meeting-recording_YYYY-MM-DD_HH-mm-ss.webm
meeting-transcript_YYYY-MM-DD_HH-mm-ss.md
meeting-transcript_YYYY-MM-DD_HH-mm-ss.json
```

Sanitize file names.

Do not include meeting URL in filename.

Do not include participant names in filename.

After download completes, save download ID and filename in recording metadata.

If download fails:

- show error;
- keep chunks in IndexedDB;
- provide “retry download” action.

Do not delete chunks until final video download succeeds and recording metadata is updated.

Even after successful download, do not delete transcript. For video chunks, V1 may provide a setting:

- “Keep internal video chunks after export”: off by default.

Default behavior:

- Keep the final downloaded video file.
- Keep transcript in IndexedDB.
- Keep transcript downloaded files.
- Clear temporary video chunks only after successful video export, unless user enables internal chunk retention.

Rationale: retaining both a downloaded video file and all internal chunks can consume a large amount of storage.

---

## 13. Groq Transcription Integration

### 13.1 API

Implement `GroqTranscriptionClient`.

Use OpenAI-compatible endpoint:

```txt
POST https://api.groq.com/openai/v1/audio/transcriptions
```

Request must use `multipart/form-data`.

Required fields:

```txt
model = whisper-large-v3-turbo
file = audio chunk blob
response_format = verbose_json
temperature = 0
timestamp_granularities[] = segment
```

Optional:

```txt
language = user selected ISO-639-1 language
prompt = user-provided custom spelling/context prompt
```

Do not implement translation in V1.

Do not implement diarization in V1.

### 13.2 Retry Policy

For each chunk:

- max attempts: 3
- exponential backoff:
  - attempt 1: immediate
  - attempt 2: 2 seconds
  - attempt 3: 8 seconds
- retry on:
  - network failure;
  - 429;
  - 500;
  - 502;
  - 503;
  - 504.
- do not retry on:
  - invalid API key;
  - unsupported file type;
  - malformed request;
  - quota/payment error unless error is clearly transient.

If invalid API key:

- pause transcription;
- ask user to update API key;
- preserve chunks.

### 13.3 API Key Handling

- Read API key only when needed.
- Keep API key in memory only for the duration of request.
- Never write API key to logs.
- Never include API key in error messages.
- Never send API key to any non-Groq URL.

---

## 14. UI Requirements

### 14.1 Popup

Popup states:

#### No API key

- Message: “Add your Groq API key to start.”
- Button: “Open Settings”

#### Idle

- Current tab title.
- Recording quality.
- Mic enabled indicator.
- Button: “Start Recording”

#### Preparing

- Spinner.
- Message: “Preparing tab and microphone capture…”

#### Recording

- Red recording indicator.
- Elapsed time.
- Tab audio status.
- Microphone status.
- Estimated video size.
- Button: “Stop Recording”

#### Transcribing

- Progress bar.
- “Chunk X of Y”
- Button: “Open Recordings”

#### Completed

- Message: “Recording and transcript saved.”
- Buttons:
  - “Open Recordings”
  - “Start New Recording”

#### Failed

- Error message.
- Retry action if possible.

### 14.2 Options Page

Fields:

- Groq API key:
  - password input;
  - save button;
  - clear button;
  - “test key” optional but recommended.
- Model:
  - `whisper-large-v3-turbo` default.
- Language:
  - auto default;
  - optional manual code.
- Capture microphone:
  - enabled by default.
- Auto-download video:
  - enabled by default.
- Auto-download transcript Markdown:
  - enabled by default.
- Auto-download transcript JSON:
  - enabled by default.
- Keep internal video chunks after export:
  - disabled by default.
- Consent reminder:
  - enabled by default.
- Data controls:
  - clear API key;
  - clear local transcripts/metadata;
  - clear temporary chunks.

### 14.3 Recordings Page

List recordings with:

- date;
- duration;
- status;
- model;
- video filename;
- transcript availability.

Recording detail view:

- transcript viewer;
- copy transcript;
- download Markdown;
- download JSON;
- retry transcription;
- retry video export if video chunks still exist;
- delete local transcript/metadata;
- show warning that deleting local metadata does not delete already downloaded files from the user's file system.

---

## 15. Error Handling

Define typed errors.

Error codes:

```ts
type ErrorCode =
  | 'NO_API_KEY'
  | 'TAB_CAPTURE_FAILED'
  | 'MIC_PERMISSION_DENIED'
  | 'MIC_CAPTURE_FAILED'
  | 'AUDIO_MIX_FAILED'
  | 'VIDEO_RECORDER_UNSUPPORTED'
  | 'AUDIO_RECORDER_UNSUPPORTED'
  | 'RECORDING_STOP_FAILED'
  | 'VIDEO_DOWNLOAD_FAILED'
  | 'TRANSCRIPT_DOWNLOAD_FAILED'
  | 'GROQ_INVALID_API_KEY'
  | 'GROQ_RATE_LIMITED'
  | 'GROQ_QUOTA_EXCEEDED'
  | 'GROQ_TRANSCRIPTION_FAILED'
  | 'INDEXEDDB_WRITE_FAILED'
  | 'STORAGE_QUOTA_EXCEEDED'
  | 'VIDEO_CHUNK_SEQUENCE_BROKEN'
  | 'AUDIO_CHUNK_SEQUENCE_BROKEN'
  | 'VIDEO_CHUNK_MISSING'
  | 'AUDIO_CHUNK_MISSING'
  | 'UNKNOWN_ERROR';
```

All errors shown to user must be human-readable.

Do not show stack traces in UI.

Log technical details to extension console, but redact API keys.

---

## 16. Privacy UX Copy

Show this before first recording:

```txt
Recording reminder

This extension records the selected browser tab and your microphone.
The final video is saved locally on your computer.
For transcription, audio chunks are sent to Groq using your own API key.
No backend is used by this extension in V1.

Make sure meeting participants know the meeting is being recorded or transcribed.
```

Button:

```txt
I understand — Start Recording
```

---

## 17. Legal/Consent Requirements

The implementation must not attempt to bypass browser permissions.

The implementation must not record silently.

The implementation must not auto-start recording when joining a meeting.

The implementation must not hide recording state.

The implementation must include a visible recording indicator in the popup and extension badge.

The README must include a consent/legal notice:

```txt
This project is intended for lawful recording and transcription of meetings.
Users are responsible for obtaining consent from participants and complying with applicable laws and workplace policies.
```

---

## 18. Extension Badge

While recording:

- badge text: `REC`
- badge background: red or default alarming color
- title: “Recording active”

When transcribing:

- badge text: `TXT`
- title: “Transcribing”

When idle:

- no badge text.

---

## 19. Performance Requirements

V1 must target typical laptops.

Performance principles:

- Do not keep entire recording in memory.
- Persist chunks progressively.
- Use balanced bitrate defaults.
- Avoid real-time transcription in V1.
- Transcribe after recording stops.
- Avoid diarization in V1.
- Avoid video processing/transcoding in V1.
- Avoid ffmpeg in V1.
- Avoid WASM-heavy processing in V1.
- Process transcription chunks sequentially.
- Validate chunk order before video export and transcript merge.

Soft target:

- 60-minute meeting should complete recording without visible browser slowdown on a modern laptop.
- Transcription should process chunks sequentially to avoid API rate bursts and memory spikes.
- UI should remain responsive.

---

## 20. Known V1 Limitations

The README and UI must clearly state:

- Works only for browser tabs, not native desktop apps.
- No speaker diarization.
- No automatic speaker names.
- No bot joins the meeting.
- No Google Meet UI scraping.
- No live transcript in V1.
- No cloud sync in V1.
- No team accounts in V1.
- The user must provide their own Groq API key.
- Long videos can consume significant disk space.
- Long videos can require significant memory during final export if File System Access API streaming is not implemented.
- Headphones are recommended to reduce echo.

---

## 21. Testing Requirements

Use Vitest for unit tests.

### 21.1 Minimum Unit Tests

#### Audio helpers

- selects supported video MIME type;
- selects supported audio MIME type;
- handles unsupported MIME fallback;
- creates correct stream composition assumptions with mocked tracks.

#### Video chunk ordering

- saves video chunks with increasing indexes;
- lists video chunks sorted by index;
- detects missing chunk index;
- detects out-of-order chunk sequence;
- assembles final Blob from chunks sorted by ascending index;
- does not silently export incomplete video.

#### Audio chunk ordering

- saves audio chunks with increasing indexes;
- lists audio chunks sorted by index;
- detects missing audio chunk index;
- processes chunks sequentially by index;
- preserves failed chunks for retry.

#### Transcript merger

- merges chunks in order;
- applies offset to timestamps;
- preserves segments;
- handles empty chunks;
- handles failed chunks;
- outputs explicit gap marker for failed chunks;
- outputs Markdown format;
- outputs JSON format.

#### File naming

- generates safe filenames;
- removes unsafe characters;
- includes timestamp.

#### Settings repository

- saves settings;
- loads settings;
- clears API key;
- does not use sync storage.

#### Groq client

- builds correct multipart request;
- includes model;
- includes response format;
- includes language only when provided;
- redacts API key in errors;
- handles 401;
- handles 429;
- handles 5xx retry classification.

#### Recording repository

- creates recording;
- updates status;
- stores transcript;
- stores chunk metadata;
- marks partial failures.

### 21.2 Manual QA Checklist

1. Install unpacked extension.
2. Save Groq API key.
3. Open Google Meet web test call.
4. Start recording.
5. Confirm remote audio still plays to user.
6. Speak through microphone.
7. Stop after 1–2 minutes.
8. Confirm video `.webm` downloaded.
9. Play video and confirm:
   - tab visuals are present;
   - remote audio is present;
   - microphone/local voice is present.
10. Confirm transcript generated.
11. Confirm transcript downloaded as `.md`.
12. Confirm transcript downloaded as `.json`.
13. Confirm transcript appears in recordings page.
14. Test with microphone denied.
15. Test with invalid Groq API key.
16. Test with network offline during transcription.
17. Test retry after restoring network.
18. Test long-ish recording of 15–20 minutes.
19. Test popup closure during recording.
20. Test tab closure during recording.
21. Test missing video chunk simulation.
22. Test missing audio chunk simulation.
23. Confirm failed transcription chunk is not silently skipped.
24. Confirm transcript gap marker appears for failed chunks.
25. Confirm video chunks are not deleted before video export succeeds.

---

## 22. Build Output

The extension build must output to:

```txt
apps/extension/dist
```

Developer installation instructions:

```txt
pnpm install
pnpm build
```

Then:

```txt
chrome://extensions
→ Enable Developer mode
→ Load unpacked
→ Select apps/extension/dist
```

README must include this flow.

---

## 23. README Requirements

README must include:

- What the project does.
- What V1 supports.
- What V1 does not support.
- BYOK explanation.
- Groq API key setup.
- Installation from source using pnpm.
- Loading unpacked extension.
- Privacy model.
- Consent notice.
- Known limitations.
- Troubleshooting:
  - no mic audio;
  - no tab audio;
  - echo/doubled voices;
  - video file too large;
  - invalid API key;
  - Groq quota/rate limit;
  - transcription failed;
  - extension stops after tab closes;
  - video chunk export failed;
  - transcript chunk failed;
  - storage quota exceeded.

---

## 24. Implementation Order for Code Agent

Implement in this order:

1. Create pnpm monorepo.
2. Create Chrome MV3 extension skeleton.
3. Add popup/options/recordings pages.
4. Add settings storage.
5. Add IndexedDB schema and repositories.
6. Add offscreen document lifecycle.
7. Add tab capture.
8. Add microphone capture.
9. Add audio mixing.
10. Add tab audio playback preservation.
11. Add video MediaRecorder.
12. Add progressive video chunk persistence.
13. Add audio chunk MediaRecorder.
14. Add progressive audio chunk persistence.
15. Add video chunk ordering validation.
16. Add final video assembly from ordered chunks.
17. Add downloads for video.
18. Add Groq transcription client.
19. Add transcription orchestrator.
20. Add sequential audio chunk transcription.
21. Add transcript merger with timestamp offset handling.
22. Add transcript downloads.
23. Add recordings page.
24. Add retry failed chunk functionality.
25. Add error handling.
26. Add tests.
27. Add README.

Do not implement summarization in V1 unless everything above is complete. Summarization is V1.1.

Do not implement diarization in V1.

Do not implement backend in V1.

Do not implement user accounts in V1.

---

## 25. Acceptance Criteria

The implementation is accepted only if:

- `pnpm install` works.
- `pnpm build` works.
- `pnpm typecheck` passes.
- `pnpm lint` passes.
- `pnpm test` passes.
- Extension loads unpacked in Chrome.
- User can save Groq API key.
- User can record a browser tab meeting.
- Video chunks are persisted during recording.
- Audio chunks are persisted during recording.
- The system does not hold the entire recording in memory during recording.
- Closing the popup does not stop recording.
- Final video is assembled from video chunks sorted by ascending `index`.
- The implementation validates missing/out-of-order video chunks before export.
- Final video file is downloaded and playable.
- Final video contains remote tab audio.
- Final video contains local microphone audio.
- Final video contains tab visuals.
- Transcription chunks are processed in ascending `index`.
- Transcript timestamps are adjusted by each chunk's `offsetMs`.
- Failed transcription chunks remain retryable.
- The final transcript does not silently skip failed chunks.
- The final transcript includes explicit gap markers for permanently failed chunks.
- Transcript is generated using Groq.
- Transcript is saved locally.
- Transcript Markdown is downloadable.
- Transcript JSON is downloadable.
- Recording metadata appears in recordings page.
- Invalid API key produces a clear error.
- Mic permission denial produces a clear error.
- No backend is required.
- No PostgreSQL is required.
- No Next.js is required.
- No NestJS is required.
- No npm artifacts are created.

---

## 26. Future Roadmap, Not V1

Do not implement these in V1:

- Speaker diarization.
- Speaker naming.
- Live transcription.
- Meeting summaries.
- Action items.
- Google Docs export.
- Notion export.
- Calendar integration.
- Google Meet add-on.
- Zoom/Teams desktop capture.
- Tauri/Electron desktop app.
- Backend sync.
- Team accounts.
- Cloud storage.
- Local Whisper.
- Multi-provider transcription adapters.

These can be added later after V1 is stable.

---

## 27. Final Instruction to Code Agent

Build the smallest robust V1 that satisfies the acceptance criteria.

Prioritize:

1. Correct and safe recording.
2. Progressive chunk persistence.
3. Ordered final video assembly.
4. Ordered transcription.
5. Local-first privacy.
6. Clear failure modes.
7. pnpm-only setup.

Do not overbuild.

Do not introduce backend infrastructure.

Do not add features outside the V1 scope.

The most important invariant:

> The system must not silently lose, reorder, skip, or delete recording/transcription chunks.
