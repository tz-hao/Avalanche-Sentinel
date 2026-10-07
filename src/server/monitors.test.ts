import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ chain: { findUnique: vi.fn() }, monitor: { create: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), updateMany: vi.fn(), update: vi.fn() }, monitorState: { update: vi.fn() } }));
vi.mock("@/server/db", () => ({ prisma: { ...mocks, $transaction: (fn: (tx: typeof mocks) => unknown) => fn(mocks) } }));
import { createMonitor, updateMonitor } from "./monitors";

const current = () => ({ id: "m", type: "RPC_HEALTH", chainId: "c", target: null, configJson: { latencyThresholdMs: 2000, production: true }, intervalSec: 30, enabled: false, status: "HEALTHY", chain: { id: "c", chainId: 43113n, name: "Fuji" }, state: { cursorBlock: 123n, consecutiveFail: 0, lastCheckAt: new Date() } });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.chain.findUnique.mockResolvedValue({ enabled: true });
  mocks.monitor.create.mockResolvedValue(current());
  mocks.monitor.findUnique.mockResolvedValue(current());
  mocks.monitor.findUniqueOrThrow.mockResolvedValue(current());
  mocks.monitor.updateMany.mockResolvedValue({ count: 1 });
});
describe("monitor management", () => {
  it("creates disabled by default but honors explicit enabled requests", async () => {
    await createMonitor({ type: "RPC_HEALTH", chainId: "c", intervalSec: 30, config: {} });
    expect(mocks.monitor.create.mock.calls[0][0].data.enabled).toBe(false);
    await createMonitor({ type: "RPC_HEALTH", chainId: "c", intervalSec: 30, config: {}, enabled: true });
    expect(mocks.monitor.create.mock.calls[1][0].data.enabled).toBe(true);
  });
  it("rejects config editing while enabled and rejects invalid configuration", async () => {
    mocks.monitor.findUnique.mockResolvedValue({ ...current(), enabled: true });
    await expect(updateMonitor("m", { intervalSec: 60 })).rejects.toThrow("MONITOR_MUST_BE_DISABLED");
    expect(mocks.monitor.updateMany).not.toHaveBeenCalled();
    mocks.monitor.findUnique.mockResolvedValue(current());
    await expect(updateMonitor("m", { config: { consecutiveFailureThreshold: -1 } })).rejects.toThrow();
    expect(mocks.monitor.updateMany).not.toHaveBeenCalled();
  });
  it("requires an idle lease for editing and resets freshness without erasing cursor", async () => {
    await updateMonitor("m", { intervalSec: 60 });
    expect(mocks.monitor.updateMany.mock.calls[0][0].where).toMatchObject({ enabled: false, state: { OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: expect.any(Date) } }] } });
    const state = mocks.monitorState.update.mock.calls[0][0].data;
    expect(state).toMatchObject({ lastCheckAt: null, lastStatus: "UNKNOWN" });
    expect(state).not.toHaveProperty("cursorBlock");
    mocks.monitor.updateMany.mockResolvedValue({ count: 0 });
    await expect(updateMonitor("m", { intervalSec: 60 })).rejects.toThrow("MONITOR_BUSY");
  });
});
