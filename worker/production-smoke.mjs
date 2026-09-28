// Host-side M9 acceptance only. Does not run a Worker or send notifications.
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { createPublicClient, http } from "viem";
const require = createRequire(import.meta.url);
require("@next/env").loadEnvConfig(process.cwd(), true);
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();
const name = "Production Fuji RPC Health";
const config = { name, production: true, acceptance: false, demo: false, expectedChainId: "43113", latencyThresholdMs: 2000, consecutiveFailureThreshold: 3 };
const mode = process.argv[2] ?? "read";
try {
  const chains = await db.chain.findMany({ where: { chainId: 43113n, enabled: true } });
  if (chains.length !== 1) throw new Error("FUJI_CHAIN_NOT_UNIQUE");
  const chain = chains[0];
  let all = await db.monitor.findMany({ include: { state: true } });
  const matches = all.filter(m => m.type === "RPC_HEALTH" && m.configJson?.name === name && m.configJson?.production === true);
  if (matches.length > 1) throw new Error("PRODUCTION_TARGET_AMBIGUOUS");
  let target = matches[0];
  if (mode === "create") {
    if (all.some(m => m.enabled)) throw new Error("ENABLED_MONITOR_PRECONDITION");
    if (await db.notification.count({ where: { status: { in: ["PENDING", "FAILED"] }, attempts: { lt: 5 } } })) throw new Error("RETRYABLE_NOTIFICATION_PRECONDITION");
    const client = createPublicClient({ transport: http(chain.rpcUrl, { timeout: 10_000, retryCount: 0 }) });
    if (await client.getChainId() !== 43113 || await client.getBlockNumber() === 0n) throw new Error("FUJI_READBACK_FAILED");
    if (!target) target = await db.monitor.create({ data: { type: "RPC_HEALTH", chainId: chain.id, enabled: false, intervalSec: 30, configJson: config, state: { create: {} } }, include: { state: true } });
  } else if (mode === "enable") {
    if (!target || target.chainId !== chain.id || target.configJson.expectedChainId !== "43113" || target.configJson.acceptance !== false || target.configJson.demo !== false) throw new Error("INVALID_TARGET");
    if (all.some(m => m.enabled && m.id !== target.id)) throw new Error("OTHER_MONITOR_ENABLED");
    target = await db.monitor.update({ where: { id: target.id }, data: { enabled: true }, include: { state: true } });
  } else if (mode !== "read") throw new Error("INVALID_MODE");
  all = await db.monitor.findMany();
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), mode,
    counts: { incidents: await db.incident.count(), events: await db.incidentEvent.count(), notifications: await db.notification.count(), monitors: all.length },
    enabled: all.filter(m => m.enabled).map(m => ({ id: m.id, type: m.type, acceptance: m.configJson?.acceptance === true })),
    target: target ? { id: target.id, name, enabled: target.enabled, chainId: chain.chainId.toString(), production: target.configJson.production, acceptance: target.configJson.acceptance, demo: target.configJson.demo, status: target.status,
      configHash: createHash("sha256").update(JSON.stringify({ type: target.type, chainId: target.chainId, rpcUrl: chain.rpcUrl, intervalSec: target.intervalSec, target: target.target, enabled: target.enabled, config: target.configJson })).digest("hex"),
      cursor: target.state?.cursorBlock?.toString() ?? null, lastCheckAt: target.state?.lastCheckAt ?? null, consecutiveFail: target.state?.consecutiveFail ?? null, latencyMs: target.state?.latencyMs ?? null, errorPresent: Boolean(target.state?.lastError), leaseHeld: Boolean(target.state?.leaseOwner) } : null }));
} catch (error) {
  const safe = ["FUJI_CHAIN_NOT_UNIQUE", "PRODUCTION_TARGET_AMBIGUOUS", "ENABLED_MONITOR_PRECONDITION", "RETRYABLE_NOTIFICATION_PRECONDITION", "FUJI_READBACK_FAILED", "INVALID_TARGET", "OTHER_MONITOR_ENABLED", "INVALID_MODE"];
  console.log(JSON.stringify({ blocked: safe.includes(error.message) ? error.message : "SAFE_SMOKE_CHECK_FAILED" }));
  process.exitCode = 1;
} finally { await db.$disconnect(); }
