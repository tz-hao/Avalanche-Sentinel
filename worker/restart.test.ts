import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it, vi } from "vitest";
import { createScheduler } from "./scheduler";

const db = vi.hoisted(() => ({
  incident: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), findUniqueOrThrow: vi.fn() },
  incidentEvent: { findFirst: vi.fn(), create: vi.fn() },
  monitor: { update: vi.fn() }, monitorState: { upsert: vi.fn() }, $transaction: vi.fn(),
}));
vi.mock("@/server/db", () => ({ prisma: db }));
vi.mock("@/server/serializers", () => ({ serializeIncident: (x: unknown) => x }));
import { findOrCreateOpenIncident } from "@/server/incidents";
import { recordMonitorStatus } from "@/server/monitors";

it("drains a tick, durably persists cursor, restores it on restart and dedupes the same event", async () => {
  const file = join(tmpdir(), `sentinel-m8b-${randomUUID()}.json`);
  let store: { cursor: string | null; incident: { id: string; severity: string } | null; events: { dedupeKey: string }[] } = { cursor: null, incident: null, events: [] };
  db.$transaction.mockImplementation(async (arg) => typeof arg === "function" ? arg(db) : Promise.all(arg));
  db.incident.findFirst.mockImplementation(async () => store.incident);
  db.incident.create.mockImplementation(async () => store.incident = { id: "incident", severity: "CRITICAL" });
  db.incident.findUniqueOrThrow.mockImplementation(async () => store.incident);
  db.incidentEvent.findFirst.mockImplementation(async ({ where }) => store.events.find(x => x.dedupeKey === where.dedupeKey));
  db.incidentEvent.create.mockImplementation(async ({ data }) => { store.events.push(data); });
  db.monitorState.upsert.mockImplementation(async ({ update }) => { store.cursor = update.cursorBlock.toString(); });
  const resumePoints: (string | null)[] = [];
  async function scan() {
    resumePoints.push(store.cursor);
    await findOrCreateOpenIncident({ monitorId: "monitor", severity: "CRITICAL", title: "Admin", message: "Ownership", eventType: "ADMIN_EVENT", evidence: { chainId: "43113", chainName: "Fuji", rule: "Ownership", observedAt: new Date().toISOString(), provenance: "log", txHash: "0xabc", logIndex: 7, facts: {} } });
    await recordMonitorStatus("monitor", "HEALTHY", { cursorBlock: 41064466n });
    writeFileSync(file, JSON.stringify(store));
  }
  const exit = vi.fn();
  const make = () => createScheduler({ tick: scan, disconnect: async () => {}, exit, log: () => {} });
  try {
    const first = make();
    const tick = first.tick();
    await Promise.resolve();
    const stop = first.shutdown();
    await tick;
    await stop;
    store = JSON.parse(readFileSync(file, "utf8"));
    expect(store.cursor).toBe("41064466");
    const restarted = make();
    await restarted.tick();
    await restarted.shutdown();
    expect(resumePoints).toEqual([null, "41064466"]);
    expect(db.incident.create).toHaveBeenCalledOnce();
    expect(store.events).toHaveLength(1);
    expect(db.incidentEvent.create).toHaveBeenCalledOnce();
    expect(exit.mock.calls).toEqual([[0], [0]]);
  } finally { unlinkSync(file); vi.resetAllMocks(); }
});
