# Contributing to VoxM

Thanks for your interest in VoxM.

VoxM is source-available under the PolyForm Noncommercial License 1.0.0. By contributing to this project, you agree that your contribution may be distributed under the same license terms as the rest of the project.

## Before You Start

- Open an issue before large changes.
- Keep changes focused and easy to review.
- Do not include API keys, transcripts, recordings, screenshots with secrets, or other private meeting data.
- Do not commit `apps/extension/dist`, `node_modules`, `.env` files, or downloaded VoxM artifacts.

## Development

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm lint
pnpm test
```

For manual testing, load:

```text
apps/extension/dist
```

in `chrome://extensions` with Developer mode enabled.

## Pull Request Checklist

- TypeScript passes.
- Lint passes.
- Relevant tests pass.
- README or docs are updated when behavior changes.
- No real API keys, recordings, transcripts, or private data are included.
- Chrome extension permissions are not broadened without a clear reason.

## License Of Contributions

Unless explicitly agreed otherwise in writing, contributions are provided under the PolyForm Noncommercial License 1.0.0.

