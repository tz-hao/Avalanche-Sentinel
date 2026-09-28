# Avalanche Sentinel release readiness

Status: **M7A RELEASE_ARTIFACT_VERIFIED** (2026-09-25). This is a local acceptance record, not production deployment approval.

## Verified

- Prior acceptance milestones reported for this checkout: local release gate, real Neon database, Fuji read-only RPC, Incident lifecycle, Admin, Treasury, ICM, and local signed Webhook delivery. These milestones were not fully replayed in M7A.
- M7A readback: Neon connection passed; all 12 acceptance monitors were disabled; no notification was pending; Prisma migrations were up to date.
- M7A source checks: `.env.local` is gitignored and excluded from Docker build context; none of the configured sensitive values appeared in the 86 inspected project source/configuration files.
- M7A local regression: Prisma Generate and Validate, 50/50 Vitest, ESLint, TypeScript, Next production build, and `docker compose config --quiet` passed. Compose's default service is Web; migration and Worker require explicit profiles.
- M7A Web image `avalanche-sentinel-web:acceptance` built successfully (639,436,624 bytes). The container started with runtime-only secrets; administrator login and `/api/v1/overview`, `/api/v1/monitors`, `/api/v1/incidents`, and the verified Treasury Incident detail all returned HTTP 200 from real Neon.
- M7A Worker image `avalanche-sentinel-worker:acceptance` built successfully (602,923,132 bytes). It loaded injected runtime environment without `.env.local`, read three Neon chains, and read Fuji chain ID 43113 plus latest block in the container. One existing acceptance RPC_HEALTH monitor advanced its persisted check/cursor to block 58712693 with HEALTHY status, then was disabled. No Incident or notification was added. After Worker restart, the state was readable and remained unchanged; no duplicate Incident or notification appeared.
- M7A image history/configuration and `/app` filesystem scan found no configured secret values in either image. Scans of Web and Worker container logs, including the restart and final browser smoke, found no configured secret values. The local browser showed login, overview, 14 real Incidents, and the specified Treasury Evidence detail with no visible development overlay; its captured console error count was 0.
- M7A Compose Web-only startup returned HTTP 200 for login and real Treasury Incident readback; exactly one Compose service (`web`) started. Both standalone containers and the Compose service stopped cleanly, and the dedicated Compose network was removed. No acceptance container or occupied acceptance port remained.

## Historical blocker and observation

- The initial M7A attempt was blocked because Docker Desktop Linux Engine was unavailable. The user started Docker Desktop and the subsequent image/container checks above passed. The historical blocker is retained here for traceability.
- The `agent-browser` CLI was unavailable. The active browser-control interface supplied console logs; a follow-up container smoke captured **0 console errors** across login, overview, Incidents, and the Treasury detail before the temporary tab and container were closed.
- Prisma emitted an OpenSSL detection warning in the slim images. Actual Web and Worker Prisma queries to Neon succeeded; the warning is retained as a compatibility observation, not silently discarded.

## Runtime environment contract

- Required for Web: `DATABASE_URL` (pooled), `SENTINEL_ADMIN_PASSWORD`, `SENTINEL_SESSION_SECRET`.
- Required for migrations only: `DATABASE_URL_UNPOOLED` (direct). Migrations must not use the pooled URL.
- Required for Worker: `DATABASE_URL` (pooled). Fuji RPC is configured in the Chain Registry (`chains.rpcUrl`), not in a dedicated environment variable; verify its chain ID before enabling a monitor.
- Optional and disabled for this release smoke: `SENTINEL_WEBHOOK_URL`, `SENTINEL_WEBHOOK_SECRET`, `SENTINEL_DEMO_MODE`, `DEMO_NOTIFICATIONS_ENABLED`, `WORKER_ID`.
- Deferred: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `AI_SUMMARY_ENDPOINT`, `AI_SUMMARY_API_KEY`, `AI_SUMMARY_MODEL`.

## Safety

- Blockchain writes: **0**. Production deployment: **not performed**.
- Telegram real notification and real AI provider acceptance: **deferred**. No Telegram send, new external Webhook send, or AI provider call was made during M7A.
- The local acceptance Webhook URL is not present in the current process environment or `.env.local`.
- A restricted sandbox can deny outbound Neon TCP; the M7A Neon readback succeeded in the permitted local network context.
- The retained isolated Neon migration branch was not deleted. No destructive database operation was performed.
