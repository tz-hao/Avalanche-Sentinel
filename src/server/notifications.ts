import { createHmac } from "node:crypto";
import type { Notification, NotificationChannel } from "@prisma/client";
import type { IncidentRecord } from "@/contracts/domain";
import { prisma } from "@/server/db";
import { safeError } from "./safe-error";

type DeliveryResult = { delivered: boolean; skipped?: boolean; error?: string };

function telegramText(incident: IncidentRecord) {
  return `${incident.severity} · ${incident.title}\n链: ${incident.evidence.chainName}\nTarget: ${incident.evidence.target ?? "-"}\n规则: ${incident.evidence.rule}\n状态: ${incident.status}\nIncident: ${incident.id}`;
}

async function deliverTelegram(incident: IncidentRecord): Promise<DeliveryResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { delivered: false, skipped: true, error: "Telegram 未配置" };
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text: telegramText(incident), disable_web_page_preview: true }), signal: AbortSignal.timeout(10_000) });
  return response.ok ? { delivered: true } : { delivered: false, error: `Telegram HTTP ${response.status}` };
}

export function webhookPayload(notification: Pick<Notification, "id" | "eventType">, incident: IncidentRecord) {
  return {
    schemaVersion: 1,
    event: "incident",
    notificationId: notification.id,
    notificationType: notification.eventType,
    incident: {
      id: incident.id,
      status: incident.status,
      severity: incident.severity,
      title: incident.title,
      monitorType: incident.monitor?.type ?? null,
      chain: incident.monitor?.chain ?? { name: incident.evidence.chainName, chainId: incident.evidence.chainId },
      detectedAt: incident.openedAt,
      recoveredAt: incident.recoveredAt,
      acceptance: incident.evidence.facts.acceptance === true,
      evidence: { rule: incident.evidence.rule, observedAt: incident.evidence.observedAt, provenance: incident.evidence.provenance },
    },
  };
}

async function deliverWebhook(notification: Notification, incident: IncidentRecord): Promise<DeliveryResult> {
  const url = process.env.SENTINEL_WEBHOOK_URL;
  const secret = process.env.SENTINEL_WEBHOOK_SECRET;
  if (!url || !secret) return { delivered: false, skipped: true, error: "Webhook 未配置" };
  const body = JSON.stringify(webhookPayload(notification, incident));
  const signature = createHmac("sha256", secret).update(body).digest("hex");
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-sentinel-signature": `sha256=${signature}`, "idempotency-key": `incident:${incident.id}:${notification.eventType}` }, body, signal: AbortSignal.timeout(10_000) });
  return response.ok ? { delivered: true } : { delivered: false, error: `Webhook HTTP ${response.status}` };
}

export async function queueNotifications(incidentId: string, eventType: string, channels: NotificationChannel[] = ["TELEGRAM", "WEBHOOK"]) {
  await Promise.all(channels.map((channel) => prisma.notification.upsert({
    where: { incidentId_channel_eventType: { incidentId, channel, eventType } },
    create: { incidentId, channel, eventType, status: "PENDING" },
    update: {},
  })));
}

export async function deliverPendingNotifications(resolveIncident: (incidentId: string) => Promise<IncidentRecord | null>, scope?: { incidentId?: string; channel?: NotificationChannel; stopping?: () => boolean }) {
  const deadline = Date.now() + 15_000;
  const pending = await prisma.notification.findMany({ where: { status: { in: ["PENDING", "FAILED"] }, attempts: { lt: 5 }, ...(scope?.incidentId ? { incidentId: scope.incidentId } : {}), ...(scope?.channel ? { channel: scope.channel } : {}) }, orderBy: { createdAt: "asc" }, take: 50 });
  for (const notification of pending) {
    if (scope?.stopping?.() || Date.now() >= deadline) break;
    if (notification.status === "FAILED" && Date.now() - notification.updatedAt.getTime() < Math.min(60_000, 2 ** notification.attempts * 1_000)) continue;
    const incident = await resolveIncident(notification.incidentId);
    if (!incident) continue;
    let result: DeliveryResult;
    try { result = process.env.SENTINEL_DISABLE_EXTERNAL_NOTIFICATIONS === "1" ? { delivered: false, skipped: true, error: "External notifications disabled for controlled acceptance" } : notification.channel === "TELEGRAM" ? await deliverTelegram(incident) : await deliverWebhook(notification, incident); }
    catch (error) { result = { delivered: false, error: `通知请求失败 (${safeError(error)})` }; }
    await prisma.notification.update({ where: { id: notification.id }, data: { attempts: { increment: 1 }, status: result.delivered ? "SENT" : result.skipped ? "SKIPPED" : "FAILED", sentAt: result.delivered ? new Date() : null, error: result.error ?? null } });
  }
}
