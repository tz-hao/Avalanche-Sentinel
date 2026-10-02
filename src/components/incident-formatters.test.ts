// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  formatIncidentTitle,
  formatIncidentRule,
  formatTimelineMessage,
  formatEventType,
  formatDeliveryStatus,
  formatExecutionStatus,
  resolveTitleExplanation,
  resolveRuleExplanation,
  resolveMessageExplanation,
} from "./incident-formatters";

afterEach(cleanup);

describe("Incident formatters & dual-display auditability", () => {
  describe("Incident Titles", () => {
    it("provides Chinese explanation alongside raw English title for known titles", () => {
      // ICM
      render(React.createElement("div", null, formatIncidentTitle("ICM Delivery Pending")));
      expect(screen.getByText("ICM 跨链交付等待中")).toBeDefined();
      expect(screen.getByText("ICM Delivery Pending")).toBeDefined();

      // Treasury
      render(React.createElement("div", null, formatIncidentTitle("Treasury Outflow")));
      expect(screen.getByText("金库资产大额流出")).toBeDefined();
      expect(screen.getByText("Treasury Outflow")).toBeDefined();

      // Admin
      render(React.createElement("div", null, formatIncidentTitle("Admin")));
      expect(screen.getByText("特权变更或合约升级")).toBeDefined();
      expect(screen.getByText("Admin")).toBeDefined();

      // RPC
      render(React.createElement("div", null, formatIncidentTitle("RPC_UNAVAILABLE")));
      expect(screen.getByText("RPC 节点服务不可用")).toBeDefined();
      expect(screen.getByText("RPC_UNAVAILABLE")).toBeDefined();
    });

    it("preserves already localized Chinese titles without redundant wrapping", () => {
      expect(resolveTitleExplanation("金库大额未授权转账")).toBeNull();
      expect(formatIncidentTitle("金库大额未授权转账")).toBe("金库大额未授权转账");

      expect(resolveTitleExplanation("RPC 短暂波动告警")).toBeNull();
      expect(formatIncidentTitle("RPC 短暂波动告警")).toBe("RPC 短暂波动告警");
    });

    it("falls back to raw string for unknown titles without speculative claims", () => {
      const unknown = "ThirdParty Protocol Alert XYZ";
      expect(resolveTitleExplanation(unknown)).toBeNull();
      expect(formatIncidentTitle(unknown)).toBe(unknown);
    });
  });

  describe("Incident Evidence Rules", () => {
    it("provides Chinese explanations paired with machine rules for known patterns", () => {
      // ICM pending rule
      render(React.createElement("div", null, formatIncidentRule("ICM delivery pending >= 300s")));
      expect(screen.getByText("ICM 跨链交付等待超过观测窗口")).toBeDefined();
      expect(screen.getByText("ICM delivery pending >= 300s")).toBeDefined();

      // Teleporter receive rule
      render(React.createElement("div", null, formatIncidentRule("Teleporter ReceiveCrossChainMessage observed")));
      expect(screen.getByText("已观测到 Teleporter 跨链接收存证")).toBeDefined();
      expect(screen.getByText("Teleporter ReceiveCrossChainMessage observed")).toBeDefined();

      // Treasury ERC20 outflow rule
      render(React.createElement("div", null, formatIncidentRule("USDC outflow > 10000000000")));
      expect(screen.getByText("USDC 资产转出金额超过配置阈值")).toBeDefined();
      expect(screen.getByText("USDC outflow > 10000000000")).toBeDefined();

      // Treasury native outflow rule
      render(React.createElement("div", null, formatIncidentRule("native outflow > 50000000000000000000")));
      expect(screen.getByText("原生代币 (AVAX) 转出金额超过配置阈值")).toBeDefined();
      expect(screen.getByText("native outflow > 50000000000000000000")).toBeDefined();

      // Treasury threshold exact constant
      render(React.createElement("div", null, formatIncidentRule("TREASURY_TRANSFER_THRESHOLD")));
      expect(screen.getByText("金库转出金额超过配置阈值")).toBeDefined();
      expect(screen.getByText("TREASURY_TRANSFER_THRESHOLD")).toBeDefined();

      // Admin ownership / role / upgrade rule
      render(React.createElement("div", null, formatIncidentRule("Ownership / Role / Upgrade event")));
      expect(screen.getByText("特权所有权 / 角色授权 / 逻辑合约升级事件")).toBeDefined();
      expect(screen.getByText("Ownership / Role / Upgrade event")).toBeDefined();

      // RPC unavailable
      render(React.createElement("div", null, formatIncidentRule("RPC_UNAVAILABLE")));
      expect(screen.getByText("RPC 节点服务不可用")).toBeDefined();
      expect(screen.getByText("RPC_UNAVAILABLE")).toBeDefined();
    });

    it("falls back to raw rule for unknown rules without inventing facts", () => {
      const unknownRule = "Untrusted rule arbitrary string";
      expect(resolveRuleExplanation(unknownRule)).toBeNull();
      expect(formatIncidentRule(unknownRule)).toBe(unknownRule);
    });
  });

  describe("Timeline Event Messages", () => {
    it("pairs Chinese explanation with known English timeline messages", () => {
      const icmMsg = "Destination delivery not observed within configured observation window. Investigate delivery path.";
      render(React.createElement("div", null, formatTimelineMessage(icmMsg)));
      expect(screen.getByText("在配置的观测窗口内未观测到目标链接收存证，请排查交付路径。")).toBeDefined();
      expect(screen.getByText(icmMsg)).toBeDefined();

      const adminMsg = "Ownership / Role / Upgrade event";
      render(React.createElement("div", null, formatTimelineMessage(adminMsg)));
      expect(screen.getByText("检测到特权所有权、角色授权或逻辑合约升级事件，请核对操作人。")).toBeDefined();
      expect(screen.getByText(adminMsg)).toBeDefined();
    });

    it("leaves already localized Chinese timeline messages untouched", () => {
      const zhMsg1 = "首次捕获到大额转账异动";
      expect(resolveMessageExplanation(zhMsg1)).toBeNull();
      expect(formatTimelineMessage(zhMsg1)).toBe(zhMsg1);

      const zhMsg2 = "已观察到目标链 ReceiveCrossChainMessage；消息执行结果单独记录。";
      expect(resolveMessageExplanation(zhMsg2)).toBeNull();
      expect(formatTimelineMessage(zhMsg2)).toBe(zhMsg2);

      const zhMsg3 = "检测到已配置的权限或实现变更事件，请人工复核。";
      expect(resolveMessageExplanation(zhMsg3)).toBeNull();
      expect(formatTimelineMessage(zhMsg3)).toBe(zhMsg3);
    });

    it("leaves unknown timeline messages untouched without guesswork", () => {
      expect(formatTimelineMessage("arbitrary message")).toBe("arbitrary message");
    });
  });

  describe("ICM Delivery & Execution Separation", () => {
    it("formats delivery and execution statuses distinctly preserving machine values", () => {
      expect(formatDeliveryStatus("DELIVERED")).toBe("已送达 (DELIVERED)");
      expect(formatDeliveryStatus("PENDING")).toBe("等待接收 (PENDING)");
      expect(formatDeliveryStatus("NOT_OBSERVED")).toBe("未观测到 (NOT_OBSERVED)");

      expect(formatExecutionStatus("SUCCESS")).toBe("执行成功 (SUCCESS)");
      expect(formatExecutionStatus("FAILED")).toBe("执行失败 (FAILED)");
      expect(formatExecutionStatus("PENDING")).toBe("等待执行 (PENDING)");
      expect(formatExecutionStatus("NOT_OBSERVED")).toBe("未观测到 (NOT_OBSERVED)");
    });
  });

  describe("Event Type Formatting", () => {
    it("formats known event types with dual display", () => {
      render(React.createElement("div", null, formatEventType("ICM_DELIVERY_PENDING")));
      expect(screen.getByText("ICM 跨链交付等待中")).toBeDefined();
      expect(screen.getByText("ICM_DELIVERY_PENDING")).toBeDefined();

      render(React.createElement("div", null, formatEventType("TREASURY_OUTFLOW")));
      expect(screen.getByText("金库大额流出")).toBeDefined();
      expect(screen.getByText("TREASURY_OUTFLOW")).toBeDefined();
    });
  });
});
