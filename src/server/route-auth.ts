import { hasAdminSession, isAdminPasswordConfigured } from "@/server/auth";
import { apiError } from "@/server/http";

export async function requireAdmin() {
  if (!isAdminPasswordConfigured()) return { response: apiError(503, "AUTH_NOT_CONFIGURED", "管理员会话尚未配置。") } as const;
  try {
    if (await hasAdminSession()) return { response: null } as const;
    return { response: apiError(401, "UNAUTHORIZED", "请先以管理员身份登录。") } as const;
  } catch {
    return { response: apiError(503, "AUTH_NOT_CONFIGURED", "管理员会话尚未配置。") } as const;
  }
}
