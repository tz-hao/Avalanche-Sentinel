import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ client: { getBlockNumber: vi.fn(), getLogs: vi.fn() }, record: vi.fn(), incident: vi.fn(), notification: vi.fn() }));
vi.mock("viem", async original => ({ ...await original<typeof import("viem")>(), createPublicClient: () => mocks.client }));
vi.mock("@/server/db", () => ({ prisma: {} }));
vi.mock("@/server/monitors", () => ({ recordMonitorStatus: mocks.record }));
vi.mock("@/server/incidents", () => ({ findOrCreateOpenIncident: mocks.incident, recoverOpenIncident: vi.fn(), recoverIncidentForSourceTx: vi.fn() }));
vi.mock("@/server/notifications", () => ({ queueNotifications: mocks.notification }));
import { runMonitor } from "./monitor-runner";

afterEach(() => vi.clearAllMocks());
it("persists safe scanner failure state without advancing cursor or creating an Incident", async () => {
  const error = new Error("provider failed with private data");
  mocks.client.getBlockNumber.mockRejectedValue(error);
  const monitor = { id: "m", type: "ADMIN", target: "0x" + "11".repeat(20), configJson: { eventKinds: ["OWNERSHIP"] }, chain: { chainId: 43113n, name: "Fuji", rpcUrl: "https://example.test" }, state: { consecutiveFail: 2, cursorBlock: 123n } } as unknown as Parameters<typeof runMonitor>[0];
  await expect(runMonitor(monitor)).rejects.toBe(error);
  expect(mocks.record).toHaveBeenCalledWith("m", "DEGRADED", { consecutiveFail: 3, lastError: "Error" });
  expect(mocks.incident).not.toHaveBeenCalled();
  expect(mocks.notification).not.toHaveBeenCalled();
});

it("clears the failure streak when scanning succeeds and persists the confirmed cursor", async () => {
  mocks.client.getBlockNumber.mockResolvedValue(125n);
  mocks.client.getLogs.mockResolvedValue([]);
  const monitor = { id: "m", type: "ADMIN", target: "0x" + "11".repeat(20), configJson: { eventKinds: ["OWNERSHIP"] }, chain: { chainId: 43113n, name: "Fuji", rpcUrl: "https://example.test" }, state: { consecutiveFail: 3, cursorBlock: 123n } } as unknown as Parameters<typeof runMonitor>[0];
  await runMonitor(monitor);
  expect(mocks.record).toHaveBeenCalledWith("m", "HEALTHY", { cursorBlock: 125n, lastError: null, consecutiveFail: 0 });
  expect(mocks.incident).not.toHaveBeenCalled();
});
