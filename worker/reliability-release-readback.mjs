// Read-only release acceptance. Never prints environment values, evidence or raw errors.
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
const require = createRequire(import.meta.url);
require("@next/env").loadEnvConfig(process.cwd(), true);
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();
const hash = value => createHash("sha256").update(JSON.stringify(value, (_, v) => typeof v === "bigint" ? v.toString() : v)).digest("hex");
try {
  const [monitors, chains, incidents, events, notifications, migrations] = await Promise.all([
    db.monitor.findMany({ orderBy: { id: "asc" } }),
    db.chain.findMany({ orderBy: { id: "asc" } }),
    db.incident.findMany({ orderBy: { id: "asc" } }),
    db.incidentEvent.findMany({ orderBy: { id: "asc" } }),
    db.notification.findMany({ orderBy: { id: "asc" } }),
    db.$queryRaw`SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY migration_name`,
  ]);
  const table = await db.$queryRaw`SELECT to_regclass('public.worker_heartbeats')::text AS name`;
  const heartbeat = table[0].name ? await db.workerHeartbeat.findFirst({ orderBy: { lastHeartbeatAt: "desc" } }) : null;
  const state = await db.monitorState.findUnique({ where: { monitorId: "cmujg0um90001dibs3bjnamtc" } });
  const defaults = await db.$queryRaw`SELECT column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='monitors' AND column_name='enabled'`;
  console.log(JSON.stringify({ timestamp: new Date().toISOString(),
    counts: { monitors: monitors.length, incidents: incidents.length, events: events.length, notifications: notifications.length, sent: notifications.filter(n => n.status === "SENT").length },
    hashes: { monitorConfig: hash(monitors.map(({ status, updatedAt, ...config }) => config)), chains: hash(chains), incidents: hash(incidents), events: hash(events), notifications: hash(notifications) },
    enabled: monitors.filter(m => m.enabled).map(m => ({ id: m.id, type: m.type, production: m.configJson?.production === true, acceptance: m.configJson?.acceptance === true, status: m.status })),
    state: state ? { cursor: state.cursorBlock?.toString() ?? null, lastCheckAt: state.lastCheckAt, failures: state.consecutiveFail, errorPresent: Boolean(state.lastError) } : null,
    heartbeat: heartbeat ? { startedAt: heartbeat.startedAt, lastHeartbeatAt: heartbeat.lastHeartbeatAt, lastTickCompletedAt: heartbeat.lastTickCompletedAt, fresh: Date.now() - heartbeat.lastHeartbeatAt.getTime() <= 30_000 } : null,
    heartbeatTable: Boolean(table[0].name), newMonitorDefault: defaults[0]?.column_default,
    migrations: migrations.map(m => ({ name: m.migration_name, applied: Boolean(m.finished_at), rolledBack: Boolean(m.rolled_back_at) })),
  }));
} catch (error) {
  console.log(JSON.stringify({ blocked: "SAFE_RELEASE_READBACK_FAILED", code: typeof error?.code === "string" && /^P\d{4}$/.test(error.code) ? error.code : null }));
  process.exitCode = 1;
} finally { await db.$disconnect(); }
