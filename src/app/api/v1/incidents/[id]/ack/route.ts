import { apiError, data, unexpectedError } from "@/server/http";
import { acknowledgeIncident } from "@/server/incidents";
import { requireAdmin } from "@/server/route-auth";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    const incident = await acknowledgeIncident(id);
    return incident ? data({ incident }) : apiError(404, "INCIDENT_NOT_FOUND", "Incident 不存在。");
  } catch (error) { return unexpectedError(error); }
}
