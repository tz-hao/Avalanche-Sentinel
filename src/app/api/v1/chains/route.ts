import { z } from "zod";
import { apiError, data, unexpectedError } from "@/server/http";
import { prisma } from "@/server/db";
import { requireAdmin } from "@/server/route-auth";

const chainSchema = z.object({ name: z.string().min(1).max(100), chainId: z.string().regex(/^\d+$/), rpcUrl: z.string().url(), explorerUrl: z.string().url().optional(), enabled: z.boolean().default(true) });

export async function GET() {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  try {
    const chains = await prisma.chain.findMany({ orderBy: { name: "asc" } });
    return data({ chains: chains.map((chain) => ({ ...chain, chainId: chain.chainId.toString() })) });
  } catch (error) { return unexpectedError(error); }
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  try {
    const parsed = chainSchema.safeParse(await request.json());
    if (!parsed.success) return apiError(400, "INVALID_CHAIN", "链配置无效。", parsed.error.flatten());
    const chain = await prisma.chain.create({ data: { ...parsed.data, chainId: BigInt(parsed.data.chainId) } });
    return data({ chain: { ...chain, chainId: chain.chainId.toString() } }, { status: 201 });
  } catch (error) { return unexpectedError(error); }
}
