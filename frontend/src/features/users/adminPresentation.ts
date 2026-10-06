import { ApiError } from "../../api/ApiClient";
import { useSyncExternalStore } from "react";
import type { UserRole } from "../../api/types";
export const roleNames: Record<UserRole, string> = {
  ADMIN: "Amministratore",
  MEMBER: "Membro del team",
  VIEWER: "Lettore esterno",
};
export const roleDescriptions: Record<UserRole, string> = {
  ADMIN: "Gestione completa delle azioni valide",
  MEMBER: "Crea e commenta; modifica il lavoro assegnato",
  VIEWER: "Legge issue e commenti, senza modifiche",
};
export function fieldErrors(error: unknown): Record<string, string> {
  return error instanceof ApiError
    ? Object.fromEntries(
        error.problem.fieldErrors.map((field) => [field.field, field.message]),
      )
    : {};
}
export function normalizedName(
  value: string,
  min: number,
  max: number,
): string | null {
  const text = value.normalize("NFC").trim();
  return Array.from(text).length < min ||
    Array.from(text).length > max ||
    /[\p{Cc}\p{Cf}\p{Cs}]/u.test(text)
    ? `Usa da ${min} a ${max} caratteri, su una sola riga.`
    : null;
}
export function passwordError(value: string): string | null {
  return Array.from(value).length < 12 ||
    Array.from(value).length > 128 ||
    new TextEncoder().encode(value).byteLength > 512
    ? "Usa da 12 a 128 caratteri, fino a 512 byte UTF-8."
    : null;
}
export function dateTime(value: string): string {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
export interface AdminFilters {
  q: string;
  role: string;
  active: string;
  page: number;
  size: number;
  valid: boolean;
}
export function parseAdminFilters(
  params: URLSearchParams,
  labels = false,
): AdminFilters {
  const allowed = labels
    ? ["q", "active", "page", "size"]
    : ["q", "role", "active", "page", "size"];
  const q = params.get("q") ?? "",
    role = params.get("role") ?? "",
    active = params.get("active") ?? (labels ? "all" : "");
  const rawPage = params.get("page") ?? "0",
    rawSize = params.get("size") ?? "20";
  const page = Number(rawPage),
    size = Number(rawSize);
  const valid =
    [...params.keys()].every(
      (key) => allowed.includes(key) && params.getAll(key).length === 1,
    ) &&
    Array.from(q).length <= 100 &&
    !/[\p{Cc}\p{Cf}\p{Cs}]/u.test(q) &&
    (labels || ["", "ADMIN", "MEMBER", "VIEWER"].includes(role)) &&
    (labels ? ["all", "true", "false"] : ["", "true", "false"]).includes(
      active,
    ) &&
    /^\d+$/.test(rawPage) &&
    Number.isSafeInteger(page) &&
    page >= 0 &&
    /^\d+$/.test(rawSize) &&
    Number.isSafeInteger(size) &&
    size >= 1 &&
    size <= 100;
  return { q, role, active, page, size, valid };
}

function subscribeViewport(listener: () => void) {
  if (typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia("(max-width:639px)");
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}
export function useMobileCards() {
  return useSyncExternalStore(
    subscribeViewport,
    () =>
      typeof window.matchMedia === "function" &&
      window.matchMedia("(max-width:639px)").matches,
    () => false,
  );
}
