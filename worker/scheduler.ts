import { safeError } from "@/server/safe-error";

export const SHUTDOWN_TIMEOUT_MS = 30_000;

export function createScheduler(options: {
  tick: (stopping: () => boolean) => Promise<void>;
  disconnect: () => Promise<void>;
  exit: (code: number) => void;
  log: (message: string) => void;
  heartbeat?: () => Promise<void>;
  backgroundTask?: (stopping: () => boolean) => Promise<void>;
  intervalMs?: number;
  shutdownTimeoutMs?: number;
}) {
  let stopping = false;
  let started = false;
  let active: Promise<void> | undefined;
  let heartbeatActive: Promise<void> | undefined;
  let backgroundActive: Promise<void> | undefined;
  let interval: ReturnType<typeof setInterval> | undefined;
  let shutdownPromise: Promise<void> | undefined;

  function tick() {
    if (stopping || active) return active ?? Promise.resolve();
    active = Promise.resolve().then(() => stopping ? undefined : options.tick(() => stopping))
      .catch((error: unknown) => options.log(`Worker tick failed: ${safeError(error)}`))
      .finally(() => { active = undefined; });
    return active;
  }

  function start() {
    if (started || stopping) return;
    started = true;
    const cycle = () => {
      if (stopping) return;
      if (options.heartbeat && !heartbeatActive) heartbeatActive = Promise.resolve().then(() => stopping ? undefined : options.heartbeat!()).catch(error => options.log(`Worker heartbeat failed: ${safeError(error)}`)).finally(() => { heartbeatActive = undefined; });
      if (options.backgroundTask && !backgroundActive) backgroundActive = Promise.resolve().then(() => stopping ? undefined : options.backgroundTask!(() => stopping)).catch(error => options.log(`Worker notifications failed: ${safeError(error)}`)).finally(() => { backgroundActive = undefined; });
      void tick();
    };
    interval = setInterval(cycle, options.intervalMs ?? 5_000);
    cycle();
  }

  function shutdown() {
    if (shutdownPromise) return shutdownPromise;
    stopping = true;
    clearInterval(interval);
    options.log("Worker shutdown requested");
    shutdownPromise = (async () => {
      const deadline = setTimeout(() => {
        options.log("Worker shutdown timeout");
        options.exit(1);
      }, options.shutdownTimeoutMs ?? SHUTDOWN_TIMEOUT_MS);
      try {
        await Promise.all([active, heartbeatActive, backgroundActive]);
        await options.disconnect();
        options.log("Worker shutdown complete");
        options.exit(0);
      } catch (error) {
        options.log(`Worker shutdown failed: ${safeError(error)}`);
        options.exit(1);
      } finally { clearTimeout(deadline); }
    })();
    return shutdownPromise;
  }

  return { start, tick, shutdown };
}
