import { useEffect, useRef, useState } from "react";
import type { MouseEvent, RefObject } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import type { IssueStatus, IssueSummary } from "../../api/types";
import { Alert, ErrorAlert } from "../../components/Alert";
import { Avatar } from "../../components/Avatar";
import { Button } from "../../components/Button";
import { Dialog } from "../../components/Dialog";
import {
  IconArrowRight,
  IconCalendar,
  IconDots,
  IconUser,
} from "../../components/Icons";
import { SelectField } from "../../components/SelectField";
import {
  IssueLabels,
  IssuePriorityBadge,
  IssueStatusBadge,
  IssueTypeIcon,
} from "./IssueBadges";
import { IssueCommandDialog } from "./IssueCommandDialog";
import {
  dateOnly,
  statusNames,
  todayRome,
  userName,
} from "./issuePresentation";
import {
  canMoveSummary,
  requiresAssignment,
  useIssueBoardMove,
} from "./useIssueBoardMove";
import { useBoardDrag } from "./useBoardDrag";

const columns: IssueStatus[] = ["TODO", "IN_PROGRESS", "RESOLVED", "DUPLICATE"];
const cardsPerBatch = 50;
const isOverdue = (issue: IssueSummary, today: string) =>
  !issue.archived &&
  ["TODO", "IN_PROGRESS"].includes(issue.status) &&
  !!issue.dueDate &&
  issue.dueDate < today;
