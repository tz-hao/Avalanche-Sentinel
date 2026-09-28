// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { StatusBadge } from "@/components/StatusBadge";
import { LoadingState, ErrorState, EmptyState } from "@/components/StateFeedback";
import { EvidenceViewer } from "@/components/EvidenceViewer";
import { TimelineViewer } from "@/components/TimelineViewer";
import type { EvidenceSnapshot, IncidentEventRecord } from "@/contracts/domain";

describe("Frontend Core Components & Accessibility", () => {
  afterEach(() => {
    cleanup();
  });
  describe("StatusBadge", () => {
    it("renders overall status with multi-factor representation (text + symbol + aria)", () => {
      render(React.createElement(StatusBadge, { type: "overall", value: "CRITICAL" }));
      const badge = screen.getByRole("status");
      expect(badge.getAttribute("aria-label")).toContain("全局状态：危险告警");
      expect(badge.textContent).toContain("[✕]");
      expect(badge.textContent).toContain("危险告警 (CRITICAL)");
      cleanup();
    });

    it("renders monitor statuses without relying solely on color", () => {
      const statuses = [
        { value: "HEALTHY", sym: "[✓]", text: "正常 / HEALTHY" },
        { value: "DEGRADED", sym: "[▲]", text: "降级 / DEGRADED" },
        { value: "DOWN", sym: "[✕]", text: "离线 / DOWN" },
        { value: "UNKNOWN", sym: "[?]", text: "未知 / UNKNOWN" },
      ] as const;

      for (const item of statuses) {
        render(React.createElement(StatusBadge, { type: "monitor", value: item.value }));
        const badge = screen.getByRole("status");
        expect(badge.textContent).toContain(item.sym);
        expect(badge.textContent).toContain(item.text);
        cleanup();
      }
    });

    it("renders incident status and severity correctly", () => {
      render(React.createElement(StatusBadge, { type: "severity", value: "CRITICAL" }));
      expect(screen.getByRole("status").textContent).toContain("[CRIT]");
      cleanup();

      render(React.createElement(StatusBadge, { type: "incident", value: "OPEN" }));
      expect(screen.getByRole("status").textContent).toContain("[●]");
      expect(screen.getByRole("status").textContent).toContain("待处置 / OPEN");
      cleanup();

      render(React.createElement(StatusBadge, { type: "incident", value: "RECOVERED" }));
      expect(screen.getByRole("status").textContent).toContain("[○]");
      expect(screen.getByRole("status").textContent).toContain("已恢复 / RECOVERED");
      cleanup();
    });
  });

  describe("StateFeedback", () => {
    it("renders LoadingState with aria-live and polite role", () => {
      render(React.createElement(LoadingState, { message: "正在检测节点状态..." }));
      const status = screen.getByRole("status");
      expect(status.textContent).toContain("正在检测节点状态...");
      cleanup();
    });

    it("renders ErrorState with alert role and triggers onRetry", () => {
      const onRetry = vi.fn();
      render(
        React.createElement(ErrorState, {
          title: "网络异常",
          message: "无法连接至后端服务",
          onRetry,
        })
      );
      const alert = screen.getByRole("alert");
      expect(alert.textContent).toContain("网络异常");
      expect(alert.textContent).toContain("无法连接至后端服务");

      const retryBtn = screen.getByRole("button", { name: "重试请求" });
      fireEvent.click(retryBtn);
      expect(onRetry).toHaveBeenCalledTimes(1);
      cleanup();
    });

    it("renders EmptyState with custom title and description", () => {
      render(
        React.createElement(EmptyState, {
          title: "未发现事件",
          description: "当前暂无任何安全报警事件",
        })
      );
      expect(screen.getByText("未发现事件")).toBeDefined();
      expect(screen.getByText("当前暂无任何安全报警事件")).toBeDefined();
      cleanup();
    });
  });

  describe("EvidenceViewer", () => {
    const mockEvidence: EvidenceSnapshot = {
      chainId: "43114",
      chainName: "Avalanche C-Chain",
      rule: "TREASURY_TRANSFER_THRESHOLD",
      target: "0x1111111111111111111111111111111111111111",
      observedAt: "2026-09-18T00:00:00.000Z",
      provenance: "log",
      txHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      blockNumber: "1234567",
      logIndex: 2,
      facts: {
        from: "0x1111111111111111111111111111111111111111",
        to: "0x9999999999999999999999999999999999999999",
        amount: "5000000000000",
      },
    };

    it("renders complete evidence audit trail and on-chain proof", () => {
      render(
        React.createElement(EvidenceViewer, {
          evidence: mockEvidence,
          explorerUrl: "https://subnets.avax.network",
        })
      );

      expect(screen.getByText("TREASURY_TRANSFER_THRESHOLD")).toBeDefined();
      expect(screen.getByText("Avalanche C-Chain")).toBeDefined();
      expect(screen.getByText(/43114/)).toBeDefined();
      const addressMatches = screen.getAllByText(/0x1111111111111111111111111111111111111111/);
      expect(addressMatches).toHaveLength(2);
      expect(screen.getByText(/#1234567/)).toBeDefined();
      expect(screen.getByText("2")).toBeDefined();
      expect(screen.getByText(/5000000000000/)).toBeDefined();
      cleanup();
    });
  });

  describe("TimelineViewer", () => {
    it("renders empty message when no events exist", () => {
      render(React.createElement(TimelineViewer, { events: [] }));
      expect(screen.getByText("暂无时间线记录")).toBeDefined();
      cleanup();
    });

    it("renders chronological timeline events and toggles details", () => {
      const mockEvents: IncidentEventRecord[] = [
        {
          id: "evt_1",
          type: "DETECTED",
          message: "首次捕获到大额转账异动",
          createdAt: "2026-09-18T00:00:00.000Z",
          evidence: {
            chainId: "43114",
            chainName: "Avalanche C-Chain",
            rule: "TREASURY_TRANSFER_THRESHOLD",
            observedAt: "2026-09-18T00:00:00.000Z",
            provenance: "log",
            facts: { trigger: "threshold_exceeded" },
          },
        },
        {
          id: "evt_2",
          type: "ACKNOWLEDGED",
          message: "安全管理员接管并核查目标地址",
          createdAt: "2026-09-18T00:05:00.000Z",
          evidence: {
            chainId: "43114",
            chainName: "Avalanche C-Chain",
            rule: "TREASURY_TRANSFER_THRESHOLD",
            observedAt: "2026-09-18T00:05:00.000Z",
            provenance: "log",
            facts: {},
          },
        },
      ];

      render(React.createElement(TimelineViewer, { events: mockEvents }));

      expect(screen.getByText("首次检出 (DETECTED)")).toBeDefined();
      expect(screen.getByText("首次捕获到大额转账异动")).toBeDefined();
      expect(screen.getByText("已确认处置 (ACKNOWLEDGED)")).toBeDefined();
      expect(screen.getByText("安全管理员接管并核查目标地址")).toBeDefined();

      // Test expanding evidence snapshot
      const toggleButtons = screen.getAllByText(/查看节点存证快照/);
      expect(toggleButtons.length).toBe(2);

      fireEvent.click(toggleButtons[0]);
      expect(screen.getByText(/threshold_exceeded/)).toBeDefined();
      cleanup();
    });
  });
});
