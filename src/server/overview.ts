import type { MonitorType } from "@prisma/client";
import type { OverviewRecord } from "@/contracts/domain";
import { prisma } from "@/server/db";
import { serializeIncident } from "@/server/serializers";

const types: MonitorType[] = ["RPC_HEALTH", "TREASURY", "ADMIN", "ICM_DELIVERY", "CUSTOM_EVENT", "VALIDATOR_HEALTH"];

export async function getOverview(): Promise<OverviewRecord> {
  const [openIncidents, criticalIncidents, activeMonitors, monitors, recentIncidents] = await Promise.all([
    prisma.incident.count({ where: { status: { in: ["OPEN", "ACKNOWLEDGED"] } } }),
    prisma.incident.count({ where: { status: { in: ["OPEN", "ACKNOWLEDGED"] }, severity: "CRITICAL" } }),
    prisma.monitor.count({ where: { enabled: true } }),
    prisma.monitor.findMany({ where: { enabled: true }, select: { type: true, status: true, state: { select: { lastCheckAt: true } } } }),
    prisma.incident.findMany({ take: 10, orderBy: { openedAt: "desc" }, include: { monitor: { include: { chain: true } } } }),
  ]);
  const statusPriority = { UNKNOWN: 0, HEALTHY: 1, DEGRADED: 2, DOWN: 3 } as const;
  const overallStatus = criticalIncidents > 0 || monitors.some((monitor) => monitor.status === "DOWN")
    ? "CRITICAL"
    : openIncidents > 0 || monitors.some((monitor) => monitor.status === "DEGRADED")
      ? "DEGRADED"
      : monitors.length > 0 && monitors.every((monitor) => monitor.status === "HEALTHY") ? "HEALTHY" : "UNKNOWN";
  const lastCheckAt = monitors.reduce<Date | null>((latest, monitor) => !monitor.state?.lastCheckAt || (latest && latest > monitor.state.lastCheckAt) ? latest : monitor.state.lastCheckAt, null);
  return {
    overallStatus,
    openIncidents,
    criticalIncidents,
    activeMonitors,
    lastCheckAt: lastCheckAt?.toISOString() ?? null,
    monitorStatuses: types.map((type) => {
      const selected = monitors.filter((monitor) => monitor.type === type);
      const status = selected.reduce<"HEALTHY" | "DEGRADED" | "DOWN" | "UNKNOWN">((current, monitor) => statusPriority[monitor.status] > statusPriority[current] ? monitor.status : current, "UNKNOWN");
      return { type, status, count: selected.length };
    }),
    recentIncidents: recentIncidents.map(serializeIncident),
  };
}
