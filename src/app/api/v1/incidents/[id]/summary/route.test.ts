import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), getIncident: vi.fn(), generate: vi.fn() }));
vi.mock("@/server/route-auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/server/incidents", () => ({ getIncident: mocks.getIncident }));
vi.mock("@/server/ai-summary", () => ({ generateIncidentSummary: mocks.generate }));

import { POST } from "./route";

const context = { params: Promise.resolve({ id: "incident-test" }) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  mocks.requireAdmin.mockResolvedValue({ response: null });
  mocks.getIncident.mockResolvedValue({ id: "incident-test", evidence: { facts: {} } });
});
afterEach(() => { vi.restoreAllMocks(); });

describe("POST incident summary", () => {
  it.each([
    [402, "AI_SUMMARY_BALANCE_REQUIRED"],
    [429, "AI_SUMMARY_RATE_LIMITED"],
    [401, "AI_SUMMARY_AUTH_FAILED"],
    [403, "AI_SUMMARY_AUTH_FAILED"],
  ])("returns a safe actionable code for provider HTTP %s", async (status, code) => {
    mocks.generate.mockRejectedValue(new Error(`AI_SUMMARY_HTTP_${status}`));
    const response = await POST(new Request("http://localhost/api/v1/incidents/incident-test/summary", { method: "POST" }), context);
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe(code);
  });
  it("requires an administrator before reading the Incident or invoking AI", async () => {
    mocks.requireAdmin.mockResolvedValue({ response: Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 }) });
    const response = await POST(new Request("http://localhost/api/v1/incidents/incident-test/summary", { method: "POST" }), context);
    expect(response.status).toBe(401);
    expect(mocks.getIncident).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("returns a clear unavailable state without configuration", async () => {
    mocks.generate.mockResolvedValue(null);
    const response = await POST(new Request("http://localhost/api/v1/incidents/incident-test/summary", { method: "POST" }), context);
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("AI_NOT_CONFIGURED");
  });

  it("returns a non-persisted, hash-linked summary on success", async () => {
    mocks.generate.mockResolvedValue({ summary: "仅根据证据生成的摘要。", evidenceHash: "a".repeat(64), provider: "local", model: "test" });
    const response = await POST(new Request("http://localhost/api/v1/incidents/incident-test/summary", { method: "POST" }), context);
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ summary: "仅根据证据生成的摘要。", evidenceHash: "a".repeat(64), source: "AI" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("keeps the Incident API safe on provider failure", async () => {
    mocks.generate.mockRejectedValue(new Error("AI_SUMMARY_MALFORMED_OUTPUT"));
    const response = await POST(new Request("http://localhost/api/v1/incidents/incident-test/summary", { method: "POST" }), context);
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("AI_SUMMARY_UNAVAILABLE");
  });

  it("returns an actionable timeout without exposing the provider error", async () => {
    mocks.generate.mockRejectedValue(new DOMException("sensitive provider error", "TimeoutError"));
    const response = await POST(new Request("http://localhost/api/v1/incidents/incident-test/summary", { method: "POST" }), context);
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toMatchObject({ code: "AI_SUMMARY_TIMEOUT", message: "AI 摘要生成超时，请稍后重试。" });
    expect(JSON.stringify(body)).not.toContain("sensitive");
    expect(console.warn).toHaveBeenCalledWith("Sentinel AI summary failed", { category: "AI_SUMMARY_TIMEOUT" });
  });

  it("logs only an allowlisted category, never an arbitrary provider message", async () => {
    mocks.generate.mockRejectedValue(new Error("AI_SUMMARY_sensitive-credential-value"));
    const response = await POST(new Request("http://localhost/api/v1/incidents/incident-test/summary", { method: "POST" }), context);
    expect(response.status).toBe(503);
    expect(console.warn).toHaveBeenCalledWith("Sentinel AI summary failed", { category: "AI_SUMMARY_INTERNAL_ERROR" });
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain("sensitive-credential-value");
  });
});
