import { z } from "zod";
import { apiError, data, unexpectedError } from "@/server/http";
import { updateMonitor } from "@/server/monitors";
import { requireAdmin } from "@/server/route-auth";

const patchSchema = z.object({ enabled: z.boolean().optional(), intervalSec: z.number().int().min(15).max(3600).optional(), target: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(), config: z.record(z.unknown()).optional() }).refine(value => Object.keys(value).length > 0, "没有可更新字段");

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  try {
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) return apiError(400, "INVALID_MONITOR_PATCH", "监控更新无效。", parsed.error.flatten());
    const { id } = await params;
    return data({ monitor: await updateMonitor(id, parsed.data) });
  } catch (error) {
    if (error instanceof z.ZodError) return apiError(400, "INVALID_MONITOR_PATCH", "监控配置无效。", error.flatten());
    if (error instanceof Error && error.message === "MONITOR_MUST_BE_DISABLED") return apiError(409, error.message, "请先停用监控，再编辑配置。");
    if (error instanceof Error && error.message === "MONITOR_BUSY") return apiError(409, error.message, "监控仍在完成当前巡检，请稍后重试。");
    if (error instanceof Error && error.message === "MONITOR_NOT_FOUND") return apiError(404, error.message, "监控不存在。");
    return unexpectedError(error);
  }
}
