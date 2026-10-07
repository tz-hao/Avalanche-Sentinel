import { afterEach, describe, expect, it, vi } from "vitest";
import { createScheduler } from "./scheduler";
import { safeError } from "@/server/safe-error";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

function fixture(tick = vi.fn(async () => {}), disconnect = vi.fn(async () => {})) {
  const exit = vi.fn();
  const log = vi.fn();
  return { tick, disconnect, exit, log, scheduler: createScheduler({ tick, disconnect, exit, log, intervalMs: 10, shutdownTimeoutMs: 50 }) };
}

describe("Worker graceful shutdown", () => {
  it("keeps ticks and heartbeats progressing while one notification dispatch is pending", async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const backgroundTask = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const tick = vi.fn(async () => {});
    const heartbeat = vi.fn(async () => {});
    const disconnect = vi.fn(async () => {});
    const exit = vi.fn();
    const scheduler = createScheduler({ tick, heartbeat, backgroundTask, disconnect, exit, log: vi.fn(), intervalMs: 10 });
    scheduler.start();
    await vi.advanceTimersByTimeAsync(30);
    expect(backgroundTask).toHaveBeenCalledOnce();
    expect(tick.mock.calls.length).toBeGreaterThan(1);
    expect(heartbeat.mock.calls.length).toBeGreaterThan(1);
    const count = tick.mock.calls.length;
    const shutdown = scheduler.shutdown();
    await vi.advanceTimersByTimeAsync(20);
    expect(tick).toHaveBeenCalledTimes(count);
    expect(disconnect).not.toHaveBeenCalled();
    finish();
    await shutdown;
    expect(disconnect).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(0);
  });
  it("stops before the first tick and disconnects cleanly", async () => {
    const f = fixture();
    await f.scheduler.shutdown();
    f.scheduler.start();
    await f.scheduler.tick();
    expect(f.tick).not.toHaveBeenCalled();
    expect(f.disconnect).toHaveBeenCalledOnce();
    expect(f.exit).toHaveBeenCalledWith(0);
  });

  it("does not execute a queued first tick after shutdown", async () => {
    const f = fixture();
    f.scheduler.start();
    await f.scheduler.shutdown();
    expect(f.tick).not.toHaveBeenCalled();
  });

  it("drains one active tick without starting another; repeated signals are idempotent", async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const f = fixture(vi.fn(() => new Promise<void>((resolve) => { finish = resolve; })));
    f.scheduler.start();
    await vi.advanceTimersByTimeAsync(25);
    expect(f.tick).toHaveBeenCalledOnce();
    const shutdown = f.scheduler.shutdown();
    expect(f.scheduler.shutdown()).toBe(shutdown);
    await vi.advanceTimersByTimeAsync(20);
    const active = f.scheduler.tick();
    finish();
    await active;
    await shutdown;
    await vi.advanceTimersByTimeAsync(100);
    expect(f.tick).toHaveBeenCalledOnce();
    expect(f.disconnect).toHaveBeenCalledOnce();
    expect(f.exit).toHaveBeenCalledWith(0);
  });

  it("waits for persistence before disconnect and exit", async () => {
    let finish!: () => void;
    const persisted: string[] = [];
    const f = fixture(vi.fn(() => new Promise<void>((resolve) => { finish = () => { persisted.push("cursor"); resolve(); }; })), vi.fn(async () => { persisted.push("disconnect"); }));
    const tick = f.scheduler.tick();
    await Promise.resolve();
    const shutdown = f.scheduler.shutdown();
    expect(f.exit).not.toHaveBeenCalled();
    finish();
    await tick;
    await shutdown;
    await f.scheduler.tick();
    expect(persisted).toEqual(["cursor", "disconnect"]);
    expect(f.tick).toHaveBeenCalledOnce();
    expect(f.exit).toHaveBeenCalledWith(0);
  });

  it("forces termination at the bounded timeout for a hung tick", async () => {
    vi.useFakeTimers();
    const f = fixture(vi.fn(() => new Promise<void>(() => {})));
    void f.scheduler.tick();
    await Promise.resolve();
    void f.scheduler.shutdown();
    await vi.advanceTimersByTimeAsync(49);
    expect(f.exit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(f.exit).toHaveBeenCalledWith(1);
    expect(f.disconnect).not.toHaveBeenCalled();
  });

  it("bounds a hung disconnect too", async () => {
    vi.useFakeTimers();
    const f = fixture(undefined, vi.fn(() => new Promise<void>(() => {})));
    void f.scheduler.shutdown();
    await vi.advanceTimersByTimeAsync(50);
    expect(f.exit).toHaveBeenCalledWith(1);
  });
});

describe("Worker safe errors", () => {
  it("never emits credential-bearing errors, custom names, causes, stacks or objects", async () => {
    const secret = "fixture-only-secret-m8b";
    const error = Object.assign(new Error(`postgresql://user:${secret}@db ${secret}`), { name: secret, code: secret, cause: { headers: { authorization: secret } } });
    const f = fixture(vi.fn(async () => { throw error; }));
    await f.scheduler.tick();
    await f.scheduler.shutdown();
    const output = JSON.stringify(f.log.mock.calls);
    expect(output).not.toContain(secret);
    expect(output).not.toContain("postgresql:");
    expect(output).not.toContain("authorization");
    expect(safeError({ token: secret })).toBe("UnknownError");
    expect(safeError(new TypeError(secret))).toBe("TypeError");
    expect(f.exit).toHaveBeenCalledWith(0);
  });
});
