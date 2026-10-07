import type { Monitor, MonitorState, Chain } from "@prisma/client";
import { createPublicClient, decodeEventLog, http, parseAbiItem, toEventSelector, type Hex } from "viem";
import { adminConfigSchema, customEventConfigSchema, icmConfigSchema, rpcHealthConfigSchema, treasuryConfigSchema, validatorHealthConfigSchema } from "@/contracts/monitor-config";
import type { EvidenceSnapshot } from "@/contracts/domain";
import { findOrCreateOpenIncident, recoverIncidentForSourceTx, recoverOpenIncident } from "@/server/incidents";
import { queueNotifications } from "@/server/notifications";
import { recordMonitorStatus } from "@/server/monitors";
import { prisma } from "@/server/db";
import { safeError } from "@/server/safe-error";
import { exceedsAtomicThreshold, formatAtomicAmount, monitorStatusForRpc, rpcChainIdMatches, rpcSeverity, treasurySenderMatches } from "./rules";
import { decodeReceive, decodeSend, executionStatus, pendingSeverity, RECEIVE_TOPIC, SEND_TOPIC, type IcmLog } from "./icm-events";
import { decodeAdminEvent } from "./admin-events";

type RuntimeMonitor = Monitor & { chain: Chain; state: MonitorState | null };
const adminTopics = {
  OWNERSHIP: toEventSelector("OwnershipTransferred(address,address)"),
  ROLE: [toEventSelector("RoleGranted(bytes32,address,address)"), toEventSelector("RoleRevoked(bytes32,address,address)")],
  UPGRADE: toEventSelector("Upgraded(address)"),
};

function buildEvidence(monitor: RuntimeMonitor, rule: string, provenance: EvidenceSnapshot["provenance"], facts: Record<string, unknown>, options?: Partial<Pick<EvidenceSnapshot, "txHash" | "blockNumber" | "logIndex">>): EvidenceSnapshot {
  const acceptance = typeof monitor.configJson === "object" && monitor.configJson !== null && !Array.isArray(monitor.configJson) && (monitor.configJson as Record<string, unknown>).acceptance === true;
  return { chainId: monitor.chain.chainId.toString(), chainName: monitor.chain.name, ...(monitor.target ? { target: monitor.target } : {}), rule, observedAt: new Date().toISOString(), provenance, facts: { ...facts, ...(acceptance ? { acceptance: true } : {}) }, ...options };
}

async function openAndNotify(input: Parameters<typeof findOrCreateOpenIncident>[0]) {
  const incident = await findOrCreateOpenIncident(input);
  await queueNotifications(incident.id, input.eventType);
  return incident;
}

function clientFor(rpcUrl: string) {
  return createPublicClient({ transport: http(rpcUrl, { timeout: 10_000, retryCount: 0 }) });
}