export function IssueBoard({
  issues,
  boardRef,
  onOpenIssue,
  linkState,
  focusIssueId,
}: {
  issues: IssueSummary[];
  boardRef: RefObject<HTMLDivElement | null>;
  onOpenIssue: (
    event: MouseEvent<HTMLAnchorElement>,
    issue: IssueSummary,
  ) => void;
  linkState: { returnTo: string };
  focusIssueId?: string;
}) {
  const today = todayRome();
  const pendingFocus = useRef<{
    id: string;
    target: "link" | "move";
    expectedIssue?: Pick<IssueSummary, "status" | "version">;
  } | null>(null);
  const [visibleLimits, setVisibleLimits] = useState<Record<IssueStatus, number>>({
    TODO: cardsPerBatch,
    IN_PROGRESS: cardsPerBatch,
    RESOLVED: cardsPerBatch,
    DUPLICATE: cardsPerBatch,
  });
  const [movedIssueId, setMovedIssueId] = useState<string>();
  const movement = useIssueBoardMove((expectedIssue) => {
    pendingFocus.current = { id: expectedIssue.id, target: "move", expectedIssue };
    setMovedIssueId(expectedIssue.id);
  });
  const { drag, pointerDown, suppressClick } = useBoardDrag({
    board: boardRef,
    canStart: (issue) =>
      !movement.session && canMoveSummary(issue, movement.user),
    prepare: movement.prepare,
    move: movement.move,
    cancel: movement.cancel,
  });
  const [destination, setDestination] = useState<IssueStatus | "">("");
  const session = movement.session;
  const selected = movement.targets.includes(destination as IssueStatus)
    ? destination
    : "";
  const choosing = session?.mode === "choose" && !movement.command;
  const busy = session?.phase === "checking" || session?.phase === "saving";
  useEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;
    const issue = issues.find((issue) => issue.id === pending.id);
    // Query invalidation can finish before the refreshed list has committed.
    if (
      issue &&
      pending.expectedIssue &&
      (issue.version < pending.expectedIssue.version ||
        (issue.version === pending.expectedIssue.version &&
          issue.status !== pending.expectedIssue.status))
    )
      return;
    const selector =
      pending.target === "link"
        ? `a[data-issue-id="${pending.id}"]`
        : `button[data-board-move-id="${pending.id}"]`;
    const target = boardRef.current?.querySelector<HTMLElement>(selector);
    if (target) target.focus({ preventScroll: true });
    else if (
      !issue ||
      (pending.target === "move" && !canMoveSummary(issue, movement.user))
    )
      boardRef.current?.focus({ preventScroll: true });
    else return;
    pendingFocus.current = null;
  }, [
    boardRef,
    issues,
    visibleLimits,
    movedIssueId,
    session,
    movement.command,
    movement.user,
  ]);
  useEffect(() => {
    setDestination("");
  }, [session?.summary.id]);
  useEffect(() => {
    if (!session || movement.command || session.mode === "choose") return;
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") movement.cancel();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [session, movement]);
  return (
    <>
      <div
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {movement.announcement}
      </div>
      <ErrorAlert error={movement.error} />
      {movement.notice && (
        <Alert variant={movement.noticeKind}>{movement.notice}</Alert>
      )}
      <nav className="board-jumps" aria-label="Colonne bacheca">
        {columns.map((status) => (
          <Button
            key={status}
            onClick={() => {
              const column = boardRef.current?.querySelector<HTMLElement>(
                `[data-board-status="${status}"]`,
              );
              if (column && boardRef.current) {
                boardRef.current.scrollTo({
                  left: column.offsetLeft - boardRef.current.offsetLeft,
                  behavior: window.matchMedia?.(
                    "(prefers-reduced-motion: reduce)",
                  ).matches
                    ? "auto"
                    : "smooth",
                });
                column.focus({ preventScroll: true });
              }
            }}
          >
            {statusNames[status]}{" "}
            <span className="board-count">
              {issues.filter((issue) => issue.status === status).length}
            </span>
          </Button>
        ))}
      </nav>
      <p className="board-scroll-hint">
        <IconArrowRight size={14} aria-hidden="true" /> Scorri per vedere tutti
        gli stati
      </p>
      <div
        ref={boardRef}
        className="board-grid"
        tabIndex={0}
        role="region"
        aria-label="Bacheca issue"
        aria-busy={busy || undefined}
      >
        {columns.map((status) => {
          const rows = issues.filter((issue) => issue.status === status);
          const visibleCount = Math.min(
            rows.length,
            Math.max(
              visibleLimits[status],
              ...[focusIssueId, movedIssueId, movement.session?.summary.id].map(
                (id) => rows.findIndex((issue) => issue.id === id) + 1,
              ),
            ),
          );
          const allowed = !!drag && movement.targets.includes(status);
          const over = drag?.target === status;
          return (
            <section
              id={`board-${status}`}
              data-board-status={status}
              tabIndex={-1}
              key={status}
              className={`board-column board-column-${status.toLowerCase()}${allowed ? " board-drop-allowed" : ""}${over && allowed ? " board-drop-over" : ""}${over && !allowed && status !== drag?.issue.status ? " board-drop-blocked" : ""}`}
              aria-label={`${statusNames[status]}: ${rows.length} issue`}
            >
              <header>
                <IssueStatusBadge status={status} />
                <span className="board-count">{rows.length}</span>
              </header>
              <div>
                {rows.length ? (
                  rows.slice(0, visibleCount).map((issue) => (
                    <article
                      key={issue.id}
                      className={`board-card${session?.summary.id === issue.id ? " board-card-moving" : ""}`}
                      onPointerDown={(event) => pointerDown(event, issue)}
                      onDragStart={(event) => event.preventDefault()}
                      onClickCapture={(event) => {
                        if (suppressClick(issue.id)) {
                          event.preventDefault();
                          event.stopPropagation();
                        }
                      }}
                    >
                      <Link
                        to={`/issues/${issue.id}`}
                        data-issue-id={issue.id}
                        aria-label={`BB-${issue.number} · ${issue.title}`}
                        onClick={(event) => onOpenIssue(event, issue)}
                        state={linkState}
                        className="board-card-link"
                        draggable={false}
                      >
                        <div className="board-card-head">
                          <span>
                            <IssueTypeIcon type={issue.type} size={14} /> BB-
                            {issue.number}
                          </span>
                          <IssuePriorityBadge priority={issue.priority} />
                        </div>
                        <h2>{issue.title}</h2>
                        <IssueLabels issue={issue} />
                      </Link>
                      <footer>
                        <span
                          className={`board-due ${isOverdue(issue, today) ? "overdue-text" : ""}`}
                          title={
                            issue.dueDate
                              ? `Scadenza: ${dateOnly(issue.dueDate)}`
                              : "Nessuna scadenza"
                          }
                        >
                          {issue.dueDate ? (
                            <>
                              <IconCalendar size={14} aria-hidden="true" />
                              {isOverdue(issue, today) ? "Scaduta · " : ""}
                              {dateOnly(issue.dueDate)}
                            </>
                          ) : (
                            "Nessuna scadenza"
                          )}
                        </span>
                        <span className="board-card-controls">
                          {canMoveSummary(issue, movement.user) && (
                            <button
                              type="button"
                              className="board-move-handle"
                              data-board-move-id={issue.id}
                              aria-label={`Sposta BB-${issue.number}`}
                              aria-haspopup="dialog"
                              title="Trascina per cambiare stato, oppure clicca per scegliere"
                              disabled={
                                (!!session &&
                                  session.summary.id !== issue.id) ||
                                busy
                              }
                              onClick={() => {
                                void movement.prepare(issue, "choose");
                              }}
                            >
                              <IconDots size={16} aria-hidden="true" />
                            </button>
                          )}
                          <span
                            className="board-assignee"
                            title={
                              issue.assignee
                                ? userName(issue.assignee)
                                : "Non assegnata"
                            }
                          >
                            {issue.assignee ? (
                              <Avatar
                                name={userName(issue.assignee)}
                                id={issue.assignee.id}
                                size={24}
                              />
                            ) : (
                              <span className="unassigned">
                                <IconUser size={14} aria-hidden="true" />
                              </span>
                            )}
                          </span>
                        </span>
                      </footer>
                    </article>
                  ))
                ) : (
                  <p className="board-empty">Nessuna issue</p>
                )}
              </div>
              {visibleCount < rows.length && (
                <Button
                  className="board-load-more"
                  disabled={busy}
                  aria-label={`Mostra altre ${Math.min(cardsPerBatch, rows.length - visibleCount)} issue in ${statusNames[status]}`}
                  onClick={() => {
                    pendingFocus.current = {
                      id: rows[visibleCount].id,
                      target: "link",
                    };
                    setVisibleLimits((limits) => ({
                      ...limits,
                      [status]: visibleCount + cardsPerBatch,
                    }));
                  }}
                >
                  Mostra altre{" "}
                  {Math.min(cardsPerBatch, rows.length - visibleCount)}
                </Button>
              )}
              {allowed && (
                <p className="board-drop-hint">
                  {over ? "Rilascia qui" : `Sposta in ${statusNames[status]}`}
                </p>
              )}
            </section>
          );
        })}
      </div>
      {drag &&
        createPortal(
          <div
            className="board-drag-preview"
            aria-hidden="true"
            style={{
              left: Math.max(8, Math.min(drag.x + 16, window.innerWidth - 240)),
              top: Math.max(8, Math.min(drag.y + 16, window.innerHeight - 126)),
            }}
          >
            <span>
              BB-{drag.issue.number}
              <IssuePriorityBadge priority={drag.issue.priority} />
            </span>
            <strong>{drag.issue.title}</strong>
            <small>
              {session?.phase === "loading"
                ? "Controllo permessi…"
                : drag.target && movement.targets.includes(drag.target)
                  ? `Rilascia: ${statusNames[drag.target]}`
                  : "Scegli una colonna disponibile"}{" "}
              · Esc annulla
            </small>
          </div>,
          document.body,
        )}
      <Dialog
        open={!!choosing}
        title={`Sposta BB-${session?.summary.number ?? ""}`}
        onClose={() => movement.cancel()}
        busy={busy}
        footer={
          <>
            <Button
              data-cancel
              onClick={() => movement.cancel()}
              disabled={busy}
            >
              Annulla
            </Button>
            <Button
              variant="primary"
              disabled={!selected || session?.phase !== "ready"}
              onClick={() => {
                if (selected) void movement.move(selected);
              }}
            >
              {session?.detail &&
              selected &&
              requiresAssignment(session.detail, selected)
                ? "Assegna e sposta"
                : busy
                  ? "Spostamento…"
                  : "Sposta"}
            </Button>
          </>
        }
      >
        <p className="muted">{session?.summary.title}</p>
        {session?.phase === "loading" ? (
          <p role="status">Controllo degli stati disponibili…</p>
        ) : movement.targets.length ? (
          <SelectField
            label="Destinazione"
            value={selected}
            onChange={(event) =>
              setDestination(event.target.value as IssueStatus | "")
            }
            disabled={busy}
          >
            <option value="">Scegli uno stato</option>
            {movement.targets.map((target) => (
              <option key={target} value={target}>
                {statusNames[target]}
                {session?.detail && requiresAssignment(session.detail, target)
                  ? " · richiede assegnazione"
                  : ""}
              </option>
            ))}
          </SelectField>
        ) : (
          <p>Non sono disponibili spostamenti per questa issue.</p>
        )}
      </Dialog>
      {movement.command && (
        <IssueCommandDialog
          issue={movement.command.issue}
          command={movement.command.command}
          onClose={movement.commandClosed}
          onSaved={movement.commandSaved}
          onReload={movement.reloadCommand}
        />
      )}
    </>
  );
}
