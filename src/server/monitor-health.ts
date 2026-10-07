import type { MonitorStatus } from "@/contracts/domain";

export const WORKER_HEARTBEAT_STALE_MS = 30_000;

export function monitorHealth(status: MonitorStatus, enabled: boolean, intervalSec: number, lastCheckAt: Date | null | undefined, now = Date.now()) {
  const stale = enabled && (!lastCheckAt || now - lastCheckAt.getTime() > Math.max(60_000, intervalSec * 3_000));
  return { stale, status: stale && (status === "HEALTHY" || status === "UNKNOWN") ? "UNKNOWN" as const : status };
}

export function workerHealth(lastHeartbeatAt: Date | null | undefined, now = Date.now()) {
  return { status: !lastHeartbeatAt ? "UNKNOWN" as const : now - lastHeartbeatAt.getTime() > WORKER_HEARTBEAT_STALE_MS ? "STALE" as const : "RUNNING" as const, lastHeartbeatAt: lastHeartbeatAt?.toISOString() ?? null };
}
