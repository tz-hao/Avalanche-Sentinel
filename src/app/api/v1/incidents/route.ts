import { z } from "zod";
import { apiError, data, unexpectedError } from "@/server/http";
import { listIncidentPage } from "@/server/incidents";
import { incidentQuerySchema } from "@/contracts/incident-query";
import { requireAdmin } from "@/server/route-auth";

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  try {
    const query = incidentQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return data(await listIncidentPage(query));
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof Error && error.message === "INVALID_INCIDENT_CURSOR") return apiError(400, "INVALID_INCIDENT_QUERY", "事件筛选条件或分页游标无效。");
    return unexpectedError(error);
  }
}
