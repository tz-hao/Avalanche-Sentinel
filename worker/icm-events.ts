import { decodeAbiParameters, parseAbiParameters, toEventSelector, type Hex } from "viem";

export const SEND_TOPIC = toEventSelector("SendCrossChainMessage(bytes32,bytes32,(uint256,address,bytes32,address,uint256,address[],(uint256,address)[],bytes),(address,uint256))");
export const RECEIVE_TOPIC = toEventSelector("ReceiveCrossChainMessage(bytes32,bytes32,address,address,(uint256,address,bytes32,address,uint256,address[],(uint256,address)[],bytes))");
export const EXECUTED_TOPIC = toEventSelector("MessageExecuted(bytes32,bytes32)");
// Teleporter emits the execution-failure event with an additional reason payload.
export const EXECUTION_FAILED_TOPIC = "0x4619adc1017b82e02eaefac01a43d50d6d8de4460774bc370c3ff0210d40c985" as const;

const message = "(uint256 messageNonce,address originSenderAddress,bytes32 destinationBlockchainID,address destinationAddress,uint256 requiredGasLimit,address[] allowedRelayerAddresses,(uint256 receivedMessageNonce,address relayerRewardAddress)[] receipts,bytes message) message";
const sendParameters = parseAbiParameters(`${message},(address feeTokenAddress,uint256 amount) feeInfo`);
const receiveParameters = parseAbiParameters(`address rewardRedeemer,${message}`);

export type IcmLog = { address: string; topics: readonly Hex[]; data: Hex; transactionHash: Hex; blockNumber: bigint; logIndex: number };

export function decodeSend(log: IcmLog) {
  if (log.topics[0]?.toLowerCase() !== SEND_TOPIC.toLowerCase() || !log.topics[1] || !log.topics[2]) throw new Error("Not a Teleporter SendCrossChainMessage log");
  const [decodedMessage] = decodeAbiParameters(sendParameters, log.data);
  if (decodedMessage.destinationBlockchainID.toLowerCase() !== log.topics[2].toLowerCase()) throw new Error("Send destinationBlockchainID mismatch");
  return {
    messageId: log.topics[1].toLowerCase() as Hex,
    destinationBlockchainId: log.topics[2].toLowerCase() as Hex,
    nonce: decodedMessage.messageNonce.toString(),
    originSenderAddress: decodedMessage.originSenderAddress,
    destinationAddress: decodedMessage.destinationAddress,
    requiredGasLimit: decodedMessage.requiredGasLimit.toString(),
  };
}

export function decodeReceive(log: IcmLog) {
  if (log.topics[0]?.toLowerCase() !== RECEIVE_TOPIC.toLowerCase() || !log.topics[1] || !log.topics[2] || !log.topics[3]) throw new Error("Not a Teleporter ReceiveCrossChainMessage log");
  const [rewardRedeemer, decodedMessage] = decodeAbiParameters(receiveParameters, log.data);
  return {
    messageId: log.topics[1].toLowerCase() as Hex,
    sourceBlockchainId: log.topics[2].toLowerCase() as Hex,
    deliverer: `0x${log.topics[3].slice(-40)}` as Hex,
    rewardRedeemer,
    nonce: decodedMessage.messageNonce.toString(),
    originSenderAddress: decodedMessage.originSenderAddress,
    destinationAddress: decodedMessage.destinationAddress,
  };
}

export function executionStatus(logs: readonly IcmLog[], messageId: Hex, teleporterAddress: string) {
  const matches = (topic: Hex) => logs.some((log) => log.address.toLowerCase() === teleporterAddress.toLowerCase() && log.topics[0]?.toLowerCase() === topic.toLowerCase() && log.topics[1]?.toLowerCase() === messageId.toLowerCase());
  if (matches(EXECUTED_TOPIC)) return "EXECUTED" as const;
  if (matches(EXECUTION_FAILED_TOPIC)) return "FAILED" as const;
  return "NOT_OBSERVED" as const;
}

export function pendingSeverity(sentAtSec: number, observedAtSec: number, warningAfterSec: number, criticalAfterSec: number) {
  const ageSec = Math.max(0, observedAtSec - sentAtSec);
  return { ageSec, severity: ageSec >= criticalAfterSec ? "CRITICAL" as const : ageSec >= warningAfterSec ? "WARNING" as const : null };
}