async function runRpcHealth(monitor: RuntimeMonitor) {
  const config = rpcHealthConfigSchema.parse(monitor.configJson);
  const expectedChainId = config.expectedChainId ? BigInt(config.expectedChainId) : monitor.chain.chainId;
  const rpcUrl = config.rpcUrl ?? monitor.chain.rpcUrl;
  const rpcTarget = new URL(rpcUrl).host;
  const started = performance.now();
  try {
    const client = clientFor(rpcUrl);
    const [chainId, latestBlock] = await Promise.all([client.getChainId(), client.getBlockNumber()]);
    const latencyMs = Math.round(performance.now() - started);
    if (!rpcChainIdMatches(expectedChainId, chainId)) {
      const message = `RPC 返回 Chain ID ${chainId}，预期为 ${expectedChainId}。`;
      await recordMonitorStatus(monitor.id, "DOWN", { latencyMs, lastError: message, consecutiveFail: config.consecutiveFailureThreshold });
      await openAndNotify({ monitorId: monitor.id, severity: "CRITICAL", title: "RPC Chain ID 不匹配", message, evidence: buildEvidence(monitor, "RPC chain ID must match configured chain", "rpc", { latencyMs, expectedChainId: expectedChainId.toString(), observedChainId: chainId.toString(), rpcTarget }), eventType: "RPC_CHAIN_MISMATCH" });
      return;
    }
    const status = monitorStatusForRpc(0, latencyMs, config.consecutiveFailureThreshold, config.latencyThresholdMs);
    await recordMonitorStatus(monitor.id, status, { latencyMs, lastError: null, consecutiveFail: 0, cursorBlock: latestBlock });
    if (status === "DEGRADED") {
      await openAndNotify({ monitorId: monitor.id, severity: "WARNING", title: "RPC 延迟过高", message: `RPC 延迟 ${latencyMs}ms，超过阈值 ${config.latencyThresholdMs}ms。`, evidence: buildEvidence(monitor, `RPC latency > ${config.latencyThresholdMs}ms`, "rpc", { latencyMs, expectedChainId: expectedChainId.toString(), observedChainId: String(chainId), rpcTarget }), eventType: "RPC_LATENCY" });
    } else {
      const recovered = await recoverOpenIncident(monitor.id, buildEvidence(monitor, "RPC health recovered", "rpc", { latencyMs, expectedChainId: expectedChainId.toString(), observedChainId: String(chainId), rpcTarget }), "RPC 已恢复正常响应。");
      if (recovered) await queueNotifications(recovered.id, "RECOVERED");
    }
  } catch (error) {
    const failures = (monitor.state?.consecutiveFail ?? 0) + 1;
    const status = monitorStatusForRpc(failures, null, config.consecutiveFailureThreshold, config.latencyThresholdMs);
    const message = `RPC 请求失败 (${safeError(error)})`;
    await recordMonitorStatus(monitor.id, status, { lastError: message, consecutiveFail: failures });
    const severity = rpcSeverity(failures, null, config.consecutiveFailureThreshold, config.latencyThresholdMs);
    if (severity) await openAndNotify({ monitorId: monitor.id, severity, title: "RPC 持续不可用", message: `连续失败 ${failures} 次：${message}`, evidence: buildEvidence(monitor, `RPC consecutive failures >= ${config.consecutiveFailureThreshold}`, "rpc", { expectedChainId: expectedChainId.toString(), rpcTarget, failureType: "RPC_REQUEST_FAILURE", consecutiveFailures: failures, failureThreshold: config.consecutiveFailureThreshold, error: message }), eventType: "RPC_FAILURE" });
  }
}

