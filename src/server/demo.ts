import type { EvidenceSnapshot } from "@/contracts/domain";
import { findOrCreateOpenIncident } from "@/server/incidents";
import { queueNotifications } from "@/server/notifications";
import { prisma } from "@/server/db";

export function demoModeEnabled() {
  return process.env.SENTINEL_DEMO_MODE === "true";
}

export async function createDemoIncident() {
  const monitor = await prisma.monitor.findFirst({ where: { enabled: true }, include: { chain: true } });
  if (!monitor) throw new Error("NO_MONITOR");
  const evidence: EvidenceSnapshot = {
    chainId: monitor.chain.chainId.toString(),
    chainName: monitor.chain.name,
    ...(monitor.target ? { target: monitor.target } : {}),
    rule: "Demo Mode synthetic incident",
    observedAt: new Date().toISOString(),
    provenance: "demo",
    facts: { synthetic: true, notificationDelivery: process.env.DEMO_NOTIFICATIONS_ENABLED === "true" ? "enabled" : "disabled" },
  };
  const incident = await findOrCreateOpenIncident({ monitorId: monitor.id, severity: "WARNING", title: "Demo Incident", message: "此事件由显式 Demo Mode 生成，不代表真实链上异常。", evidence, eventType: "DEMO_CREATED" });
  if (process.env.DEMO_NOTIFICATIONS_ENABLED === "true") await queueNotifications(incident.id, "DEMO_CREATED");
  return incident;
}
