import "./env";
import { prisma } from "@/server/db";
import { getIncident } from "@/server/incidents";
import { deliverPendingNotifications } from "@/server/notifications";
import { acquireMonitorLease, releaseMonitorLease } from "./lease";
import { runMonitor } from "./monitor-runner";
import { safeError } from "@/server/safe-error";
import { createScheduler } from "./scheduler";

const workerId = process.env.WORKER_ID || `sentinel-${process.pid}`;
const startedAt = new Date();
async function heartbeat(completed = false) {
  const now = new Date();
  await prisma.workerHeartbeat.upsert({ where: { workerId }, create: { workerId, startedAt, lastHeartbeatAt: now, ...(completed ? { lastTickCompletedAt: now } : {}) }, update: { startedAt, ...(completed ? { lastTickCompletedAt: now } : { lastHeartbeatAt: now }) } });
}
let initialReadLogged = false;
async function tick(stopping: () => boolean) {
  const monitors = await prisma.monitor.findMany({ where: { enabled: true }, include: { chain: true, state: true } });
  if (!initialReadLogged) {
    console.log(`Worker initial database read complete; enabled monitors=${monitors.length}`);
    initialReadLogged = true;
  }
  for (const monitor of monitors) {
    if (stopping()) break;
    const due = !monitor.state?.lastCheckAt || Date.now() - monitor.state.lastCheckAt.getTime() >= monitor.intervalSec * 1000;
    if (!due || !(await acquireMonitorLease(monitor.id, workerId))) continue;
    try { if (!stopping()) await runMonitor(monitor); }
    catch (error) { console.error(`Monitor failed: ${safeError(error)}`); }
    finally { await releaseMonitorLease(monitor.id, workerId); }
  }
  if (!stopping()) await heartbeat(true);
}

const scheduler = createScheduler({ tick, heartbeat, backgroundTask: async (stopping) => { if (!stopping() && process.env.SENTINEL_DISABLE_EXTERNAL_NOTIFICATIONS !== "1") await deliverPendingNotifications(getIncident, { stopping }); }, disconnect: () => prisma.$disconnect(), exit: (code) => process.exit(code), log: (message) => console.log(message) });
process.on("SIGTERM", () => { console.log("Worker SIGTERM received"); void scheduler.shutdown(); });
process.on("SIGINT", () => { void scheduler.shutdown(); });
console.log("Worker scheduler starting");
scheduler.start();
