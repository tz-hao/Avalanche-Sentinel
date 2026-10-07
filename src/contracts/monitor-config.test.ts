import { describe, expect, it } from "vitest";
import { createMonitorSchema } from "@/contracts/monitor-config";

describe("monitor input validation", () => {
  it("rejects executable custom rules and non-integer event fields", () => {
    const base = { type: "CUSTOM_EVENT", chainId: "chain_1", target: "0x" + "11".repeat(20) };
    expect(createMonitorSchema.safeParse({ ...base, config: { eventAbi: "event Transfer(address indexed from, uint256 value)", valueField: "value", thresholdAtomic: "9007199254740993" } }).success).toBe(true);
    expect(createMonitorSchema.safeParse({ ...base, config: { eventAbi: "event Transfer(address indexed from, uint256 value)", valueField: "from", thresholdAtomic: "1" } }).success).toBe(false);
    expect(createMonitorSchema.safeParse({ ...base, config: { eventAbi: "alert('x')", valueField: "value", thresholdAtomic: "1" } }).success).toBe(false);
  });
  it("rejects floating point treasury thresholds", () => {
    const result = createMonitorSchema.safeParse({
      type: "TREASURY",
      chainId: "chain_1",
      target: "0x0000000000000000000000000000000000000001",
      intervalSec: 30,
      config: { asset: { symbol: "USDC", decimals: 6 }, thresholdAtomic: "10.5" },
    });
    expect(result.success).toBe(false);
  });

  it("requires an explicit ICM destination contract", () => {
    const result = createMonitorSchema.safeParse({
      type: "ICM_DELIVERY",
      chainId: "chain_1",
      target: "0x0000000000000000000000000000000000000001",
      config: { destinationChainId: "43113", destinationRpcUrl: "https://example.test", sourceEventTopic: `0x${"0".repeat(64)}`, destinationEventTopic: `0x${"0".repeat(64)}` },
    });
    expect(result.success).toBe(false);
  });

  it("accepts only numeric RPC expected chain overrides", () => {
    const valid = createMonitorSchema.safeParse({ type: "RPC_HEALTH", chainId: "chain_1", config: { expectedChainId: "43113" } });
    const invalid = createMonitorSchema.safeParse({ type: "RPC_HEALTH", chainId: "chain_1", config: { expectedChainId: "fuji" } });
    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
  });

  it("accepts only valid RPC URL overrides", () => {
    const valid = createMonitorSchema.safeParse({ type: "RPC_HEALTH", chainId: "chain_1", config: { rpcUrl: "https://example.test/rpc" } });
    const invalid = createMonitorSchema.safeParse({ type: "RPC_HEALTH", chainId: "chain_1", config: { rpcUrl: "not-a-url" } });
    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
  });

  it("accepts only bounded ADMIN scan ranges", () => {
    const base = { type: "ADMIN", chainId: "chain_1", target: "0x0000000000000000000000000000000000000001", config: { eventKinds: ["OWNERSHIP"] } };
    const valid = createMonitorSchema.safeParse({ ...base, config: { ...base.config, fromBlock: "41064464", toBlock: "41064468" } });
    const reversed = createMonitorSchema.safeParse({ ...base, config: { ...base.config, fromBlock: "41064468", toBlock: "41064464" } });
    const malformed = createMonitorSchema.safeParse({ ...base, config: { ...base.config, fromBlock: "41064464.5", toBlock: "41064468" } });
    expect(valid.success).toBe(true);
    expect(reversed.success).toBe(false);
    expect(malformed.success).toBe(false);
  });

  it("accepts only bounded TREASURY scan ranges", () => {
    const base = { type: "TREASURY", chainId: "chain_1", target: "0x0000000000000000000000000000000000000001", config: { asset: { address: "0x0000000000000000000000000000000000000002", symbol: "USDC", decimals: 6 }, thresholdAtomic: "1000000" } };
    const valid = createMonitorSchema.safeParse({ ...base, config: { ...base.config, fromBlock: "58482508", toBlock: "58482510" } });
    const reversed = createMonitorSchema.safeParse({ ...base, config: { ...base.config, fromBlock: "58482510", toBlock: "58482508" } });
    expect(valid.success).toBe(true);
    expect(reversed.success).toBe(false);
  });
});
