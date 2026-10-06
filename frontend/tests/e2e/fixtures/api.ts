import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import type { APIRequestContext, APIResponse } from "@playwright/test";
import type {
  IssueDetail,
  IssueType,
  Me,
  Priority,
  UserRole,
} from "../../../src/api/types";

export const adminEmail = process.env.E2E_ADMIN_EMAIL ?? "admin@bugboard.local";
export const adminPassword =
  process.env.E2E_ADMIN_PASSWORD ?? "E2E-Admin-Ready-2026!";
export const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:8088";
export async function checkedJson<T>(response: APIResponse): Promise<T> {
  if (!response.ok())
    throw new Error(
      `HTTP ${response.status()} ${response.url()}: ${await response.text()}`,
    );
  if (response.status() === 204) return undefined as T;
  return (await response.json()) as T;
}
export async function csrf(
  request: APIRequestContext,
): Promise<Record<string, string>> {
  const value = await checkedJson<{ token: string; headerName: string }>(
    await request.get("/api/v1/auth/csrf"),
  );
  return { [value.headerName]: value.token };
}
export async function apiRead<T>(
  request: APIRequestContext,
  path: string,
): Promise<T> {
  return checkedJson<T>(await request.get("/api/v1" + path));
}
export async function apiWrite<T>(
  request: APIRequestContext,
  path: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  data?: unknown,
): Promise<T> {
  return checkedJson<T>(
    await request.fetch("/api/v1" + path, {
      method,
      headers: await csrf(request),
      data,
    }),
  );
}
export async function login(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<Me> {
  return apiWrite<Me>(request, "/auth/login", "POST", { email, password });
}
export async function createUser(
  request: APIRequestContext,
  role: UserRole = "MEMBER",
) {
  const id = randomUUID();
  const email = `e2e-${role.toLowerCase()}-${id}@example.test`;
  const displayName = `E2E ${role} ${id.slice(0, 8)}`;
  const temporaryPassword = "E2E-Temporary-2026!";
  const password = `E2E-Changed-${id}!`;
  const user = await apiWrite<Me>(request, "/admin/users", "POST", {
    email,
    displayName,
    password: temporaryPassword,
    role,
  });
  expect(user.mustChangePassword).toBe(true);
  return { user, email, displayName, password, temporaryPassword };
}
export interface CreateIssueFields {
  title?: string;
  description?: string;
  type?: IssueType;
  priority?: Priority;
  labelIds?: string[];
}
export async function createIssue(
  request: APIRequestContext,
  fields: CreateIssueFields = {},
): Promise<IssueDetail> {
  const body = {
    title: `E2E issue ${randomUUID().slice(0, 8)}`,
    description:
      "Descrizione riproducibile per la verifica con il backend reale.",
    type: "BUG",
    priority: "MEDIUM",
    labelIds: [],
    ...fields,
  };
  return checkedJson<IssueDetail>(
    await request.post("/api/v1/issues", {
      headers: { ...(await csrf(request)), "Idempotency-Key": randomUUID() },
      multipart: {
        issue: {
          name: "issue.json",
          mimeType: "application/json",
          buffer: Buffer.from(JSON.stringify(body)),
        },
      },
    }),
  );
}
