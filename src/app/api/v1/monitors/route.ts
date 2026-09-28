import { createMonitorSchema } from "@/contracts/monitor-config";
import { apiError, data, unexpectedError } from "@/server/http";
import { createMonitor, listMonitors } from "@/server/monitors";
import { requireAdmin } from "@/server/route-auth";

export async function GET() {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  try { return data({ monitors: await listMonitors() }); } catch (error) { return unexpectedError(error); }
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  try {
    const parsed = createMonitorSchema.safeParse(await request.json());
    if (!parsed.success) return apiError(400, "INVALID_MONITOR", "监控配置无效。", parsed.error.flatten());
    const monitor = await createMonitor(parsed.data);
    return data({ monitor }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "CHAIN_NOT_FOUND") return apiError(404, "CHAIN_NOT_FOUND", "目标链不存在或未启用。");
    return unexpectedError(error);
  }
}
