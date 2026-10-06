import type { Problem } from "./types";
import { apiConfiguration } from "./apiConfiguration";
export class ApiError extends Error {
  constructor(
    public readonly problem: Problem,
    public readonly retryAfter: number | null = null,
  ) {
    super(problem.detail);
    this.name = "ApiError";
  }
  get status() {
    return this.problem.status;
  }
  get code() {
    return this.problem.code;
  }
}
export class NetworkError extends Error {
  constructor(public readonly timedOut: boolean) {
    super(
      timedOut
        ? "La richiesta ha superato il tempo disponibile."
        : "Non è stato possibile completare la richiesta. Riprova.",
    );
    this.name = "NetworkError";
  }
}
export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
  idempotencyKey?: string;
  responseType?: "json" | "blob";
  retry?: boolean;
}
type SessionListener = (code: string) => void;
export class ApiClient {
  private csrfToken: string | null = null;
  private csrfRequest: Promise<void> | null = null;
  private sessionListener: SessionListener | null = null;
  constructor(
    private readonly baseUrl = "/api/v1",
    private readonly fetcher: typeof fetch = (...args) => fetch(...args),
  ) {}
  onSessionError(listener: SessionListener | null) {
    this.sessionListener = listener;
  }
  clearCsrf() {
    this.csrfToken = null;
    this.csrfRequest = null;
  }
  private async ensureCsrf() {
    if (this.csrfToken) return;
    if (!this.csrfRequest)
      this.csrfRequest = this.request<{
        token: string;
        headerName: string;
      }>("/auth/csrf")
        .then((data) => {
          this.csrfToken = data.token;
        })
        .finally(() => {
          this.csrfRequest = null;
        });
    await this.csrfRequest;
  }
  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    if (!path.startsWith("/") || path.startsWith("//"))
      throw new Error("API path must be relative to the configured API root");
    const method = options.method ?? "GET";
    if (method !== "GET") await this.ensureCsrf();
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await this.send<T>(path, method, options);
      } catch (error) {
        const retryable =
          error instanceof NetworkError ||
          (error instanceof ApiError && error.status === 503);
        if (
          method !== "GET" ||
          options.retry === false ||
          attempt > 0 ||
          !retryable ||
          options.signal?.aborted
        )
          throw error;
        await new Promise<void>((resolve, reject) => {
          const signal = options.signal;
          const abort = () => {
            clearTimeout(timer);
            reject(new DOMException("Aborted", "AbortError"));
          };
          const timer = setTimeout(() => {
            signal?.removeEventListener("abort", abort);
            resolve();
          }, 1000);
          signal?.addEventListener("abort", abort, { once: true });
        });
      }
    }
    throw new NetworkError(false);
  }
  private async send<T>(
    path: string,
    method: string,
    options: RequestOptions,
  ): Promise<T> {
    const controller = new AbortController();
    if (options.signal?.aborted)
      throw new DOMException("Aborted", "AbortError");
    const abort = () => controller.abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, options.timeoutMs ?? 15000);
    const headers: Record<string, string> = {
      Accept: options.responseType === "blob" ? "*/*" : "application/json",
      "X-Request-ID": crypto.randomUUID(),
    };
    if (method !== "GET" && this.csrfToken)
      headers["X-CSRF-TOKEN"] = this.csrfToken;
    if (options.idempotencyKey)
      headers["Idempotency-Key"] = options.idempotencyKey;
    const multipart = options.body instanceof FormData;
    if (options.body !== undefined && !multipart)
      headers["Content-Type"] = "application/json";
    try {
      const response = await this.fetcher(this.baseUrl + path, {
        method,
        headers,
        credentials: "include",
        signal: controller.signal,
        body:
          options.body === undefined
            ? undefined
            : multipart
              ? (options.body as FormData)
              : JSON.stringify(options.body),
      });
      if (!response.ok) {
        const fallback: Problem = {
          type: "urn:bugboard:problem:INTERNAL_ERROR",
          title: "Richiesta non completata",
          status: response.status,
          detail: "Non è stato possibile completare la richiesta. Riprova.",
          instance: path,
          code: "INTERNAL_ERROR",
          requestId: response.headers.get("X-Request-ID") ?? "",
          fieldErrors: [],
        };
        let problem = fallback;
        if (response.headers.get("content-type")?.includes("json")) {
          try {
            problem = {
              ...fallback,
              ...((await response.json()) as Partial<Problem>),
            };
          } catch {
            /* Preserve the safe fallback for unreadable responses. */
          }
        }
        if (
          response.status === 401 ||
          (response.status === 403 &&
            problem.code === "PASSWORD_CHANGE_REQUIRED")
        )
          this.sessionListener?.(problem.code);
        const retryAfter = response.headers.get("Retry-After");
        throw new ApiError(
          problem,
          retryAfter !== null && /^\d+$/.test(retryAfter)
            ? Number(retryAfter)
            : null,
        );
      }
      if (response.status === 204) return undefined as T;
      if (options.responseType === "blob") return (await response.blob()) as T;
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (options.signal?.aborted)
        throw new DOMException("Aborted", "AbortError");
      throw new NetworkError(timedOut);
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abort);
    }
  }
  get<T>(path: string, options: Omit<RequestOptions, "method" | "body"> = {}) {
    return this.request<T>(path, { ...options, method: "GET" });
  }
  post<T>(
    path: string,
    body?: unknown,
    options: Omit<RequestOptions, "method" | "body"> = {},
  ) {
    return this.request<T>(path, { ...options, method: "POST", body });
  }
  put<T>(
    path: string,
    body?: unknown,
    options: Omit<RequestOptions, "method" | "body"> = {},
  ) {
    return this.request<T>(path, { ...options, method: "PUT", body });
  }
  patch<T>(
    path: string,
    body: unknown,
    options: Omit<RequestOptions, "method" | "body"> = {},
  ) {
    return this.request<T>(path, { ...options, method: "PATCH", body });
  }
  delete<T>(
    path: string,
    options: Omit<RequestOptions, "method" | "body"> = {},
  ) {
    return this.request<T>(path, { ...options, method: "DELETE" });
  }
}
export const api = new ApiClient(
  apiConfiguration(import.meta.env.VITE_API_BASE_URL).baseUrl,
);
