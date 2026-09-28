import { z } from "zod";
import { apiError, data, unexpectedError } from "@/server/http";
import { updateMonitor } from "@/server/monitors";
import { requireAdmin } from "@/server/route-auth";

const patchSchema = z.object({ enabled: z.boolean().optional(), intervalSec: z.number().int().min(15).max(3600).optional() }).refine((value) => value.enabled !== undefined || value.intervalSec !== undefined, "没有可更新字段");

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  try {
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) return apiError(400, "INVALID_MONITOR_PATCH", "监控更新无效。", parsed.error.flatten());
    const { id } = await params;
    return data({ monitor: await updateMonitor(id, parsed.data) });
  } catch (error) {
    if (error instanceof Error && error.name === "PrismaClientKnownRequestError") return apiError(404, "MONITOR_NOT_FOUND", "监控不存在。");
    return unexpectedError(error);
  }
}
