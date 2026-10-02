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
    const category = error instanceof Error && (/^AI_SUMMARY_HTTP_\d{3}$/.test(error.message) || ["AI_SUMMARY_MALFORMED_OUTPUT", "AI_SUMMARY_UNSUPPORTED_CLAIM", "AI_SUMMARY_ICM_SEMANTICS", "AI_SUMMARY_PROVIDER_UNAVAILABLE", "AI_SUMMARY_INVALID_ENDPOINT"].includes(error.message)) ? error.message : error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name) ? "AI_SUMMARY_TIMEOUT" : "AI_SUMMARY_INTERNAL_ERROR";
    console.warn("Sentinel AI summary failed", { category });
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) return apiError(503, "AI_SUMMARY_TIMEOUT", "AI 摘要生成超时，请稍后重试。");
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError" || error.message.startsWith("AI_SUMMARY_"))) return apiError(503, "AI_SUMMARY_UNAVAILABLE", "AI Summary 暂不可用；原始 Evidence 不受影响。");
    return unexpectedError(error);
  }
}