async function scanTreasury(monitor: RuntimeMonitor) {
  if (!monitor.target) throw new Error("Treasury monitor missing target");
  const treasuryAddress = monitor.target;
  const config = treasuryConfigSchema.parse(monitor.configJson);
  const client = clientFor(monitor.chain.rpcUrl);
  const latest = await client.getBlockNumber();
  const fromBlock = config.fromBlock ? BigInt(config.fromBlock) : monitor.state?.cursorBlock ?? (latest > 20n ? latest - 20n : 0n);
  const toBlock = config.toBlock ? BigInt(config.toBlock) : latest;
  if (fromBlock > toBlock) throw new Error("Treasury monitor scan range is invalid");
  if (config.asset.address) {
    const logs = await client.getLogs({ address: config.asset.address as Hex, event: parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)"), fromBlock, toBlock });
    const matchingLogs = logs.filter((log) => treasurySenderMatches(log.args.from, treasuryAddress));
    const aboveThresholdLogs = matchingLogs.filter((log) => {
      const recipient = log.args.to;
      const allowlisted = typeof recipient === "string" && config.allowlist.some((entry) => entry.toLowerCase() === recipient.toLowerCase());
      return typeof log.args.value === "bigint" && exceedsAtomicThreshold(log.args.value, config.thresholdAtomic) && !allowlisted;
    });
    for (const log of aboveThresholdLogs) {
      const value = log.args.value;
      const to = log.args.to?.toLowerCase();
      if (typeof value !== "bigint") continue;
      await openAndNotify({ monitorId: monitor.id, severity: "CRITICAL", title: "Treasury 大额转出", message: `检测到 ${config.asset.symbol} 转出超过配置阈值。`, evidence: buildEvidence(monitor, `${config.asset.symbol} outflow > ${config.thresholdAtomic}`, "log", { assetType: "ERC20", asset: config.asset.symbol, tokenAddress: config.asset.address, tokenDecimals: config.asset.decimals, from: log.args.from, to: log.args.to, recipient: to, rawAmount: value.toString(), normalizedAmount: formatAtomicAmount(value, config.asset.decimals), thresholdRawAmount: config.thresholdAtomic, thresholdDisplayAmount: formatAtomicAmount(BigInt(config.thresholdAtomic), config.asset.decimals), transferLogsScanned: logs.length, treasuryMatchingLogs: matchingLogs.length, aboveThresholdLogs: aboveThresholdLogs.length }, { txHash: log.transactionHash, blockNumber: log.blockNumber.toString(), logIndex: Number(log.logIndex) }), eventType: "TREASURY_OUTFLOW" });
    }
  } else {
    for (let blockNumber = fromBlock; blockNumber <= toBlock; blockNumber++) {
      const block = await client.getBlock({ blockNumber, includeTransactions: true });
      for (const transaction of block.transactions) {
        if (typeof transaction === "string" || transaction.from.toLowerCase() !== monitor.target.toLowerCase() || !exceedsAtomicThreshold(transaction.value, config.thresholdAtomic) || config.allowlist.map((entry) => entry.toLowerCase()).includes(transaction.to?.toLowerCase() ?? "")) continue;
        await openAndNotify({ monitorId: monitor.id, severity: "CRITICAL", title: "Treasury Native 大额转出", message: "检测到 Native 资产转出超过配置阈值。", evidence: buildEvidence(monitor, `native outflow > ${config.thresholdAtomic}`, "rpc", { amountAtomic: transaction.value.toString(), recipient: transaction.to }, { txHash: transaction.hash, blockNumber: blockNumber.toString() }), eventType: "TREASURY_OUTFLOW" });
      }
    }
  }
  await recordMonitorStatus(monitor.id, "HEALTHY", { cursorBlock: toBlock, lastError: null, consecutiveFail: 0 });
}

async function scanAdmin(monitor: RuntimeMonitor) {
  if (!monitor.target) throw new Error("Admin monitor missing target");
  const config = adminConfigSchema.parse(monitor.configJson);
  const client = clientFor(monitor.chain.rpcUrl);
  const latest = await client.getBlockNumber();
  const fromBlock = config.fromBlock ? BigInt(config.fromBlock) : monitor.state?.cursorBlock ?? (latest > 20n ? latest - 20n : 0n);
  const toBlock = config.toBlock ? BigInt(config.toBlock) : latest;
  if (fromBlock > toBlock) throw new Error("Admin monitor scan range is invalid");
  const topics = [
    ...(config.eventKinds.includes("OWNERSHIP") ? [adminTopics.OWNERSHIP] : []),
    ...(config.eventKinds.includes("ROLE") ? adminTopics.ROLE : []),
    ...(config.eventKinds.includes("UPGRADE") ? [adminTopics.UPGRADE] : []),
  ];
  for (const topic of topics) {
    const logs = await client.getLogs({ address: monitor.target as Hex, topics: [topic], fromBlock, toBlock } as never);
    for (const log of logs) {
      const decoded = decodeAdminEvent(log.data, log.topics);
      await openAndNotify({ monitorId: monitor.id, severity: "CRITICAL", title: "Admin 或 Upgrade 事件", message: "检测到已配置的权限或实现变更事件，请人工复核。", evidence: buildEvidence(monitor, "Ownership / Role / Upgrade event", "log", { topic: log.topics[0], topics: log.topics, data: log.data, ...decoded }, { txHash: log.transactionHash, blockNumber: log.blockNumber.toString(), logIndex: Number(log.logIndex) }), eventType: "ADMIN_EVENT" });
    }
  }
  await recordMonitorStatus(monitor.id, "HEALTHY", { cursorBlock: toBlock, lastError: null, consecutiveFail: 0 });
}

async function scanIcm(monitor: RuntimeMonitor) {
  if (!monitor.target) throw new Error("ICM monitor missing target");
  const config = icmConfigSchema.parse(monitor.configJson);
  if (config.sourceEventTopic.toLowerCase() !== SEND_TOPIC || config.destinationEventTopic.toLowerCase() !== RECEIVE_TOPIC) throw new Error("ICM monitor requires verified Teleporter Send/Receive topics");
  const source = clientFor(monitor.chain.rpcUrl);
  const destination = clientFor(config.destinationRpcUrl);
  const [sourceChainId, destinationChainId, sourceLatest, destinationLatest] = await Promise.all([source.getChainId(), destination.getChainId(), source.getBlockNumber(), destination.getBlockNumber()]);
  if (BigInt(sourceChainId) !== monitor.chain.chainId || BigInt(destinationChainId) !== BigInt(config.destinationChainId)) throw new Error("ICM RPC chain ID mismatch");
  const sourceFrom = config.sourceFromBlock ? BigInt(config.sourceFromBlock) : monitor.state?.cursorBlock !== null && monitor.state?.cursorBlock !== undefined ? monitor.state.cursorBlock + 1n : sourceLatest > 20n ? sourceLatest - 20n : 0n;
  const sourceTo = config.sourceToBlock ? BigInt(config.sourceToBlock) : sourceLatest;
  const destinationFrom = config.destinationFromBlock ? BigInt(config.destinationFromBlock) : monitor.state?.destinationCursorBlock !== null && monitor.state?.destinationCursorBlock !== undefined ? monitor.state.destinationCursorBlock + 1n : destinationLatest > 20n ? destinationLatest - 20n : 0n;
  const destinationTo = config.destinationToBlock ? BigInt(config.destinationToBlock) : destinationLatest;
  if (sourceTo > sourceLatest || destinationTo > destinationLatest) throw new Error("ICM scan cannot extend beyond chain head");
  const sourceLogs = sourceFrom <= sourceTo ? (await source.getLogs({ address: monitor.target as Hex, fromBlock: sourceFrom, toBlock: sourceTo })).filter((log) => log.topics[0]?.toLowerCase() === SEND_TOPIC) : [];
  const destinationLogs = destinationFrom <= destinationTo ? (await destination.getLogs({ address: config.destinationTarget as Hex, fromBlock: destinationFrom, toBlock: destinationTo })).filter((log) => log.topics[0]?.toLowerCase() === RECEIVE_TOPIC) : [];
  const sourceByMessage = new Map<string, { log: IcmLog; decoded: ReturnType<typeof decodeSend>; sentAtSec: number }>();
  for (const raw of sourceLogs) {
    const log = raw as IcmLog;
    const decoded = decodeSend(log);
    if (config.destinationBlockchainId && decoded.destinationBlockchainId !== config.destinationBlockchainId.toLowerCase()) continue;
    const block = await source.getBlock({ blockNumber: log.blockNumber });
    const sentAtSec = Number(block.timestamp);
    sourceByMessage.set(decoded.messageId, { log, decoded, sentAtSec });
    if (!config.baselineOnly) await prisma.icmMessage.upsert({
      where: { monitorId_messageId: { monitorId: monitor.id, messageId: decoded.messageId } },
      create: { monitorId: monitor.id, messageId: decoded.messageId, sourceTxHash: log.transactionHash.toLowerCase(), sourceLogIndex: log.logIndex, sourceBlockNumber: log.blockNumber, sentAt: new Date(sentAtSec * 1000) },
      update: {},
    });
  }
  const tracked = config.baselineOnly ? [] : await prisma.icmMessage.findMany({ where: { monitorId: monitor.id, receivedAt: null } });
  for (const raw of destinationLogs) {
    const log = raw as IcmLog;
    const decoded = decodeReceive(log);
    if (config.sourceBlockchainId && decoded.sourceBlockchainId !== config.sourceBlockchainId.toLowerCase()) continue;
    const matchingSource = sourceByMessage.get(decoded.messageId);
    const persisted = tracked.find((item) => item.messageId === decoded.messageId);
    if (!matchingSource && !persisted) continue;
    if (!persisted && !config.baselineOnly) continue;
    const sourceTxHash = matchingSource?.log.transactionHash ?? persisted!.sourceTxHash;
    const sentAtSec = matchingSource?.sentAtSec ?? Math.floor(persisted!.sentAt.getTime() / 1000);
    if (matchingSource && (decoded.nonce !== matchingSource.decoded.nonce || decoded.originSenderAddress.toLowerCase() !== matchingSource.decoded.originSenderAddress.toLowerCase() || decoded.destinationAddress.toLowerCase() !== matchingSource.decoded.destinationAddress.toLowerCase())) throw new Error("ICM message payload mismatch across chains");
    const [block, receipt] = await Promise.all([destination.getBlock({ blockNumber: log.blockNumber }), destination.getTransactionReceipt({ hash: log.transactionHash })]);
    if (receipt.status !== "success" || receipt.blockNumber !== log.blockNumber || !receipt.logs.some((entry) => entry.address.toLowerCase() === config.destinationTarget.toLowerCase() && entry.logIndex === log.logIndex && entry.topics[0]?.toLowerCase() === RECEIVE_TOPIC && entry.topics[1]?.toLowerCase() === decoded.messageId)) throw new Error("ICM destination receipt does not confirm Receive log");
    const receivedAtSec = Number(block.timestamp);
    if (receivedAtSec < sentAtSec) throw new Error("ICM receive block precedes send block");
    const execution = executionStatus(receipt.logs as IcmLog[], decoded.messageId, config.destinationTarget);
    if (config.baselineOnly) continue;
    const existing = persisted!;
    const recovered = await recoverIncidentForSourceTx(monitor.id, sourceTxHash, buildEvidence(monitor, "Teleporter ReceiveCrossChainMessage observed", "icm", { messageId: decoded.messageId, sourceChainId: monitor.chain.chainId.toString(), sourceChainName: monitor.chain.name, destinationChainId: config.destinationChainId, destinationChainName: config.destinationChainName ?? config.destinationChainId, sourceBlockchainId: decoded.sourceBlockchainId, destinationBlockchainId: config.destinationBlockchainId, sourceTxHash, destinationTxHash: log.transactionHash, destinationBlockNumber: log.blockNumber.toString(), destinationLogIndex: log.logIndex, sentAt: new Date(sentAtSec * 1000).toISOString(), receivedAt: new Date(receivedAtSec * 1000).toISOString(), deliveryDurationSeconds: receivedAtSec - sentAtSec, deliveryStatus: "DELIVERED", executionStatus: execution, deliverer: decoded.deliverer, rewardRedeemer: decoded.rewardRedeemer }, { txHash: log.transactionHash, blockNumber: log.blockNumber.toString(), logIndex: log.logIndex }), "已观察到目标链 ReceiveCrossChainMessage；消息执行结果单独记录。");
    await prisma.icmMessage.update({ where: { id: existing.id }, data: { destinationTxHash: log.transactionHash.toLowerCase(), destinationLogIndex: log.logIndex, destinationBlockNumber: log.blockNumber, receivedAt: new Date(receivedAtSec * 1000), executionStatus: execution, ...(recovered ? { incidentId: recovered.id } : {}) } });
    if (recovered) await queueNotifications(recovered.id, "RECOVERED");
  }
  if (!config.baselineOnly) {
    const unresolved = await prisma.icmMessage.findMany({ where: { monitorId: monitor.id, receivedAt: null } });
    const observedAtSec = config.observationTimestampSec ?? Math.floor(Date.now() / 1000);
    for (const item of unresolved) {
      const sentAtSec = Math.floor(item.sentAt.getTime() / 1000);
      const { ageSec, severity } = pendingSeverity(sentAtSec, observedAtSec, config.warningAfterSec, config.criticalAfterSec);
      if (!severity) continue;
      const incident = await openAndNotify({ monitorId: monitor.id, severity, title: "ICM Delivery Pending", message: "Destination delivery not observed within configured observation window. Investigate delivery path.", evidence: buildEvidence(monitor, `ICM delivery pending >= ${config.warningAfterSec}s`, "icm", { messageId: item.messageId, sourceChainId: monitor.chain.chainId.toString(), sourceChainName: monitor.chain.name, destinationChainId: config.destinationChainId, destinationChainName: config.destinationChainName ?? config.destinationChainId, sourceTxHash: item.sourceTxHash, sourceLogIndex: item.sourceLogIndex, sentAt: item.sentAt.toISOString(), observationTimestampSec: observedAtSec, destinationObservationToBlock: destinationTo.toString(), ageSec, warningAfterSec: config.warningAfterSec, criticalAfterSec: config.criticalAfterSec, deliveryStatus: "PENDING", executionStatus: "NOT_OBSERVED" }, { txHash: item.sourceTxHash as Hex, blockNumber: item.sourceBlockNumber.toString(), logIndex: item.sourceLogIndex }), eventType: "ICM_DELIVERY_PENDING" });
      if (!item.incidentId) await prisma.icmMessage.update({ where: { id: item.id }, data: { incidentId: incident.id } });
    }
  }
  await recordMonitorStatus(monitor.id, "HEALTHY", { cursorBlock: sourceTo, destinationCursorBlock: destinationTo, lastError: null, consecutiveFail: 0 });
}

async function scanCustomEvent(monitor: RuntimeMonitor) {
  if (!monitor.target) throw new Error("Custom event monitor missing target");
  const config = customEventConfigSchema.parse(monitor.configJson);
  const event = parseAbiItem(config.eventAbi);
  if (event.type !== "event") throw new Error("Custom event ABI must be an event");
  const client = clientFor(monitor.chain.rpcUrl);
  const latest = await client.getBlockNumber();
  const fromBlock = monitor.state?.cursorBlock ?? (latest > 20n ? latest - 20n : 0n);
  const logs = await client.getLogs({ address: monitor.target as Hex, topics: [toEventSelector(event)], fromBlock, toBlock: latest } as never);
  for (const log of logs) {
    const decoded = decodeEventLog({ abi: [event], data: log.data, topics: log.topics });
    const value = (decoded.args as Record<string, unknown>)[config.valueField];
    if (typeof value !== "bigint" || !exceedsAtomicThreshold(value, config.thresholdAtomic)) continue;
    await openAndNotify({ monitorId: monitor.id, severity: "WARNING", title: "Custom Event Rule 命中", message: `事件字段 ${config.valueField} 超过配置阈值。`, evidence: buildEvidence(monitor, `${config.valueField} > ${config.thresholdAtomic}`, "log", { event: config.eventAbi, field: config.valueField, valueAtomic: value.toString() }, { txHash: log.transactionHash, blockNumber: log.blockNumber.toString(), logIndex: Number(log.logIndex) }), eventType: "CUSTOM_EVENT" });
  }
  await recordMonitorStatus(monitor.id, "HEALTHY", { cursorBlock: latest, lastError: null, consecutiveFail: 0 });
}

async function checkValidatorHealth(monitor: RuntimeMonitor) {
  const config = validatorHealthConfigSchema.parse(monitor.configJson);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.unhealthyAfterSec * 1000);
  try {
    const response = await fetch(config.healthUrl, { signal: controller.signal });
    if (!response.ok) throw new Error(`Health endpoint HTTP ${response.status}`);
    await recordMonitorStatus(monitor.id, "HEALTHY", { lastError: null, consecutiveFail: 0 });
    const recovered = await recoverOpenIncident(monitor.id, buildEvidence(monitor, "Validator health recovered", "validator", { healthUrl: config.healthUrl, httpStatus: response.status }), "Validator 健康检查已恢复。");
    if (recovered) await queueNotifications(recovered.id, "RECOVERED");
  } catch (error) {
    const message = `Validator health request failed (${safeError(error)})`;
    await recordMonitorStatus(monitor.id, "DOWN", { lastError: message, consecutiveFail: (monitor.state?.consecutiveFail ?? 0) + 1 });
    await openAndNotify({ monitorId: monitor.id, severity: "WARNING", title: "Validator Health 不可用", message: "已配置的只读健康端点未正常响应。", evidence: buildEvidence(monitor, "validator health endpoint unavailable", "validator", { healthUrl: config.healthUrl, error: message }), eventType: "VALIDATOR_UNHEALTHY" });
  } finally { clearTimeout(timeout); }
}

async function executeMonitor(monitor: RuntimeMonitor) {
  switch (monitor.type) {
    case "RPC_HEALTH": return runRpcHealth(monitor);
    case "TREASURY": return scanTreasury(monitor);
    case "ADMIN": return scanAdmin(monitor);
    case "ICM_DELIVERY": return scanIcm(monitor);
    case "CUSTOM_EVENT": return scanCustomEvent(monitor);
    case "VALIDATOR_HEALTH": return checkValidatorHealth(monitor);
  }
}

export async function runMonitor(monitor: RuntimeMonitor) {
  try { await executeMonitor(monitor); }
  catch (error) {
    await recordMonitorStatus(monitor.id, "DEGRADED", { lastError: safeError(error), consecutiveFail: (monitor.state?.consecutiveFail ?? 0) + 1 });
    throw error;
  }
}
