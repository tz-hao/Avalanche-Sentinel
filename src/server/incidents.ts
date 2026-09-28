import type { IncidentStatus, Prisma, Severity } from "@prisma/client";
import type { EvidenceSnapshot } from "@/contracts/domain";
import { prisma } from "@/server/db";
import { serializeIncident } from "@/server/serializers";

const incidentInclude = { monitor: { include: { chain: true } }, events: { orderBy: { createdAt: "asc" } } } as const;

export type IncidentCandidate = {
  monitorId: string;
  severity: Severity;
  title: string;
  message: string;
  evidence: EvidenceSnapshot;
  eventType: string;
};

function evidenceDedupeKey(evidence: EvidenceSnapshot) {
  const { txHash, logIndex } = evidence;
  if (txHash !== undefined && logIndex !== undefined) return `tx:${txHash.toLowerCase()}:${logIndex}`;
  return `state:${evidence.rule}`;
}

export function eventDedupeKey(candidate: IncidentCandidate) {
  return evidenceDedupeKey(candidate.evidence);
}

export async function findOrCreateOpenIncident(candidate: IncidentCandidate) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.incident.findFirst({
      where: { monitorId: candidate.monitorId, status: { in: ["OPEN", "ACKNOWLEDGED"] } },
      orderBy: { openedAt: "desc" },
    });
    const incident = existing ?? await tx.incident.create({
      data: {
        monitorId: candidate.monitorId,
        severity: candidate.severity,
        title: candidate.title,
        evidenceJson: candidate.evidence as Prisma.InputJsonValue,
      },
    });
    if (existing && candidate.severity === "CRITICAL" && existing.severity !== "CRITICAL") {
      await tx.incident.update({ where: { id: incident.id }, data: { severity: "CRITICAL" } });
    }
    const sourceTxHash = candidate.evidence.txHash;
    const logIndex = candidate.evidence.logIndex;
    const dedupeKey = eventDedupeKey(candidate);
    const duplicate = await tx.incidentEvent.findFirst({
      where: { incidentId: incident.id, type: candidate.eventType, dedupeKey },
    });
    if (!duplicate) {
      await tx.incidentEvent.create({
        data: {
          incidentId: incident.id,
          type: candidate.eventType,
          dedupeKey,
          message: candidate.message,
          evidenceJson: candidate.evidence as Prisma.InputJsonValue,
          sourceTxHash,
          logIndex,
        },
      });
    }
    return tx.incident.findUniqueOrThrow({ where: { id: incident.id }, include: incidentInclude });
  }, { maxWait: 10_000, timeout: 20_000 }).then(serializeIncident);
}

export async function acknowledgeIncident(id: string) {
  const current = await prisma.incident.findUnique({ where: { id } });
  if (!current) return null;
  if (current.status === "RECOVERED" || current.status === "ACKNOWLEDGED") return serializeIncident(await prisma.incident.findUniqueOrThrow({ where: { id }, include: incidentInclude }));
  const incident = await prisma.incident.update({
    where: { id },
    data: {
      status: "ACKNOWLEDGED",
      acknowledgedAt: current.acknowledgedAt ?? new Date(),
      events: { create: { type: "ACKNOWLEDGED", dedupeKey: `ack:${id}`, message: "管理员已确认并开始处理。", evidenceJson: current.evidenceJson as Prisma.InputJsonValue } },
    },
    include: incidentInclude,
  });
  return serializeIncident(incident);
}

export async function recoverOpenIncident(monitorId: string, evidence: EvidenceSnapshot, message: string) {
  const current = await prisma.incident.findFirst({ where: { monitorId, status: { in: ["OPEN", "ACKNOWLEDGED"] } }, orderBy: { openedAt: "desc" } });
  if (!current) return null;
  const incident = await prisma.incident.update({
    where: { id: current.id },
    data: {
      status: "RECOVERED" as IncidentStatus,
      recoveredAt: new Date(),
      events: { create: { type: "RECOVERED", dedupeKey: `recovery:${evidenceDedupeKey(evidence)}`, message, evidenceJson: evidence as Prisma.InputJsonValue, sourceTxHash: evidence.txHash, logIndex: evidence.logIndex } },
    },
    include: incidentInclude,
  });
  return serializeIncident(incident);
}

export async function recoverIncidentForSourceTx(monitorId: string, sourceTxHash: string, evidence: EvidenceSnapshot, message: string) {
  const current = await prisma.incident.findFirst({ where: { monitorId, status: { in: ["OPEN", "ACKNOWLEDGED"] }, events: { some: { sourceTxHash } } }, orderBy: { openedAt: "desc" } });
  if (!current) return null;
  const incident = await prisma.incident.update({
    where: { id: current.id },
    data: { status: "RECOVERED", recoveredAt: new Date(), events: { create: { type: "DELIVERED", dedupeKey: `delivery:${evidenceDedupeKey(evidence)}`, message, evidenceJson: evidence as Prisma.InputJsonValue, sourceTxHash: evidence.txHash, logIndex: evidence.logIndex } } },
    include: incidentInclude,
  });
  return serializeIncident(incident);
}

export async function listIncidents(filters: { severity?: Severity; status?: IncidentStatus; limit?: number }) {
  const incidents = await prisma.incident.findMany({
    where: { ...(filters.severity ? { severity: filters.severity } : {}), ...(filters.status ? { status: filters.status } : {}) },
    include: { monitor: { include: { chain: true } } },
    orderBy: { openedAt: "desc" },
    take: Math.min(filters.limit ?? 50, 100),
  });
  return incidents.map(serializeIncident);
}

export async function getIncident(id: string) {
  const incident = await prisma.incident.findUnique({ where: { id }, include: incidentInclude });
  return incident ? serializeIncident(incident) : null;
}
