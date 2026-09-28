import type { MonitorStatus, Prisma } from "@prisma/client";
import { createMonitorSchema, type CreateMonitorInput } from "@/contracts/monitor-config";
import { prisma } from "@/server/db";
import { serializeMonitor } from "@/server/serializers";

const monitorInclude = { chain: true, state: true } as const;

export async function listMonitors() {
  const monitors = await prisma.monitor.findMany({ include: monitorInclude, orderBy: { createdAt: "desc" } });
  return monitors.map(serializeMonitor);
}

export async function createMonitor(input: CreateMonitorInput) {
  const parsed = createMonitorSchema.parse(input);
  const chain = await prisma.chain.findUnique({ where: { id: parsed.chainId } });
  if (!chain || !chain.enabled) throw new Error("CHAIN_NOT_FOUND");
  const monitor = await prisma.monitor.create({
    data: {
      type: parsed.type,
      chainId: parsed.chainId,
      target: parsed.target,
      configJson: parsed.config as Prisma.InputJsonValue,
      intervalSec: parsed.intervalSec,
      state: { create: {} },
    },
    include: monitorInclude,
  });
  return serializeMonitor(monitor);
}

export async function updateMonitor(id: string, patch: { enabled?: boolean; intervalSec?: number }) {
  const monitor = await prisma.monitor.update({
    where: { id },
    data: {
      ...(typeof patch.enabled === "boolean" ? { enabled: patch.enabled } : {}),
      ...(typeof patch.intervalSec === "number" ? { intervalSec: patch.intervalSec } : {}),
    },
    include: monitorInclude,
  });
  return serializeMonitor(monitor);
}

export async function recordMonitorStatus(id: string, status: MonitorStatus, state: { latencyMs?: number; lastError?: string | null; consecutiveFail?: number; cursorBlock?: bigint; destinationCursorBlock?: bigint }) {
  await prisma.$transaction([
    prisma.monitor.update({ where: { id }, data: { status } }),
    prisma.monitorState.upsert({
      where: { monitorId: id },
      create: { monitorId: id, lastStatus: status, lastCheckAt: new Date(), ...state },
      update: { lastStatus: status, lastCheckAt: new Date(), ...state },
    }),
  ]);
}
