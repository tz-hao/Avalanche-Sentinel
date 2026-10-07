import { createHmac } from "node:crypto";
import type { Notification } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IncidentRecord } from "@/contracts/domain";

const db = vi.hoisted(() => ({ findMany: vi.fn(), update: vi.fn(), upsert: vi.fn() }));
vi.mock("@/server/db", () => ({ prisma: { notification: db } }));

import { deliverPendingNotifications, queueNotifications, webhookPayload } from "./notifications";

const incident: IncidentRecord = {
  id: "incident-test",
  monitorId: "monitor-test",
  severity: "WARNING",
  status: "OPEN",
  title: "[ACCEPTANCE TEST] M5B_WEBHOOK_ACCEPTANCE",
  summary: null,
  evidence: { chainId: "43113", chainName: "Fuji", rule: "M5B_WEBHOOK_ACCEPTANCE", observedAt: "2026-09-24T00:00:00.000Z", provenance: "demo", facts: { acceptance: true, secret: "must-not-leak" } },
  openedAt: "2026-09-24T00:00:00.000Z",
  acknowledgedAt: null,
  recoveredAt: null,
  monitor: { id: "monitor-test", type: "RPC_HEALTH", target: "M5B_WEBHOOK_ACCEPTANCE", chain: { id: "chain-test", name: "Fuji", chainId: "43113", explorerUrl: null } },
};

function notification(eventType: string, status = "PENDING", attempts = 0): Notification {
  return { id: `notification-${eventType}`, incidentId: incident.id, channel: "WEBHOOK", eventType, status, attempts, sentAt: null, error: null, createdAt: new Date("2026-09-24T00:00:00.000Z"), updatedAt: new Date("2026-09-24T00:00:00.000Z") };
}

let rows: Notification[];
const previousUrl = process.env.SENTINEL_WEBHOOK_URL;
const previousSecret = process.env.SENTINEL_WEBHOOK_SECRET;
const previousDisable = process.env.SENTINEL_DISABLE_EXTERNAL_NOTIFICATIONS;

beforeEach(() => {
  vi.clearAllMocks();
  rows = [];
  db.findMany.mockImplementation(async ({ where }: { where: { incidentId?: string; channel?: string } }) => rows.filter((row) => ["PENDING", "FAILED"].includes(row.status) && row.attempts < 5 && (!where.incidentId || row.incidentId === where.incidentId) && (!where.channel || row.channel === where.channel)));
  db.update.mockImplementation(async ({ where, data }: { where: { id: string }; data: { attempts: { increment: number }; status: string; sentAt: Date | null; error: string | null } }) => {
    const row = rows.find((item) => item.id === where.id);
    if (!row) throw new Error("missing test notification");
    Object.assign(row, { attempts: row.attempts + data.attempts.increment, status: data.status, sentAt: data.sentAt, error: data.error, updatedAt: new Date() });
    return row;
  });
  db.upsert.mockImplementation(async ({ where, create }: { where: { incidentId_channel_eventType: { incidentId: string; channel: "WEBHOOK"; eventType: string } }; create: Notification }) => {
    const key = where.incidentId_channel_eventType;
    const existing = rows.find((row) => row.incidentId === key.incidentId && row.channel === key.channel && row.eventType === key.eventType);
    if (existing) return existing;
    const row = notification(create.eventType);
    rows.push(row);
    return row;
  });
  process.env.SENTINEL_WEBHOOK_URL = "http://127.0.0.1:3001/m5b";
  process.env.SENTINEL_WEBHOOK_SECRET = "unit-test-secret";
  delete process.env.SENTINEL_DISABLE_EXTERNAL_NOTIFICATIONS;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (previousUrl === undefined) delete process.env.SENTINEL_WEBHOOK_URL; else process.env.SENTINEL_WEBHOOK_URL = previousUrl;
  if (previousSecret === undefined) delete process.env.SENTINEL_WEBHOOK_SECRET; else process.env.SENTINEL_WEBHOOK_SECRET = previousSecret;
  if (previousDisable === undefined) delete process.env.SENTINEL_DISABLE_EXTERNAL_NOTIFICATIONS; else process.env.SENTINEL_DISABLE_EXTERNAL_NOTIFICATIONS = previousDisable;
});

