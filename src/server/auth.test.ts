import { afterEach, describe, expect, it } from "vitest";
import { createAdminSession, verifyAdminPassword, verifyAdminSession } from "@/server/auth";

const original = { password: process.env.SENTINEL_ADMIN_PASSWORD, secret: process.env.SENTINEL_SESSION_SECRET };

afterEach(() => {
  process.env.SENTINEL_ADMIN_PASSWORD = original.password;
  process.env.SENTINEL_SESSION_SECRET = original.secret;
});

describe("single-admin sessions", () => {
  it("uses a signed, tamper-evident session instead of storing the password", () => {
    process.env.SENTINEL_ADMIN_PASSWORD = "correct-horse-battery-staple";
    process.env.SENTINEL_SESSION_SECRET = "0123456789abcdef0123456789abcdef";
    expect(verifyAdminPassword("correct-horse-battery-staple")).toBe(true);
    expect(verifyAdminPassword("incorrect")).toBe(false);
    const { token } = createAdminSession();
    expect(verifyAdminSession(token)).toBe(true);
    expect(verifyAdminSession(`${token}x`)).toBe(false);
  });
});
