# Security Policy

VoxM records browser-tab media and microphone audio, so privacy and security reports are taken seriously.

## Supported Versions

Security fixes are considered for the current `main` branch.

## Reporting A Vulnerability

Please do not open a public issue for vulnerabilities involving:

- API key exposure.
- Recording or transcript data leaks.
- Unauthorized capture behavior.
- Permission bypasses.
- Cross-origin data exposure.
- Chrome extension privilege escalation.

If the repository is hosted on GitHub, use GitHub private vulnerability reporting or contact the maintainer privately. If no private channel is available yet, open a minimal public issue saying that you need a private security contact, without including exploit details.

## Sensitive Data

Never include real meeting recordings, transcripts, Groq API keys, browser profile data, or IndexedDB exports in public reports.

## Expected Behavior

VoxM should:

- Request microphone access through Chrome permission prompts.
- Capture only the user-selected active tab after explicit user action.
- Store the Groq API key only in `chrome.storage.local`.
- Send audio chunks only to configured transcription providers.
- Avoid logging API keys or raw provider error bodies.

