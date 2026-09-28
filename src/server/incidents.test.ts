import { describe, expect, it } from "vitest";
import { eventDedupeKey, type IncidentCandidate } from "./incidents";

function candidate(evidence: IncidentCandidate["evidence"]): IncidentCandidate {
  return {
    monitorId: "monitor_1",
    severity: "WARNING",
    title: "test",
    message: "test",
    eventType: "TEST_EVENT",
    evidence,
  };
}

describe("eventDedupeKey", () => {
  it("uses transaction hash and log index for on-chain evidence", () => {
    expect(eventDedupeKey(candidate({
      chainId: "43113",
      chainName: "Fuji",
      rule: "Transfer",
      observedAt: "2026-01-01T00:00:00.000Z",
      provenance: "log",
      facts: {},
      txHash: "0xAbC",
      logIndex: 7,
    }))).toBe("tx:0xabc:7");
  });

  it("uses the stable rule for repeated state-derived evidence", () => {
    expect(eventDedupeKey(candidate({
      chainId: "43113",
      chainName: "Fuji",
      rule: "RPC latency > 2000ms",
      observedAt: "2026-01-01T00:00:00.000Z",
      provenance: "rpc",
      facts: { latencyMs: 3000 },
    }))).toBe("state:RPC latency > 2000ms");
  });
});
