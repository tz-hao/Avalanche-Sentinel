import type { IncidentStatus, Prisma, Severity } from "@prisma/client";
import type { EvidenceSnapshot } from "@/contracts/domain";
import { prisma } from "@/server/db";
import { serializeIncident } from "@/server/serializers";
import { incidentQuerySchema, type IncidentQuery } from "@/contracts/incident-query";

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

export async function listIncidentPage(input: Partial<IncidentQuery>) {
  const filters = incidentQuerySchema.parse(input);
  let anchor: { openedAt: Date; id: string } | undefined;
  if (filters.cursor) {
    try {
      const parsed = JSON.parse(Buffer.from(filters.cursor, "base64url").toString("utf8"));
      if (typeof parsed.id !== "string" || !parsed.id || typeof parsed.at !== "string" || !Number.isFinite(Date.parse(parsed.at))) throw new Error();
      anchor = { id: parsed.id, openedAt: new Date(parsed.at) };
    } catch { throw new Error("INVALID_INCIDENT_CURSOR"); }
  }
  const clauses: Prisma.IncidentWhereInput[] = [];
  if (filters.q) clauses.push({ OR: [...["id", "title", "monitorId"].map<Prisma.IncidentWhereInput>(field => ({ [field]: { contains: filters.q, mode: "insensitive" } })),
    { evidenceJson: { path: ["txHash"], string_contains: filters.q } },
    { evidenceJson: { path: ["target"], string_contains: filters.q } },
    { evidenceJson: { path: ["rule"], string_contains: filters.q } },
  ] });
  if (anchor) clauses.push({ OR: [{ openedAt: { lt: anchor.openedAt } }, { openedAt: anchor.openedAt, id: { lt: anchor.id } }] });
  const incidents = await prisma.incident.findMany({
    where: { ...(filters.severity ? { severity: filters.severity } : {}), ...(filters.status ? { status: filters.status } : {}), ...(filters.from || filters.to ? { openedAt: { ...(filters.from ? { gte: new Date(filters.from) } : {}), ...(filters.to ? { lte: new Date(filters.to) } : {}) } } : {}), ...(clauses.length ? { AND: clauses } : {}) },
    include: { monitor: { include: { chain: true } } },
    orderBy: [{ openedAt: "desc" }, { id: "desc" }],
    take: filters.limit + 1,
  });
  const page = incidents.slice(0, filters.limit);
  const last = page.at(-1);
  return { incidents: page.map(serializeIncident), ...(incidents.length > filters.limit && last ? { nextCursor: Buffer.from(JSON.stringify({ id: last.id, at: last.openedAt.toISOString() })).toString("base64url") } : {}) };
}

export async function listIncidents(filters: Partial<IncidentQuery>) {
  return (await listIncidentPage(filters)).incidents;
}

export async function getIncident(id: string) {
  const incident = await prisma.incident.findUnique({ where: { id }, include: incidentInclude });
  return incident ? serializeIncident(incident) : null;
}
