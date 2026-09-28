import { z } from "zod";
import { data, unexpectedError } from "@/server/http";
import { listIncidents } from "@/server/incidents";
import { requireAdmin } from "@/server/route-auth";

const querySchema = z.object({ severity: z.enum(["INFO", "WARNING", "CRITICAL"]).optional(), status: z.enum(["OPEN", "ACKNOWLEDGED", "RECOVERED"]).optional(), limit: z.coerce.number().int().min(1).max(100).optional() });

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  try {
    const query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return data({ incidents: await listIncidents(query) });
  } catch (error) { return unexpectedError(error); }
}
