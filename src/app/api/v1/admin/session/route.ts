import { NextResponse } from "next/server";
import { z } from "zod";
import { clearSessionCookie, createAdminSession, isAdminPasswordConfigured, sessionCookie, verifyAdminPassword } from "@/server/auth";
import { apiError, data, unexpectedError } from "@/server/http";

const bodySchema = z.object({ password: z.string().min(1).max(1024) });

export async function POST(request: Request) {
  if (!isAdminPasswordConfigured()) return apiError(503, "AUTH_NOT_CONFIGURED", "管理员会话尚未配置。");
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) return apiError(400, "INVALID_REQUEST", "请输入管理员口令。");
    if (!verifyAdminPassword(parsed.data.password)) return apiError(401, "INVALID_CREDENTIALS", "管理员口令无效。");
    const session = createAdminSession();
    const response = data({ expiresAt: session.expiresAt.toISOString() });
    response.cookies.set(sessionCookie(session.token, session.expiresAt));
    return response;
  } catch (error) { return unexpectedError(error); }
}

export async function DELETE() {
  const response = NextResponse.json({ data: { loggedOut: true } });
  response.cookies.set(clearSessionCookie);
  return response;
}
