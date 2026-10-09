import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import type { IssueStatus, IssueSummary } from "../../api/types";

type Drag = {
  issue: IssueSummary;
  x: number;
  y: number;
  target: IssueStatus | null;
};
type Gesture = Drag & {
  pointerId: number;
  startX: number;
  startY: number;
  active: boolean;
};
type Options = {
  board: RefObject<HTMLDivElement | null>;
  canStart: (issue: IssueSummary) => boolean;
  prepare: (issue: IssueSummary, mode: "drag") => Promise<unknown>;
  move: (target: IssueStatus) => unknown;
  cancel: () => void;
};

export function useBoardDrag(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const gesture = useRef<Gesture | null>(null);
  const suppression = useRef<{ id: string; until: number } | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  useEffect(() => {
    let frame = 0;
    const hit = (x: number, y: number): IssueStatus | null => {
      const board = latest.current.board.current;
      if (!board) return null;
      const area = board.getBoundingClientRect();
      if (y < area.top || y > area.bottom || x < area.left || x > area.right)
        return null;
      for (const column of board.querySelectorAll<HTMLElement>(
        "[data-board-status]",
      )) {
        const rect = column.getBoundingClientRect();
        if (x >= rect.left && x <= rect.right)
          return column.dataset.boardStatus as IssueStatus;
      }
      return null;
    };
    const paint = () => {
      const current = gesture.current;
      if (!current?.active) return;
      const board = latest.current.board.current;
      if (board) {
        const previousLeft = board.scrollLeft;
        const previousTop = window.scrollY;
        const rect = board.getBoundingClientRect();
        const edge = 36;
        const dx =
          current.x < rect.left + edge
            ? -10
            : current.x > rect.right - edge
              ? 10
              : 0;
        if (dx) board.scrollLeft += dx;
        const dy =
          current.y < 48 ? -10 : current.y > window.innerHeight - 48 ? 10 : 0;
        if (dy) window.scrollBy(0, dy);
        const target = hit(current.x, current.y);
        if (
          target !== current.target ||
          previousLeft !== board.scrollLeft ||
          previousTop !== window.scrollY
        ) {
          current.target = target;
          setDrag({ ...current });
        }
      }
      frame = requestAnimationFrame(paint);
    };
    const end = (cancelled: boolean, event?: PointerEvent, notify = true) => {
      const current = gesture.current;
      if (!current || (event && current.pointerId !== event.pointerId)) return;
      gesture.current = null;
      cancelAnimationFrame(frame);
      document.body.classList.remove("issue-board-dragging");
      setDrag(null);
      if (!current.active) return;
      suppression.current = { id: current.issue.id, until: Date.now() + 500 };
      event?.preventDefault();
      const target = event ? hit(event.clientX, event.clientY) : null;
      if (!cancelled && target) void latest.current.move(target);
      else if (notify) latest.current.cancel();
    };
    const move = (event: PointerEvent) => {
      const current = gesture.current;
      if (!current || current.pointerId !== event.pointerId) return;
      current.x = event.clientX;
      current.y = event.clientY;
      if (
        !current.active &&
        Math.hypot(current.x - current.startX, current.y - current.startY) >= 8
      ) {
        current.active = true;
        void latest.current.prepare(current.issue, "drag").then((detail) => {
          // A stale permission response must not cancel a newer gesture.
          if (!detail && gesture.current === current)
            end(true, undefined, false);
        });
        document.body.classList.add("issue-board-dragging");
        frame = requestAnimationFrame(paint);
      }
      if (!current.active) return;
      event.preventDefault();
      current.target = hit(current.x, current.y);
      setDrag({ ...current });
    };
    const up = (event: PointerEvent) => end(false, event);
    const pointerCancel = (event: PointerEvent) => end(true, event);
    const key = (event: KeyboardEvent) => {
      suppression.current = null;
      if (event.key === "Escape" && gesture.current) {
        event.preventDefault();
        end(true);
      }
    };
    const blur = () => end(true);
    document.addEventListener("pointermove", move, { passive: false });
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", pointerCancel);
    document.addEventListener("keydown", key);
    window.addEventListener("blur", blur);
    return () => {
      gesture.current = null;
      suppression.current = null;
      cancelAnimationFrame(frame);
      document.body.classList.remove("issue-board-dragging");
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", pointerCancel);
      document.removeEventListener("keydown", key);
      window.removeEventListener("blur", blur);
    };
  }, []);
  function pointerDown(
    event: ReactPointerEvent<HTMLElement>,
    issue: IssueSummary,
  ) {
    suppression.current = null;
    if (
      event.button !== 0 ||
      event.isPrimary === false ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey ||
      !latest.current.canStart(issue)
    )
      return;
    const target = event.target as HTMLElement;
    const handle = target.closest("[data-board-move-id]");
    if (event.pointerType !== "mouse" && !handle) return;
    if (target.closest("button, input, select, textarea") && !handle) return;
    gesture.current = {
      issue,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      active: false,
      target: null,
    };
  }
  function suppressClick(id: string) {
    if (
      !suppression.current ||
      suppression.current.id !== id ||
      suppression.current.until < Date.now()
    )
      return false;
    suppression.current = null;
    return true;
  }
  return { drag, pointerDown, suppressClick };
}
