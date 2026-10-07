import { beforeEach, describe, expect, it, vi } from "vitest";
const findMany = vi.hoisted(() => vi.fn());
vi.mock("@/server/db", () => ({ prisma: { incident: { findMany } } }));
import { listIncidentPage } from "./incidents";
import { incidentQuerySchema } from "@/contracts/incident-query";

beforeEach(() => vi.clearAllMocks());
const row = (id: string) => ({ id, openedAt: new Date("2026-10-07T00:00:00Z"), evidenceJson: {}, monitor: null });
describe("incident keyset pagination", () => {
  it("uses an extra row for has-more and deterministic ID ordering for tied timestamps", async () => {
    findMany.mockResolvedValue([row("c"), row("b"), row("a")]);
    const page = await listIncidentPage({ limit: 2 });
    expect(page.incidents.map(i => i.id)).toEqual(["c", "b"]);
    expect(page.nextCursor).toBeTruthy();
    findMany.mockResolvedValue([row("a")]);
    const last = await listIncidentPage({ limit: 2, cursor: page.nextCursor });
    expect(last.nextCursor).toBeUndefined();
    expect(findMany.mock.calls[1][0].where.AND[0].OR[1]).toEqual({ openedAt: row("b").openedAt, id: { lt: "b" } });
  });
  it("filters the database before paging, rather than searching the current page", async () => {
    findMany.mockResolvedValue([]);
    await listIncidentPage({ from: "2026-10-06T00:00:00Z", to: "2026-10-07T00:00:00Z", q: "0xabc", severity: "WARNING" });
    expect(findMany.mock.calls[0][0]).toMatchObject({ where: { severity: "WARNING", openedAt: { gte: new Date("2026-10-06T00:00:00Z"), lte: new Date("2026-10-07T00:00:00Z") } }, take: 51 });
    expect(JSON.stringify(findMany.mock.calls[0][0].where.AND)).toContain("txHash");
  });
  it("rejects invalid ranges, limits and malformed cursors without database access", async () => {
    expect(incidentQuerySchema.safeParse({ from: "2026-10-07T00:00:00Z", to: "2026-10-06T00:00:00Z" }).success).toBe(false);
    expect(incidentQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
    await expect(listIncidentPage({ cursor: "garbage" })).rejects.toThrow("INVALID_INCIDENT_CURSOR");
    expect(findMany).not.toHaveBeenCalled();
  });
});
