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
