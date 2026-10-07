export const monitorTypes = [
  "RPC_HEALTH",
  "TREASURY",
  "ADMIN",
  "ICM_DELIVERY",
  "CUSTOM_EVENT",
  "VALIDATOR_HEALTH",
] as const;

export type MonitorType = (typeof monitorTypes)[number];
export type MonitorStatus = "HEALTHY" | "DEGRADED" | "DOWN" | "UNKNOWN";
export type Severity = "INFO" | "WARNING" | "CRITICAL";
export type IncidentStatus = "OPEN" | "ACKNOWLEDGED" | "RECOVERED";
export type JsonObject = Record<string, unknown>;

export type EvidenceSnapshot = {
  chainId: string;
  chainName: string;
  target?: string;
  rule: string;
  observedAt: string;
  provenance: "rpc" | "log" | "icm" | "validator" | "demo";
  txHash?: string;
  blockNumber?: string;
  logIndex?: number;
  facts: JsonObject;
};

export type ChainRecord = {
  id: string;
  name: string;
  chainId: string;
  rpcUrl: string;
  explorerUrl?: string | null;
  enabled: boolean;
};

export type MonitorRecord = {
  id: string;
  type: MonitorType;
  chainId: string;
  target?: string | null;
  config: JsonObject;
  intervalSec: number;
  enabled: boolean;
  status: MonitorStatus;
  lastCheckAt?: string | null;
  latencyMs?: number | null;
  lastError?: string | null;
  cursorBlock?: string | null;
  consecutiveFail?: number;
  stale?: boolean;
  recordedStatus?: MonitorStatus;
  chain: Pick<ChainRecord, "id" | "name" | "chainId" | "explorerUrl">;
};

export type IncidentEventRecord = {
  id: string;
  type: string;
  message: string;
  evidence: EvidenceSnapshot;
  createdAt: string;
};

export type IncidentRecord = {
  id: string;
  monitorId: string;
  severity: Severity;
  status: IncidentStatus;
  title: string;
  summary?: string | null;
  evidence: EvidenceSnapshot;
  openedAt: string;
  acknowledgedAt?: string | null;
  recoveredAt?: string | null;
  monitor?: Pick<MonitorRecord, "id" | "type" | "target" | "chain">;
  events?: IncidentEventRecord[];
};

export type OverviewRecord = {
  worker?: { status: "RUNNING" | "STALE" | "UNKNOWN"; lastHeartbeatAt: string | null };
  overallStatus: "HEALTHY" | "DEGRADED" | "CRITICAL" | "UNKNOWN";
  openIncidents: number;
  criticalIncidents: number;
  activeMonitors: number;
  lastCheckAt?: string | null;
  monitorStatuses: Array<{ type: MonitorType; status: MonitorStatus; count: number }>;
  recentIncidents: IncidentRecord[];
};
