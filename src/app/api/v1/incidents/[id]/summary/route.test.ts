import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), getIncident: vi.fn(), generate: vi.fn() }));
vi.mock("@/server/route-auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/server/incidents", () => ({ getIncident: mocks.getIncident }));
vi.mock("@/server/ai-summary", () => ({ generateIncidentSummary: mocks.generate }));

import { POST } from "./route";

const context = { params: Promise.resolve({ id: "incident-test" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ response: null });
  mocks.getIncident.mockResolvedValue({ id: "incident-test", evidence: { facts: {} } });
});

describe("POST incident summary", () => {
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
});
