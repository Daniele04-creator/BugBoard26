import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "./Button";
import { IconX } from "@tabler/icons-react";
export interface DialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
  footer?: ReactNode;
  sensitive?: boolean;
  className?: string;
}
export function Dialog({
  open,
  title,
  children,
  onClose,
  busy = false,
  footer,
  sensitive = false,
  className = "",
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const dialog = ref.current;
    if (!dialog) return;
    const root = document.getElementById("root");
    const wasInert = root?.inert ?? false;
    if (root) root.inert = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    const first = sensitive
      ? (dialog.querySelector<HTMLElement>(
          "[data-cancel]:not([data-dialog-close])",
        ) ?? dialog.querySelector<HTMLElement>("[data-dialog-close]"))
      : (dialog.querySelector<HTMLElement>(
          "input:not([disabled]), select:not([disabled]), textarea:not([disabled])",
        ) ??
        dialog.querySelector<HTMLElement>("button:not([disabled]), a[href]"));
    (first ?? dialog).focus();
    return () => {
      if (root) root.inert = wasInert;
      document.body.style.overflow = previousOverflow;
      if (dialog.open && typeof dialog.close === "function") dialog.close();
      if (previous?.isConnected) previous.focus();
      else document.querySelector<HTMLElement>("main h1")?.focus();
    };
  }, [open, sensitive]);
  if (!open) return null;
  return createPortal(
    <dialog
      ref={ref}
      className={`dialog ${className}`}
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCloseRef.current();
      }}
      onKeyDown={(e) => {
        if (e.key !== "Tab") return;
        const nodes = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]',
          ) ?? [],
        ).filter((node) => !node.hidden);
        const first = nodes[0],
          last = nodes.at(-1);
        if (!first) {
          e.preventDefault();
          ref.current?.focus();
        } else if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }}
    >
      <div className="dialog-heading">
        <h2 id={titleId}>{title}</h2>
        <Button
          data-cancel
          data-dialog-close
          className="dialog-close"
          disabled={busy}
          onClick={onClose}
          aria-label={`Chiudi ${title}`}
        >
          <IconX size={20} stroke={2} aria-hidden="true" />
        </Button>
      </div>
      <div className="dialog-body">{children}</div>
      {footer && <div className="dialog-footer">{footer}</div>}
    </dialog>,
    document.body,
  );
}
