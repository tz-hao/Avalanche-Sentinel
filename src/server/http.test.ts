import { afterEach, describe, expect, it, vi } from "vitest";
import { unexpectedError } from "@/server/http";

afterEach(() => vi.restoreAllMocks());

describe("unexpectedError", () => {
  it("does not log a provider error object or expose its credentials", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = unexpectedError(new Error("postgresql://user:secret@example.invalid/db"));

    expect(log).toHaveBeenCalledExactlyOnceWith("Sentinel API error");
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: { code: "INTERNAL_ERROR" } });
  });
});
