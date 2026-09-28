import { getOverview } from "@/server/overview";
import { data, unexpectedError } from "@/server/http";
import { requireAdmin } from "@/server/route-auth";

export async function GET() {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  try { return data(await getOverview()); } catch (error) { return unexpectedError(error); }
}
