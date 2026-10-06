import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient, ApiError, NetworkError } from "./ApiClient";
const json = (
  value: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("ApiClient HTTP guarantees", () => {
  it("uses the configured public API root for both CSRF and authenticated mutations", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://api.bugboard.example/api/v1/");
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ token: "t" }))
      .mockResolvedValueOnce(json({ id: "account" }));
    vi.stubGlobal("fetch", fetcher);
    vi.resetModules();
    const { api: configuredApi } = await import("./ApiClient");
    await configuredApi.post("/auth/login", {
      email: "admin@example.test",
      password: "literal-password",
    });
    expect(fetcher.mock.calls.map((call) => call[0])).toEqual([
      "https://api.bugboard.example/api/v1/auth/csrf",
      "https://api.bugboard.example/api/v1/auth/login",
    ]);
    expect(fetcher.mock.calls[1]?.[1]?.credentials).toBe("include");
  });
  it("rejects public API roots that embed credentials or executable URL schemes", async () => {
    for (const value of [
      "https://user:private@api.example.test/api/v1",
      "javascript:alert(1)",
      "//api.example.test/api/v1",
      "/api/v1?token=private",
    ]) {
      vi.stubEnv("VITE_API_BASE_URL", value);
      vi.resetModules();
      await expect(import("./ApiClient")).rejects.toThrow();
    }
  });
  it("obtains CSRF, keeps credentials, rotates request IDs and forwards the exact mutation body", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json({ token: "csrf-private", headerName: "X-CSRF-TOKEN" }),
      )
      .mockResolvedValueOnce(json({ id: "account" }));
    const client = new ApiClient("/api/v1", fetcher);
    await client.post("/auth/login", {
      email: "admin@example.test",
      password: "  literal-password  ",
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/v1/auth/csrf");
    const options = fetcher.mock.calls[1]?.[1];
    expect(options?.credentials).toBe("include");
    expect(options?.headers).toMatchObject({
      "X-CSRF-TOKEN": "csrf-private",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(options?.body))).toEqual({
      email: "admin@example.test",
      password: "  literal-password  ",
    });
    expect(
      (options?.headers as Record<string, string>)["X-Request-ID"],
    ).toMatch(/^[\da-f-]{36}$/);
  });
  it("shares an in-flight CSRF request across mutations without retrying mutations", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ token: "t" }))
      .mockRejectedValue(new TypeError("offline"));
    const client = new ApiClient("/api/v1", fetcher);
    const results = await Promise.allSettled([
      client.put("/first", {}),
      client.put("/second", {}),
    ]);
    expect(results.every((result) => result.status === "rejected")).toBe(true);
    expect(
      fetcher.mock.calls.filter((call) =>
        String(call[0]).endsWith("/auth/csrf"),
      ),
    ).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("retries a GET exactly once after one second on service unavailable", async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json(
          { code: "SERVICE_UNAVAILABLE", detail: "Database indisponibile" },
          503,
        ),
      )
      .mockResolvedValueOnce(json({ count: 8 }));
    const result = new ApiClient("/api/v1", fetcher).get(
      "/notifications/unread-count",
    );
    await vi.advanceTimersByTimeAsync(999);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toEqual({ count: 8 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("never retries authentication failures and preserves a typed safe problem", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      json(
        {
          code: "AUTHENTICATION_REQUIRED",
          detail: "Accedi di nuovo",
          requestId: "request",
          fieldErrors: [],
        },
        401,
      ),
    );
    const client = new ApiClient("/api/v1", fetcher);
    const listener = vi.fn();
    client.onSessionError(listener);
    await expect(client.get("/issues")).rejects.toMatchObject({
      status: 401,
      code: "AUTHENTICATION_REQUIRED",
      problem: { detail: "Accedi di nuovo" },
    });
    expect(listener).toHaveBeenCalledWith("AUTHENTICATION_REQUIRED");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("preserves Retry-After without exposing unreadable server pages", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("<html>private path</html>", {
        status: 429,
        headers: { "Retry-After": "45" },
      }),
    );
    try {
      await new ApiClient("/api/v1", fetcher).get("/issues");
      throw new Error("Expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).retryAfter).toBe(45);
      expect((error as Error).message).not.toContain("private path");
    }
  });
  it("aborts a stale request and does not retry it", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(
        (_url, options) =>
          new Promise((_resolve, reject) =>
            options?.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            ),
          ),
      );
    const controller = new AbortController();
    const result = new ApiClient("/api/v1", fetcher).get("/issues", {
      signal: controller.signal,
    });
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("reports a timeout separately from an HTTP rejection", async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(
        (_url, options) =>
          new Promise((_resolve, reject) =>
            options?.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            ),
          ),
      );
    const result = new ApiClient("/api/v1", fetcher).get("/issues", {
      timeoutMs: 10,
      retry: false,
    });
    const expectation = expect(result).rejects.toBeInstanceOf(NetworkError);
    await vi.advanceTimersByTimeAsync(10);
    await expectation;
  });
  it("does not stringify multipart, and preserves its idempotency key", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ token: "t" }))
      .mockResolvedValueOnce(json({ id: "issue" }));
    const form = new FormData();
    form.set("issue", new Blob(["{}"], { type: "application/json" }));
    await new ApiClient("/api/v1", fetcher).post("/issues", form, {
      idempotencyKey: "same-key",
      timeoutMs: 30000,
    });
    const options = fetcher.mock.calls[1]?.[1];
    expect(options?.body).toBe(form);
    expect(options?.headers).not.toHaveProperty("Content-Type");
    expect(options?.headers).toHaveProperty("Idempotency-Key", "same-key");
  });
});
