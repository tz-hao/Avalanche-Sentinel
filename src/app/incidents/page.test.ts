// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import IncidentsPage from "./page";
import { sentinelApi } from "@/lib/sentinel-api";

const navigation = vi.hoisted(() => ({ push: vi.fn(), query: "q=older&cursor=old-page" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push }),
  usePathname: () => "/incidents",
  useSearchParams: () => new URLSearchParams(navigation.query),
}));

afterEach(() => { cleanup(); vi.restoreAllMocks(); navigation.push.mockReset(); });

it("keeps local date inputs and resets pagination when applying a time range", async () => {
  vi.spyOn(sentinelApi, "incidents").mockResolvedValue({ data: { incidents: [] } });
  render(React.createElement(IncidentsPage));
  await screen.findByText("未发现匹配的安全事件");
  const from = screen.getByLabelText("检出时间起点（本地时间）") as HTMLInputElement;
  const to = screen.getByLabelText("检出时间终点（本地时间）") as HTMLInputElement;
  fireEvent.change(from, { target: { value: "2026-10-07T19:36" } });
  fireEvent.change(to, { target: { value: "2026-10-07T19:37" } });
  expect(from.value).toBe("2026-10-07T19:36");
  expect(to.value).toBe("2026-10-07T19:37");
  fireEvent.click(screen.getByRole("button", { name: "应用筛选" }));
  await waitFor(() => expect(navigation.push).toHaveBeenCalledTimes(1));
  const url = new URL(navigation.push.mock.calls[0][0], "http://localhost");
  expect(url.searchParams.get("q")).toBe("older");
  expect(url.searchParams.has("cursor")).toBe(false);
  expect(url.searchParams.get("from")).toBe(new Date("2026-10-07T19:36").toISOString());
  expect(url.searchParams.get("to")).toBe(new Date("2026-10-07T19:37").toISOString());
});
