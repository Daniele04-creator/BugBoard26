import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { ApiError } from "../api/ApiClient";
export function Alert({
  children,
  variant = "error",
  focus = false,
  focusKey,
}: {
  children: ReactNode;
  variant?: "error" | "success" | "info" | "warning";
  focus?: boolean;
  focusKey?: unknown;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focus) ref.current?.focus();
  }, [focus, focusKey]);
  return (
    <div
      ref={ref}
      tabIndex={focus ? -1 : undefined}
      className={`alert alert-${variant}`}
      role={variant === "error" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}
export function ErrorAlert({
  error,
  focus = false,
}: {
  error: unknown;
  focus?: boolean;
}) {
  if (!error) return null;
  return (
    <Alert focus={focus} focusKey={error}>
      {error instanceof ApiError
        ? error.problem.detail
        : error instanceof Error
          ? error.message
          : "Non è stato possibile completare la richiesta. Riprova."}
      {error instanceof ApiError && error.problem.requestId && (
        <span className="request-id">
          Codice richiesta: <code>{error.problem.requestId}</code>
        </span>
      )}
    </Alert>
  );
}
