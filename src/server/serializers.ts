import type { Chain, Incident, IncidentEvent, Monitor, MonitorState } from "@prisma/client";
import type { EvidenceSnapshot, IncidentEventRecord, IncidentRecord, MonitorRecord } from "@/contracts/domain";

type MonitorWithChain = Monitor & { chain: Chain; state: MonitorState | null };
type IncidentWithMonitor = Incident & { monitor: (Monitor & { chain: Chain }) | null; events?: IncidentEvent[] };

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asEvidence(value: unknown): EvidenceSnapshot {
  const raw = asObject(value);
  return {
    chainId: String(raw.chainId ?? ""),
    chainName: String(raw.chainName ?? ""),
    ...(typeof raw.target === "string" ? { target: raw.target } : {}),
    rule: String(raw.rule ?? ""),
    observedAt: String(raw.observedAt ?? ""),
    provenance: ["rpc", "log", "icm", "validator", "demo"].includes(String(raw.provenance)) ? String(raw.provenance) as EvidenceSnapshot["provenance"] : "rpc",
    ...(typeof raw.txHash === "string" ? { txHash: raw.txHash } : {}),
    ...(typeof raw.blockNumber === "string" ? { blockNumber: raw.blockNumber } : {}),
    ...(typeof raw.logIndex === "number" ? { logIndex: raw.logIndex } : {}),
    facts: asObject(raw.facts),
  };
}

export function serializeMonitor(monitor: MonitorWithChain): MonitorRecord {
  return {
    id: monitor.id,
    type: monitor.type,
    chainId: monitor.chainId,
    target: monitor.target,
    config: asObject(monitor.configJson),
    intervalSec: monitor.intervalSec,
    enabled: monitor.enabled,
    status: monitor.status,
    lastCheckAt: monitor.state?.lastCheckAt?.toISOString() ?? null,
    latencyMs: monitor.state?.latencyMs ?? null,
    lastError: monitor.state?.lastError ?? null,
    chain: { id: monitor.chain.id, name: monitor.chain.name, chainId: monitor.chain.chainId.toString(), explorerUrl: monitor.chain.explorerUrl },
  };
}

export function serializeIncidentEvent(event: IncidentEvent): IncidentEventRecord {
  return { id: event.id, type: event.type, message: event.message, evidence: asEvidence(event.evidenceJson), createdAt: event.createdAt.toISOString() };
}

export function serializeIncident(incident: IncidentWithMonitor): IncidentRecord {
  return {
    id: incident.id,
    monitorId: incident.monitorId,
    severity: incident.severity,
    status: incident.status,
    title: incident.title,
    summary: incident.summary,
    evidence: asEvidence(incident.evidenceJson),
    openedAt: incident.openedAt.toISOString(),
    acknowledgedAt: incident.acknowledgedAt?.toISOString() ?? null,
    recoveredAt: incident.recoveredAt?.toISOString() ?? null,
    ...(incident.monitor ? { monitor: { id: incident.monitor.id, type: incident.monitor.type, target: incident.monitor.target, chain: { id: incident.monitor.chain.id, name: incident.monitor.chain.name, chainId: incident.monitor.chain.chainId.toString(), explorerUrl: incident.monitor.chain.explorerUrl } } } : {}),
    ...(incident.events ? { events: incident.events.map(serializeIncidentEvent) } : {}),
  };
}
