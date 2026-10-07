import type { ButtonHTMLAttributes } from "react";
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "link";
  busy?: boolean;
}
export function Button({
  variant = "secondary",
  busy = false,
  className = "",
  disabled,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`button button-${variant} ${className}`}
    >
      {children}
      {busy && (
        <>
          <span className="busy-indicator" aria-hidden="true" />
          <span className="sr-only">Invio…</span>
        </>
      )}
    </button>
  );
}
