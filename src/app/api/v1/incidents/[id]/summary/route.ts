import { generateIncidentSummary } from "@/server/ai-summary";
import { getIncident } from "@/server/incidents";
import { apiError, data, unexpectedError } from "@/server/http";
import { requireAdmin } from "@/server/route-auth";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    const incident = await getIncident(id);
    if (!incident) return apiError(404, "INCIDENT_NOT_FOUND", "Incident 不存在。");
    const generated = await generateIncidentSummary(incident);
    if (!generated) return apiError(409, "AI_NOT_CONFIGURED", "AI Summary 尚未配置。");
    return data({ summary: generated.summary, evidenceHash: generated.evidenceHash, generatedAt: new Date().toISOString(), source: "AI" }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError" || error.message.startsWith("AI_SUMMARY_"))) return apiError(503, "AI_SUMMARY_UNAVAILABLE", "AI Summary 暂不可用；原始 Evidence 不受影响。");
    return unexpectedError(error);
  }
}
