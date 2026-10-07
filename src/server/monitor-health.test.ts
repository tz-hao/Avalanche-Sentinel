import { describe, expect, it } from "vitest";
import { monitorHealth, workerHealth } from "./monitor-health";

describe("health freshness", () => {
  it("never displays stale successful checks as healthy", () => {
    expect(monitorHealth("HEALTHY", true, 30, new Date(0), 90_001)).toEqual({ stale: true, status: "UNKNOWN" });
    expect(monitorHealth("HEALTHY", true, 30, new Date(0), 90_000).status).toBe("HEALTHY");
    expect(monitorHealth("HEALTHY", true, 3600, new Date(0), 90_001).stale).toBe(false);
    expect(monitorHealth("HEALTHY", true, 30, null).status).toBe("UNKNOWN");
    expect(monitorHealth("DOWN", true, 30, new Date(0), 100_000).status).toBe("DOWN");
    expect(monitorHealth("HEALTHY", false, 30, new Date(0), 100_000).stale).toBe(false);
  });
  it("distinguishes absent, fresh and expired worker heartbeats", () => {
    expect(workerHealth(null).status).toBe("UNKNOWN");
    expect(workerHealth(new Date(0), 30_000).status).toBe("RUNNING");
    expect(workerHealth(new Date(0), 30_001).status).toBe("STALE");
  });
});
