import type { AdminSessionResponse, ChainListResponse, IncidentDetailResponse, IncidentListResponse, IncidentSummaryResponse, MonitorListResponse, OverviewResponse } from "@/contracts/api";
import type { CreateMonitorInput } from "@/contracts/monitor-config";

export class SentinelApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) }, credentials: "same-origin" });
  const body = await response.json().catch(() => null) as T | { error?: { code?: string; message?: string } } | null;
  if (!response.ok) {
    const error = body as { error?: { code?: string; message?: string } } | null;
    throw new SentinelApiError(response.status, error?.error?.code ?? "REQUEST_FAILED", error?.error?.message ?? "请求失败，请重试。");
  }
  return body as T;
}

export const sentinelApi = {
  login: (password: string) => request<AdminSessionResponse>("/api/v1/admin/session", { method: "POST", body: JSON.stringify({ password }) }),
  logout: () => request<{ data: { loggedOut: true } }>("/api/v1/admin/session", { method: "DELETE" }),
  overview: () => request<OverviewResponse>("/api/v1/overview"),
  chains: () => request<ChainListResponse>("/api/v1/chains"),
  monitors: () => request<MonitorListResponse>("/api/v1/monitors"),
  createMonitor: (input: CreateMonitorInput) => request("/api/v1/monitors", { method: "POST", body: JSON.stringify(input) }),
  updateMonitor: (id: string, patch: { enabled?: boolean; intervalSec?: number }) => request(`/api/v1/monitors/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  incidents: (filters?: URLSearchParams) => request<IncidentListResponse>(`/api/v1/incidents${filters?.size ? `?${filters}` : ""}`),
  incident: (id: string) => request<IncidentDetailResponse>(`/api/v1/incidents/${id}`),
  acknowledge: (id: string) => request<IncidentDetailResponse>(`/api/v1/incidents/${id}/ack`, { method: "POST" }),
  generateSummary: (id: string) => request<IncidentSummaryResponse>(`/api/v1/incidents/${id}/summary`, { method: "POST" }),
};
