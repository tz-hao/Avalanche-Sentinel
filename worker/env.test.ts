import { afterEach, expect, it, vi } from "vitest";
const load = vi.hoisted(() => vi.fn());
vi.mock("@next/env", () => ({ loadEnvConfig: load }));
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); vi.clearAllMocks(); });

it("Production does not load .env.local; injected configuration is preserved", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("DATABASE_URL", "fixture-injected-url");
  await import("./env");
  expect(load).not.toHaveBeenCalled();
  expect(process.env.DATABASE_URL).toBe("fixture-injected-url");
});

it("keeps explicit local development env loading", async () => {
  vi.stubEnv("NODE_ENV", "development");
  await import("./env");
  expect(load).toHaveBeenCalledWith(process.cwd());
});
