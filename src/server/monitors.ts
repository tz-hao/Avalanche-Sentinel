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
      enabled: parsed.enabled ?? false,
      state: { create: {} },
    },
    include: monitorInclude,
  });
  return serializeMonitor(monitor);
}

export async function updateMonitor(id: string, patch: { enabled?: boolean; intervalSec?: number; target?: string; config?: Record<string, unknown> }) {
  return prisma.$transaction(async tx => {
    const current = await tx.monitor.findUnique({ where: { id }, include: monitorInclude });
    if (!current) throw new Error("MONITOR_NOT_FOUND");
    const editing = patch.config !== undefined || patch.target !== undefined || patch.intervalSec !== undefined;
    if (editing) {
      if (current.enabled) throw new Error("MONITOR_MUST_BE_DISABLED");
      createMonitorSchema.parse({ type: current.type, chainId: current.chainId, target: patch.target ?? current.target ?? undefined, intervalSec: patch.intervalSec ?? current.intervalSec, config: patch.config ?? current.configJson });
    }
    const result = await tx.monitor.updateMany({
      where: { id, ...(editing ? { enabled: false, state: { OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: new Date() } }] } } : {}) },
      data: {
      ...(typeof patch.enabled === "boolean" ? { enabled: patch.enabled } : {}),
      ...(typeof patch.intervalSec === "number" ? { intervalSec: patch.intervalSec } : {}),
      ...(patch.target !== undefined ? { target: patch.target } : {}),
      ...(patch.config !== undefined ? { configJson: patch.config as Prisma.InputJsonValue } : {}),
    },
    });
    if (!result.count) throw new Error("MONITOR_BUSY");
    if (editing || patch.enabled === true && !current.enabled) await tx.monitorState.update({ where: { monitorId: id }, data: { lastCheckAt: null, lastStatus: "UNKNOWN", lastError: null, consecutiveFail: 0 } });
    if (editing || patch.enabled === true && !current.enabled) await tx.monitor.update({ where: { id }, data: { status: "UNKNOWN" } });
    return serializeMonitor(await tx.monitor.findUniqueOrThrow({ where: { id }, include: monitorInclude }));
  });
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
