// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { sentinelApi, SentinelApiError } from "@/lib/sentinel-api";
import LoginPage from "@/app/login/page";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/login",
}));

describe("Login Page Interactions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockPush.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("reliably displays required error when submitting empty password", async () => {
    render(React.createElement(LoginPage));
    const submitBtn = screen.getByRole("button", { name: "进入监控控制台" });

    // Submit while empty
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText("请输入管理员口令。")).toBeDefined();
    });
    expect(mockPush).not.toHaveBeenCalled();

    // Submit with whitespace only
    const input = screen.getByPlaceholderText("••••••••••••••••");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText("请输入管理员口令。")).toBeDefined();
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("displays real failure error message on invalid credentials", async () => {
    vi.spyOn(sentinelApi, "login").mockRejectedValueOnce(
      new SentinelApiError(401, "INVALID_CREDENTIALS", "管理员口令无效。")
    );

    render(React.createElement(LoginPage));
    const input = screen.getByPlaceholderText("••••••••••••••••");
    fireEvent.change(input, { target: { value: "wrong-password" } });

    const submitBtn = screen.getByRole("button", { name: "进入监控控制台" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText("管理员口令无效。")).toBeDefined();
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  it("navigates to /overview upon successful authentication", async () => {
    vi.spyOn(sentinelApi, "login").mockResolvedValueOnce({
      data: { expiresAt: "2026-09-18T12:00:00.000Z" },
    });

    render(React.createElement(LoginPage));
    const input = screen.getByPlaceholderText("••••••••••••••••");
    fireEvent.change(input, { target: { value: "correct-admin-password" } });

    const submitBtn = screen.getByRole("button", { name: "进入监控控制台" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/overview");
    });
  });
});
