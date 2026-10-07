import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ count: vi.fn(), monitors: vi.fn(), heartbeat: vi.fn() }));
vi.mock("@/server/db", () => ({ prisma: { incident: { count: mocks.count, findMany: async () => [] }, monitor: { count: async () => 1, findMany: mocks.monitors }, workerHeartbeat: { findFirst: mocks.heartbeat } } }));
import { getOverview } from "./overview";
beforeEach(() => { vi.clearAllMocks(); mocks.count.mockResolvedValue(0); });
describe("overview real freshness", () => {
  it("requires both a current heartbeat and fresh monitor check before showing HEALTHY", async () => {
    mocks.monitors.mockResolvedValue([{ type: "RPC_HEALTH", status: "HEALTHY", intervalSec: 30, state: { lastCheckAt: new Date() } }]);
    mocks.heartbeat.mockResolvedValue({ lastHeartbeatAt: new Date(0) });
    expect((await getOverview()).overallStatus).toBe("UNKNOWN");
    mocks.heartbeat.mockResolvedValue({ lastHeartbeatAt: new Date() });
    expect((await getOverview()).overallStatus).toBe("HEALTHY");
    mocks.monitors.mockResolvedValue([{ type: "RPC_HEALTH", status: "HEALTHY", intervalSec: 30, state: { lastCheckAt: new Date(0) } }]);
    const result = await getOverview();
    expect(result.overallStatus).toBe("UNKNOWN");
    expect(result.monitorStatuses.find(m => m.type === "RPC_HEALTH")?.status).toBe("UNKNOWN");
  });
  it("never hides existing critical Incidents behind heartbeat status", async () => {
    mocks.count.mockResolvedValue(1);
    mocks.monitors.mockResolvedValue([]);
    mocks.heartbeat.mockResolvedValue(null);
    expect((await getOverview()).overallStatus).toBe("CRITICAL");
  });
});
