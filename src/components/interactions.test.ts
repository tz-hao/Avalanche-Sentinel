// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { sentinelApi } from "@/lib/sentinel-api";
import { CreateMonitorModal } from "@/components/CreateMonitorModal";
import type { ChainRecord } from "@/contracts/domain";

describe("Frontend Core Interactions & Form Submissions", () => {
  const mockChains: ChainRecord[] = [
    {
      id: "chain_c",
      name: "Avalanche C-Chain",
      chainId: "43114",
      rpcUrl: "https://api.avax.network/ext/bc/C/rpc",
      enabled: true,
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe("CreateMonitorModal Form Submissions", () => {
    it("edits a stopped monitor without enabling it or losing hidden settings", async () => {
      const update = vi.spyOn(sentinelApi, "updateMonitor").mockResolvedValue({ data: { monitor: {} } } as Awaited<ReturnType<typeof sentinelApi.updateMonitor>>);
      const original = { id: "edit", type: "RPC_HEALTH" as const, chainId: "chain_c", enabled: false, intervalSec: 60, status: "UNKNOWN" as const, config: { name: "测试探针", rpcUrl: "https://example.test/private-endpoint", expectedChainId: "43114", latencyThresholdMs: 3000, consecutiveFailureThreshold: 4 }, chain: mockChains[0] };
      render(React.createElement(CreateMonitorModal, { chains: mockChains, isOpen: true, editingMonitor: original, onClose: vi.fn(), onCreated: vi.fn() }));
      expect((screen.getByLabelText("监控类型 (Type) *") as HTMLSelectElement).disabled).toBe(true);
      fireEvent.change(screen.getByLabelText("监控名称"), { target: { value: "已编辑探针" } });
      fireEvent.click(screen.getByRole("button", { name: "保存配置" }));
      await waitFor(() => expect(update).toHaveBeenCalledWith("edit", expect.objectContaining({ intervalSec: 60, config: expect.objectContaining({ name: "已编辑探针", rpcUrl: original.config.rpcUrl, expectedChainId: "43114", latencyThresholdMs: 3000 }) })));
      expect(update.mock.calls[0][1]).not.toHaveProperty("enabled");
    });
    it("submits valid RPC_HEALTH monitor without target address", async () => {
      const createSpy = vi.spyOn(sentinelApi, "createMonitor").mockResolvedValueOnce({
        data: { monitor: { id: "mon_created" } },
      } as unknown as Awaited<ReturnType<typeof sentinelApi.createMonitor>>);
      const onCreated = vi.fn();
      const onClose = vi.fn();

      render(
        React.createElement(CreateMonitorModal, {
          chains: mockChains,
          isOpen: true,
          onClose,
          onCreated,
        })
      );

      // Verify modal is open
      expect(screen.getByRole("dialog")).toBeDefined();

      // Submit RPC_HEALTH form (default type)
      const submitBtn = screen.getByRole("button", { name: "立即创建监控" });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(createSpy).toHaveBeenCalledTimes(1);
        expect(createSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            type: "RPC_HEALTH",
            chainId: "chain_c",
            intervalSec: 30,
            enabled: false,
            config: expect.objectContaining({
              latencyThresholdMs: 2000,
              consecutiveFailureThreshold: 3,
            }),
          })
        );
        expect(onCreated).toHaveBeenCalled();
        expect(onClose).toHaveBeenCalled();
      });

      cleanup();
    });

    it("requires at least one admin eventKind for ADMIN monitor", async () => {
      const onCreated = vi.fn();
      const onClose = vi.fn();

      render(
        React.createElement(CreateMonitorModal, {
          chains: mockChains,
          isOpen: true,
          onClose,
          onCreated,
        })
      );

      // Change type to ADMIN
      const select = screen.getByLabelText(/监控类型/);
      fireEvent.change(select, { target: { value: "ADMIN" } });

      // Uncheck all admin event checkboxes
      const checkboxes = screen.getAllByRole("checkbox");
      for (const cb of checkboxes) {
        fireEvent.click(cb);
      }

      // Enter target address
      const targetInput = screen.getByLabelText(/目标合约 \/ 节点地址/);
      fireEvent.change(targetInput, {
        target: { value: "0x1111111111111111111111111111111111111111" },
      });

      const submitBtn = screen.getByRole("button", { name: "立即创建监控" });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(
          screen.getByText(/请至少选择一种特权事件类型/)
        ).toBeDefined();
      });

      cleanup();
    });
  });
});
