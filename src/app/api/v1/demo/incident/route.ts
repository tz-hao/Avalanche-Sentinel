import { demoModeEnabled, createDemoIncident } from "@/server/demo";
import { apiError, data, unexpectedError } from "@/server/http";
import { requireAdmin } from "@/server/route-auth";

export async function POST() {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  if (!demoModeEnabled()) return apiError(404, "DEMO_DISABLED", "Demo Mode 未启用。");
  try { return data({ incident: await createDemoIncident() }, { status: 201 }); }
  catch (error) { if (error instanceof Error && error.message === "NO_MONITOR") return apiError(409, "NO_MONITOR", "请先创建至少一个启用的 Monitor。"); return unexpectedError(error); }
}
