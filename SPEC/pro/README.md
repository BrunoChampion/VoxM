# VoxM Pro Cloud MVP Spec

**Version:** 0.1  
**Date:** 2026-06-21  
**Status:** Planning spec  
**Backend:** NestJS + TypeScript  
**Web:** Next.js + TypeScript  
**Database:** Postgres + Prisma  
**Vector search:** Postgres + pgvector  
**Infra MVP:** AWS Lightsail VPS + Docker Compose + Lightsail Object Storage  
**Billing:** Lemon Squeezy  
**Primary AI providers:** Groq for STT/summary, Voyage AI for embeddings  

---

## Summary

VoxM Pro adds a paid cloud layer on top of the free local Chrome extension. The free extension remains fully usable with a user-provided API key and local browser storage. Pro adds included processing, cloud history, collections, sharing, downloads, and AI chat over meetings or shared collections.

The main product bet is not "cloud transcript storage". The main Pro value is **shared meeting knowledge**: a user can share a meeting or collection, and the recipient can watch, read, download, and ask questions over that shared scope.

---

## Spec Files

- [Architecture](./architecture.md)
- [Data Model](./data-model.md)
- [API](./api.md)
- [Security And Privacy](./security-privacy.md)
- [Billing And Usage](./billing-usage.md)
- [UX Flows](./ux-flows.md)
- [Rollout And Acceptance](./rollout-acceptance.md)

---

## Core Decisions

- Keep `voxm` public/source-available for the local extension.
- Create a separate private `voxm-cloud` repo for backend, web, worker, billing, private prompts, and infrastructure.
- Use AWS Lightsail for the first paid MVP to keep idle cost near USD 15-20/month.
- Keep the architecture migration-ready for ECS Fargate, RDS, S3, and SQS after revenue or usage justifies the cost.
- Use Postgres as the source of truth for Pro.
- Use object storage for video, audio chunks, transcript artifacts, and summary artifacts.
- Use collections, not workspace-wide public share links, as the safe MVP primitive for sharing multiple meetings.
- Use password-protected share links with rate limiting, audit events, and session invalidation.
- Charge Ask/chat usage to the user asking the question when authenticated.

