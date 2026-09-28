import type { ChainRecord, IncidentRecord, MonitorRecord, OverviewRecord } from "@/contracts/domain";

export type ApiErrorBody = { error: { code: string; message: string; details?: unknown } };
export type ApiData<T> = { data: T };

export type OverviewResponse = ApiData<OverviewRecord>;
export type MonitorListResponse = ApiData<{ monitors: MonitorRecord[] }>;
export type ChainListResponse = ApiData<{ chains: ChainRecord[] }>;
export type IncidentListResponse = ApiData<{ incidents: IncidentRecord[]; nextCursor?: string }>;
export type IncidentDetailResponse = ApiData<{ incident: IncidentRecord }>;
export type IncidentSummaryResponse = ApiData<{ summary: string; evidenceHash: string; generatedAt: string; source: "AI" }>;
export type AdminSessionResponse = ApiData<{ expiresAt: string }>;
