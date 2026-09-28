// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { sentinelApi, SentinelApiError } from "@/lib/sentinel-api";
import IncidentDetailPage from "@/app/incidents/[id]/page";

import type { IncidentDetailResponse } from "@/contracts/api";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "inc_test_1" }),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/incidents/inc_test_1",
  useSearchParams: () => new URLSearchParams(),
}));

describe("Incident Detail Ack Button Rules", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("provides Ack button for unrecovered (OPEN) incident and calls sentinelApi.acknowledge", async () => {
    const mockIncident = {
      id: "inc_test_1",
      monitorId: "mon_1",
      severity: "CRITICAL" as const,
      status: "OPEN" as const,
      title: "金库大额未授权转账",
      evidence: {
        chainId: "43114",
        chainName: "Avalanche C-Chain",
        rule: "TREASURY_TRANSFER_THRESHOLD",
        target: "0x1111111111111111111111111111111111111111",
        observedAt: "2026-09-18T00:00:00.000Z",
        provenance: "log" as const,
        facts: {},
      },
      openedAt: "2026-09-18T00:00:00.000Z",
      events: [],
    };

    vi.spyOn(sentinelApi, "incident").mockResolvedValue({
      data: { incident: mockIncident },
    } as unknown as IncidentDetailResponse);

    const ackSpy = vi.spyOn(sentinelApi, "acknowledge").mockResolvedValueOnce({
      data: { incident: { ...mockIncident, status: "ACKNOWLEDGED" as const } },
    } as unknown as IncidentDetailResponse);

    render(React.createElement(IncidentDetailPage));

    // Wait for incident to load
    await waitFor(() => {
      expect(screen.getByText("金库大额未授权转账")).toBeDefined();
    });

    // The Ack button must be present for unrecovered incident
    const ackBtn = screen.getByRole("button", { name: "确认处置安全事件" });
    expect(ackBtn).toBeDefined();
    expect(ackBtn.textContent).toContain("确认处置 (Acknowledge)");

    // Click Ack button
    fireEvent.click(ackBtn);

    await waitFor(() => {
      expect(ackSpy).toHaveBeenCalledWith("inc_test_1");
      expect(screen.getByText(/已成功确认事件/)).toBeDefined();
    });

    cleanup();
  });

  it("does NOT provide Ack button when incident is RECOVERED", async () => {
    const mockIncident = {
      id: "inc_test_2",
      monitorId: "mon_1",
      severity: "WARNING" as const,
      status: "RECOVERED" as const,
      title: "RPC 短暂波动告警",
      evidence: {
        chainId: "43114",
        chainName: "Avalanche C-Chain",
        rule: "RPC_UNAVAILABLE",
        observedAt: "2026-09-18T00:00:00.000Z",
        provenance: "rpc" as const,
        facts: {},
      },
      openedAt: "2026-09-18T00:00:00.000Z",
      recoveredAt: "2026-09-18T00:10:00.000Z",
      events: [],
    };

    vi.spyOn(sentinelApi, "incident").mockResolvedValue({
      data: { incident: mockIncident },
    } as unknown as IncidentDetailResponse);

    render(React.createElement(IncidentDetailPage));

    await waitFor(() => {
      expect(screen.getByText("RPC 短暂波动告警")).toBeDefined();
    });

    // Verify Ack button is NOT present
    expect(screen.queryByRole("button", { name: "确认处置安全事件" })).toBeNull();
    // Verify recovered badge is displayed
    expect(screen.getByText("事件已恢复闭环 (已归档)")).toBeDefined();

    cleanup();
  });

  it("requests AI Summary only on click and preserves Evidence when unavailable", async () => {
    vi.spyOn(sentinelApi, "incident").mockResolvedValue({ data: { incident: {
      id: "inc_test_1", monitorId: "mon_1", severity: "WARNING", status: "OPEN", title: "RPC 检查事件",
      evidence: { chainId: "43113", chainName: "Fuji", rule: "RPC_UNAVAILABLE", observedAt: "2026-09-18T00:00:00.000Z", provenance: "rpc", facts: {} },
      openedAt: "2026-09-18T00:00:00.000Z", events: [],
    } } } as IncidentDetailResponse);
    const generate = vi.spyOn(sentinelApi, "generateSummary").mockRejectedValue(new SentinelApiError(409, "AI_NOT_CONFIGURED", "AI Summary 尚未配置。"));
    render(React.createElement(IncidentDetailPage));
    await waitFor(() => expect(screen.getByText("RPC 检查事件")).toBeDefined());
    expect(generate).not.toHaveBeenCalled();
    expect(screen.getByRole("region", { name: "AI Summary" })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "生成摘要" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Summary unavailable"));
    expect(generate).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText("RPC_UNAVAILABLE").length).toBeGreaterThan(0);
  });
});
