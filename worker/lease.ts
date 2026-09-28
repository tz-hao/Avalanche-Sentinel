import { prisma } from "@/server/db";

const LEASE_MS = 55_000;

export async function acquireMonitorLease(monitorId: string, workerId: string) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LEASE_MS);
  const result = await prisma.monitorState.updateMany({
    where: { monitorId, OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }, { leaseOwner: workerId }] },
    data: { leaseOwner: workerId, leaseExpiresAt: expiresAt },
  });
  return result.count === 1;
}

export async function releaseMonitorLease(monitorId: string, workerId: string) {
  await prisma.monitorState.updateMany({ where: { monitorId, leaseOwner: workerId }, data: { leaseOwner: null, leaseExpiresAt: null } });
}