describe("Webhook notification", () => {
  it("bounds Telegram requests and safely records timeout without marking success", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-only-placeholder");
    vi.stubEnv("TELEGRAM_CHAT_ID", "test-only-target");
    try {
      const timeout = vi.spyOn(AbortSignal, "timeout");
      const fetchMock = vi.fn().mockRejectedValue(new DOMException("secret-like-provider-message", "TimeoutError"));
      vi.stubGlobal("fetch", fetchMock);
      rows.push({ ...notification("OPEN"), channel: "TELEGRAM" });
      await deliverPendingNotifications(async () => incident);
      expect(timeout).toHaveBeenCalledWith(10_000);
      expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
      expect(rows[0]).toMatchObject({ status: "FAILED", attempts: 1, sentAt: null });
      expect(rows[0].error).toContain("TimeoutError");
      expect(rows[0].error).not.toContain("secret-like-provider-message");
    } finally { vi.unstubAllEnvs(); }
  });
  it("does not start another notification when shutdown was requested", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    rows.push(notification("OPEN"));
    await deliverPendingNotifications(async () => incident, { stopping: () => true });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(rows[0].attempts).toBe(0);
  });
  it("formats a minimal acceptance payload without raw evidence facts", () => {
    const payload = webhookPayload(notification("OPEN"), incident);
    expect(payload).toMatchObject({ schemaVersion: 1, event: "incident", notificationType: "OPEN", incident: { id: incident.id, status: "OPEN", severity: "WARNING", monitorType: "RPC_HEALTH", acceptance: true, detectedAt: incident.openedAt } });
    expect(JSON.stringify(payload)).toContain("M5B_WEBHOOK_ACCEPTANCE");
    expect(JSON.stringify(payload)).not.toContain("must-not-leak");
  });

  it("signs OPEN and RECOVERED once and remains idempotent across dispatch calls", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    await queueNotifications(incident.id, "OPEN", ["WEBHOOK"]);
    await queueNotifications(incident.id, "OPEN", ["WEBHOOK"]);
    expect(rows).toHaveLength(1);
    await deliverPendingNotifications(async () => incident, { incidentId: incident.id, channel: "WEBHOOK" });
    await deliverPendingNotifications(async () => incident, { incidentId: incident.id, channel: "WEBHOOK" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(rows[0]).toMatchObject({ status: "SENT", attempts: 1 });
    const [url, request] = fetchMock.mock.calls[0] as [string, { body: string; headers: Record<string, string> }];
    expect(url).toBe("http://127.0.0.1:3001/m5b");
    const correct = `sha256=${createHmac("sha256", "unit-test-secret").update(request.body).digest("hex")}`;
    const wrong = `sha256=${createHmac("sha256", "wrong-secret").update(request.body).digest("hex")}`;
    expect(request.headers["x-sentinel-signature"]).toBe(correct);
    expect(request.headers["x-sentinel-signature"]).not.toBe(wrong);
    expect(request.headers["idempotency-key"]).toBe(`incident:${incident.id}:OPEN`);

    const recovered: IncidentRecord = { ...incident, status: "RECOVERED", recoveredAt: "2026-09-24T00:01:00.000Z" };
    await queueNotifications(incident.id, "RECOVERED", ["WEBHOOK"]);
    await deliverPendingNotifications(async () => recovered, { incidentId: incident.id, channel: "WEBHOOK" });
    await queueNotifications(incident.id, "RECOVERED", ["WEBHOOK"]);
    await deliverPendingNotifications(async () => recovered, { incidentId: incident.id, channel: "WEBHOOK" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.status)).toEqual(["SENT", "SENT"]);
    const recoveryRequest = fetchMock.mock.calls[1][1] as { body: string; headers: Record<string, string> };
    expect(JSON.parse(recoveryRequest.body)).toMatchObject({ notificationType: "RECOVERED", incident: { status: "RECOVERED", recoveredAt: recovered.recoveredAt } });
    expect(recoveryRequest.headers["idempotency-key"]).toBe(`incident:${incident.id}:RECOVERED`);
  });

  it("records HTTP failure, preserves evidence, applies backoff, and caps attempts", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal("fetch", fetchMock);
    const originalEvidence = JSON.stringify(incident.evidence);
    rows.push(notification("OPEN"));
    await deliverPendingNotifications(async () => incident, { incidentId: incident.id, channel: "WEBHOOK" });
    expect(rows[0]).toMatchObject({ status: "FAILED", attempts: 1, error: "Webhook HTTP 500" });
    await deliverPendingNotifications(async () => incident, { incidentId: incident.id, channel: "WEBHOOK" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    rows[0].attempts = 5;
    rows[0].updatedAt = new Date(0);
    await deliverPendingNotifications(async () => incident, { incidentId: incident.id, channel: "WEBHOOK" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(incident.evidence)).toBe(originalEvidence);
    expect(JSON.stringify(rows[0])).not.toContain("unit-test-secret");
  });
});
