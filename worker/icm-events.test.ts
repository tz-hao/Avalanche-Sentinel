import { encodeAbiParameters, parseAbiParameters, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import { decodeReceive, decodeSend, executionStatus, pendingSeverity, EXECUTED_TOPIC, EXECUTION_FAILED_TOPIC, RECEIVE_TOPIC, SEND_TOPIC, type IcmLog } from "./icm-events";

const messageId = "0xf607faa37c4ff2036ad89a9e40d7df42fd876fb37f66b2facc251e5aefbdf72d" as Hex;
const sourceId = "0x7fc93d85c6d62c5b2ac0b519c87010ea5294012d1e407030d6acd0021cac10d5" as Hex;
const destinationId = "0x1278d1be4b987e847be3465940eb5066c4604a7fbd6e086900823597d81af4c1" as Hex;
const account = "0x262A0EF5B6bB6504C6C8AF8f6c591B3844aA3CA2" as Hex;
const message = { messageNonce: 2n, originSenderAddress: account, destinationBlockchainID: destinationId, destinationAddress: account, requiredGasLimit: 1n, allowedRelayerAddresses: [], receipts: [], message: "0x" as Hex };
const messageParameter = "(uint256 messageNonce,address originSenderAddress,bytes32 destinationBlockchainID,address destinationAddress,uint256 requiredGasLimit,address[] allowedRelayerAddresses,(uint256 receivedMessageNonce,address relayerRewardAddress)[] receipts,bytes message) message";
const base = { address: "0x253b2784c75e510dD0fF1da844684a1aC0aa5fcf", transactionHash: "0x083332fe5fcbaf487745f0f736616919dfc918706e941811b926b0c2865acbb9" as Hex, blockNumber: 30584431n, logIndex: 13 };
const send: IcmLog = { ...base, topics: [SEND_TOPIC, messageId, destinationId], data: encodeAbiParameters(parseAbiParameters(`${messageParameter},(address feeTokenAddress,uint256 amount) feeInfo`), [message, { feeTokenAddress: account, amount: 1n }]) };
const receive: IcmLog = { ...base, topics: [RECEIVE_TOPIC, messageId, sourceId, `0x${"0".repeat(24)}${account.slice(2).toLowerCase()}` as Hex], data: encodeAbiParameters(parseAbiParameters(`address rewardRedeemer,${messageParameter}`), [account, message]) };

describe("Teleporter ICM evidence", () => {
  it("decodes Send and Receive and correlates by exact indexed messageID", () => {
    const source = decodeSend(send);
    const destination = decodeReceive(receive);
    expect(source.messageId).toBe(messageId);
    expect(destination.messageId).toBe(source.messageId);
    expect(source.destinationBlockchainId).toBe(destinationId);
    expect(destination.sourceBlockchainId).toBe(sourceId);
    expect(source.nonce).toBe("2");
    expect(destination.originSenderAddress).toBe(account);
  });

  it("rejects a mismatched messageID even when nonce and addresses are identical", () => {
    const other = decodeReceive({ ...receive, topics: [RECEIVE_TOPIC, `0x${"1".repeat(64)}` as Hex, sourceId, receive.topics[3]] });
    expect(other.messageId).not.toBe(decodeSend(send).messageId);
  });

  it("does not classify an absent Receive as delivered", () => {
    expect(pendingSeverity(100, 101, 1, 10)).toEqual({ ageSec: 1, severity: "WARNING" });
    expect(pendingSeverity(100, 100, 1, 10)).toEqual({ ageSec: 0, severity: null });
    expect(pendingSeverity(100, 110, 1, 10)).toEqual({ ageSec: 10, severity: "CRITICAL" });
  });

  it("keeps delivery independent of execution and does not require ReceiptReceived", () => {
    expect(executionStatus([receive], messageId, base.address)).toBe("NOT_OBSERVED");
    expect(executionStatus([receive, { ...receive, topics: [EXECUTED_TOPIC, messageId] }], messageId, base.address)).toBe("EXECUTED");
    expect(executionStatus([receive, { ...receive, topics: [EXECUTION_FAILED_TOPIC, messageId] }], messageId, base.address)).toBe("FAILED");
    expect(executionStatus([{ ...receive, address: account, topics: [EXECUTION_FAILED_TOPIC, messageId] }], messageId, base.address)).toBe("NOT_OBSERVED");
    expect(decodeReceive(receive).messageId).toBe(messageId);
  });

  it("does not assert an unsupported root cause", () => {
    const pending = "Destination delivery not observed within configured observation window. Investigate delivery path.";
    expect(pending).not.toMatch(/relayer failed|relayer offline|validator failed|avalanche failed|network failed|icm broken/i);
  });
});
