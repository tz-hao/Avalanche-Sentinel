export function exceedsAtomicThreshold(observed: bigint, thresholdAtomic: string) {
  return observed > BigInt(thresholdAtomic);
}

export function treasurySenderMatches(sender: string | undefined, treasuryAddress: string) {
  return sender?.toLowerCase() === treasuryAddress.toLowerCase();
}

export function formatAtomicAmount(amount: bigint, decimals: number) {
  if (decimals === 0) return amount.toString();
  const padded = amount.toString().padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals);
  const fractional = padded.slice(-decimals).replace(/0+$/, "");
  return fractional ? `${whole}.${fractional}` : whole;
}

export function rpcChainIdMatches(expectedChainId: bigint, observedChainId: number) {
  return expectedChainId === BigInt(observedChainId);
}

export function rpcSeverity(consecutiveFailures: number, latencyMs: number | null, failureThreshold: number, latencyThresholdMs: number) {
  if (consecutiveFailures >= failureThreshold) return "CRITICAL" as const;
  if (latencyMs !== null && latencyMs > latencyThresholdMs) return "WARNING" as const;
  return null;
}

export function monitorStatusForRpc(consecutiveFailures: number, latencyMs: number | null, failureThreshold: number, latencyThresholdMs: number) {
  if (consecutiveFailures >= failureThreshold) return "DOWN" as const;
  if (latencyMs !== null && latencyMs > latencyThresholdMs) return "DEGRADED" as const;
  return "HEALTHY" as const;
}
