import { describe, expect, it } from "vitest";
import { exceedsAtomicThreshold, formatAtomicAmount, monitorStatusForRpc, rpcChainIdMatches, rpcSeverity, treasurySenderMatches } from "./rules";

describe("monitor rules", () => {
  it("compares asset quantities exactly as bigint", () => {
    expect(exceedsAtomicThreshold(1000000000000000001n, "1000000000000000000")).toBe(true);
    expect(exceedsAtomicThreshold(1000000000000000000n, "1000000000000000000")).toBe(false);
  });

  it("does not create a critical RPC state before the configured failure threshold", () => {
    expect(rpcSeverity(2, null, 3, 2000)).toBeNull();
    expect(monitorStatusForRpc(2, null, 3, 2000)).toBe("HEALTHY");
    expect(rpcSeverity(3, null, 3, 2000)).toBe("CRITICAL");
    expect(monitorStatusForRpc(3, null, 3, 2000)).toBe("DOWN");
  });

  it("rejects an RPC endpoint connected to a different chain", () => {
    expect(rpcChainIdMatches(43113n, 43113)).toBe(true);
    expect(rpcChainIdMatches(43113n, 43114)).toBe(false);
  });

  it("matches treasury senders case-insensitively and compares values as bigint", () => {
    const rawAmount = 9_007_199_254_740_993n;
    expect(treasurySenderMatches("0xAbCd000000000000000000000000000000000000", "0xabcd000000000000000000000000000000000000")).toBe(true);
    expect(treasurySenderMatches("0xAbCd000000000000000000000000000000000000", "0x0000000000000000000000000000000000000001")).toBe(false);
    expect(exceedsAtomicThreshold(rawAmount, "9007199254740992")).toBe(true);
    expect(exceedsAtomicThreshold(rawAmount, "9007199254740993")).toBe(false);
    expect(formatAtomicAmount(20000000n, 6)).toBe("20");
  });
});
