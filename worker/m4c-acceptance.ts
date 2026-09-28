import "./env";
import { safeError } from "@/server/safe-error";
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { RECEIVE_TOPIC, SEND_TOPIC } from "./icm-events";

process.env.SENTINEL_DISABLE_EXTERNAL_NOTIFICATIONS = "1";

const target = "0x253b2784c75e510dD0fF1da844684a1aC0aa5fcf";
const sourceTx = "0x083332fe5fcbaf487745f0f736616919dfc918706e941811b926b0c2865acbb9";
const messageId = "0xf607faa37c4ff2036ad89a9e40d7df42fd876fb37f66b2facc251e5aefbdf72d";
const name = "M4C ICM Acceptance";

function config(phase: "baseline" | "pending" | "recovery") {
  return {
    acceptance: true,
    acceptanceName: name,
    baselineOnly: phase === "baseline",
    destinationChainId: "173750",
    destinationChainName: "Echo Testnet",
    destinationRpcUrl: "https://subnets.avax.network/echo/testnet/rpc",
    destinationTarget: target,
    sourceEventTopic: SEND_TOPIC,
    destinationEventTopic: RECEIVE_TOPIC,
    sourceBlockchainId: "0x7fc93d85c6d62c5b2ac0b519c87010ea5294012d1e407030d6acd0021cac10d5",
    destinationBlockchainId: "0x1278d1be4b987e847be3465940eb5066c4604a7fbd6e086900823597d81af4c1",
    sourceFromBlock: "30584431",
    sourceToBlock: "30584431",
    destinationFromBlock: phase === "recovery" ? "3059" : phase === "pending" ? "3058" : "3058",
    destinationToBlock: phase === "recovery" || phase === "baseline" ? "3059" : "3058",
    // Historical observation at source timestamp +1s, before Echo receive block timestamp +3s.
    observationTimestampSec: 1709679232,
    warningAfterSec: 1,
    criticalAfterSec: 10,
  };
}

async function monitor() {
  const candidates = await prisma.monitor.findMany({ where: { type: "ICM_DELIVERY" }, include: { chain: true, state: true } });
  return candidates.find((item) => (item.configJson as Record<string, unknown>).acceptanceName === name) ?? null;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(",")}}`;
  return JSON.stringify(value);
}

async function main() {
  const phase = process.argv[2];
  const existing = await monitor();
  if (phase === "setup") {
    const chain = await prisma.chain.findFirst({ where: { chainId: 43113n, rpcUrl: "https://api.avax-test.network/ext/bc/C/rpc" } });
    if (!chain) throw new Error("Verified Fuji chain registry entry missing");
    const created = existing ?? await prisma.monitor.create({ data: { type: "ICM_DELIVERY", chainId: chain.id, target, intervalSec: 15, enabled: true, configJson: config("baseline") as Prisma.InputJsonValue, state: { create: {} } } });
    if (existing) await prisma.monitor.update({ where: { id: existing.id }, data: { enabled: true, configJson: config("baseline") as Prisma.InputJsonValue } });
    console.log(JSON.stringify({ phase, monitorId: created.id, reused: Boolean(existing), externalNotificationsDisabled: true }));
  } else if (phase === "pending" || phase === "recovery") {
    if (!existing) throw new Error("M4C acceptance monitor missing");
    await prisma.$transaction([
      prisma.monitor.update({ where: { id: existing.id }, data: { enabled: true, configJson: config(phase) as Prisma.InputJsonValue } }),
      prisma.monitorState.update({ where: { monitorId: existing.id }, data: { lastCheckAt: new Date(0) } }),
    ]);
    console.log(JSON.stringify({ phase, monitorId: existing.id, sourceRange: "30584431-30584431", destinationRange: phase === "pending" ? "3058-3058" : "3059-3059", externalNotificationsDisabled: true }));
  } else if (phase === "repeat") {
    if (!existing) throw new Error("M4C acceptance monitor missing");
    await prisma.monitorState.update({ where: { monitorId: existing.id }, data: { lastCheckAt: new Date(0) } });
    console.log(JSON.stringify({ phase, monitorId: existing.id, externalNotificationsDisabled: true }));
  } else if (phase === "disable") {
    if (!existing) throw new Error("M4C acceptance monitor missing");
    await prisma.monitor.update({ where: { id: existing.id }, data: { enabled: false } });
    console.log(JSON.stringify({ phase, monitorId: existing.id, enabled: false }));
  } else if (phase === "report") {
    if (!existing) throw new Error("M4C acceptance monitor missing");
    const [state, messages, incidents] = await Promise.all([
      prisma.monitorState.findUnique({ where: { monitorId: existing.id } }),
      prisma.icmMessage.findMany({ where: { monitorId: existing.id } }),
      prisma.incident.findMany({ where: { monitorId: existing.id }, include: { events: true, notifications: true } }),
    ]);
    if (messages.some((item) => item.messageId !== messageId || item.sourceTxHash !== sourceTx)) throw new Error("M4C message correlation drifted from verified target");
    console.log(JSON.stringify({ monitorId: existing.id, enabled: existing.enabled, sourceCursor: state?.cursorBlock?.toString(), destinationCursor: state?.destinationCursorBlock?.toString(), messageCount: messages.length, messages: messages.map((item) => ({ messageId: item.messageId, sourceTxHash: item.sourceTxHash, sourceLogIndex: item.sourceLogIndex, destinationTxHash: item.destinationTxHash, destinationLogIndex: item.destinationLogIndex, executionStatus: item.executionStatus, receivedAt: item.receivedAt?.toISOString(), incidentId: item.incidentId })), incidentCount: incidents.length, incidents: incidents.map((item) => ({ id: item.id, status: item.status, title: item.title, openEvidenceHash: createHash("sha256").update(canonical(item.evidenceJson)).digest("hex"), openFacts: item.evidenceJson, eventTypes: item.events.map((event) => event.type), eventCount: item.events.length, deliveryEvents: item.events.filter((event) => event.type === "DELIVERED").map((event) => event.evidenceJson), telegramSent: item.notifications.filter((notification) => notification.channel === "TELEGRAM" && notification.status === "SENT").length, webhookSent: item.notifications.filter((notification) => notification.channel === "WEBHOOK" && notification.status === "SENT").length, notificationStatuses: item.notifications.map((notification) => `${notification.channel}:${notification.status}`) })) }, (_, value) => typeof value === "bigint" ? value.toString() : value));
  } else throw new Error("Use setup|pending|recovery|repeat|report|disable");
}

main().catch((error) => { console.error(safeError(error)); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); });
