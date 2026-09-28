import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "sentinel_admin";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function getSecret() {
  const value = process.env.SENTINEL_SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("SENTINEL_SESSION_SECRET 未配置或长度不足");
  return value;
}

function sign(payload: string) {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

export function isAdminPasswordConfigured() {
  return Boolean(process.env.SENTINEL_ADMIN_PASSWORD && process.env.SENTINEL_SESSION_SECRET);
}

export function verifyAdminPassword(password: string) {
  const expected = process.env.SENTINEL_ADMIN_PASSWORD;
  if (!expected) return false;
  const left = Buffer.from(password);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createAdminSession() {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = Buffer.from(JSON.stringify({ role: "admin", expiresAt })).toString("base64url");
  return { token: `${payload}.${sign(payload)}`, expiresAt: new Date(expiresAt) };
}

export function verifyAdminSession(token?: string) {
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  const expected = sign(payload);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { role?: string; expiresAt?: number };
    return parsed.role === "admin" && typeof parsed.expiresAt === "number" && parsed.expiresAt > Date.now();
  } catch {
    return false;
  }
}

export async function hasAdminSession() {
  const store = await cookies();
  return verifyAdminSession(store.get(COOKIE_NAME)?.value);
}

export function sessionCookie(token: string, expiresAt: Date) {
  return { name: COOKIE_NAME, value: token, httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", expires: expiresAt };
}

export const clearSessionCookie = { name: COOKIE_NAME, value: "", httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 0 };
