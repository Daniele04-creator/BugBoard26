import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  IssueDetail,
  IssueStatus,
  IssueSummary,
  UserRole,
} from "../../api/types";
import { ApiError } from "../../api/ApiClient";
import { useAuth } from "../auth/AuthProvider";
import { issueApi } from "./issueApi";
import { statusNames } from "./issuePresentation";
import type { IssueCommand } from "./IssueCommandDialog";

type Actor = { id: string; role: UserRole } | null;
type MoveSession = {
  summary: IssueSummary;
  detail: IssueDetail | null;
  mode: "drag" | "choose";
  phase: "loading" | "ready" | "checking" | "saving";
};
type BoardCommand = {
  issue: IssueDetail;
  command: IssueCommand;
  resume?: IssueStatus;
};
export function canMoveSummary(issue: IssueSummary, actor: Actor) {
  return (
    !issue.archived &&
    !!actor &&
    (actor.role === "ADMIN" ||
      (actor.role === "MEMBER" && issue.assignee?.id === actor.id))
  );
}
export function moveTargets(issue: IssueDetail, actor: Actor): IssueStatus[] {
  if (!canMoveSummary(issue, actor)) return [];
  const result = new Set<IssueStatus>(
    issue.permissions.canChangeState
      ? issue.permissions.allowedStateTargets
      : [],
  );
  if (actor?.role === "ADMIN") {
    if (issue.permissions.canDuplicate) result.add("DUPLICATE");
    if (issue.status === "DUPLICATE" && issue.permissions.canUndoDuplicate)
      result.add("TODO");
    if (
      issue.status === "TODO" &&
      !issue.assignee &&
      issue.permissions.canAssign
    ) {
      result.add("IN_PROGRESS");
      result.add("RESOLVED");
    }
  }
  result.delete(issue.status);
  return [...result];
}
export function requiresAssignment(issue: IssueDetail, target: IssueStatus) {
  return (
    issue.status === "TODO" &&
    !issue.assignee &&
    (target === "IN_PROGRESS" || target === "RESOLVED")
  );
}

export function useIssueBoardMove(
  onRestoreFocus: (issue: Pick<IssueSummary, "id" | "status" | "version">) => void,
) {
  const { user } = useAuth();
  const cache = useQueryClient();
  const actor = useRef<Actor>(user);
  actor.current = user;
  const [session, setSession] = useState<MoveSession | null>(null);
  const current = useRef<MoveSession | null>(null);
  const [command, setCommand] = useState<BoardCommand | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState("");
  const [noticeKind, setNoticeKind] = useState<"success" | "warning">(
    "warning",
  );
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const pending = useRef<Promise<IssueDetail | null> | null>(null);
  const mounted = useRef(true);
  const commandCompleted = useRef(false);
  const moving = useRef(false);
  const activeCommand = useRef<BoardCommand | null>(null);
  activeCommand.current = command;
  const restore = useRef(onRestoreFocus);
  restore.current = onRestoreFocus;
  const update = useCallback((next: MoveSession | null) => {
    current.current = next;
    if (mounted.current) setSession(next);
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
      controller.current?.abort();
    };
  }, []);
  const invalidate = useCallback(async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["issues"] }),
      cache.invalidateQueries({ queryKey: ["reporting"] }),
      cache.invalidateQueries({ queryKey: ["notifications"] }),
    ]);
  }, [cache]);
  const cancel = useCallback(
    (message = "Spostamento annullato.", expectedIssue?: IssueSummary) => {
      if (current.current?.phase === "saving") return;
      const issue =
        expectedIssue ?? current.current?.detail ?? current.current?.summary;
      generation.current++;
      controller.current?.abort();
      pending.current = null;
      moving.current = false;
      activeCommand.current = null;
      update(null);
      setCommand(null);
      if (mounted.current) setAnnouncement(message);
      if (issue) restore.current(issue);
    },
    [update],
  );
  async function reportFailure(
    problem: unknown,
    summary: IssueSummary,
    stamp: number,
  ) {
    if (!mounted.current || generation.current !== stamp) {
      await invalidate();
      return;
    }
    setError(problem);
    setNoticeKind("warning");
    const text =
      problem instanceof ApiError && problem.status === 409
        ? `BB-${summary.number} è cambiata. Bacheca aggiornata: riprova dalla posizione corrente.`
        : `Spostamento di BB-${summary.number} non completato. La bacheca mostra lo stato del server.`;
    setNotice(text);
    setAnnouncement(text);
    let expectedIssue: IssueSummary = summary;
    try {
      expectedIssue = await issueApi.detail(summary.id);
      cache.setQueryData(["issues", "detail", summary.id], expectedIssue);
    } catch {
      /* The list reload still exposes its own server error. */
    }
    await invalidate();
    if (mounted.current && generation.current === stamp) {
      moving.current = false;
      activeCommand.current = null;
      update(null);
      setCommand(null);
      restore.current(expectedIssue);
    }
  }
  function prepare(summary: IssueSummary, mode: MoveSession["mode"]) {
    if (!canMoveSummary(summary, actor.current) || current.current)
      return Promise.resolve(null);
    const stamp = ++generation.current;
    const abort = new AbortController();
    controller.current = abort;
    setError(null);
    setNotice("");
    setNoticeKind("warning");
    update({ summary, detail: null, mode, phase: "loading" });
    setAnnouncement(
      `Controllo degli stati disponibili per BB-${summary.number}…`,
    );
    const request = issueApi
      .detail(summary.id, abort.signal)
      .then((detail) => {
        if (
          !mounted.current ||
          generation.current !== stamp ||
          abort.signal.aborted
        )
          return null;
        cache.setQueryData(["issues", "detail", summary.id], detail);
        if (
          detail.version !== summary.version ||
          detail.status !== summary.status
        ) {
          const message = `BB-${summary.number} è cambiata. Bacheca aggiornata: riprova dalla posizione corrente.`;
          setNotice(message);
          cancel(message, detail);
          void invalidate();
          return null;
        }
        update({ summary, detail, mode, phase: "ready" });
        const targets = moveTargets(detail, actor.current);
        if (!targets.length && mode === "drag") {
          const message = `Non puoi spostare BB-${summary.number}: gli stati disponibili sono cambiati.`;
          setNotice(message);
          cancel(message, detail);
          void invalidate();
          return null;
        }
        setAnnouncement(
          targets.length
            ? `BB-${summary.number}. Destinazioni disponibili: ${targets.map((target) => statusNames[target]).join(", ")}.`
            : `Non puoi spostare BB-${summary.number}.`,
        );
        return detail;
      })
      .catch(async (problem: unknown) => {
        if (!abort.signal.aborted) await reportFailure(problem, summary, stamp);
        return null;
      });
    pending.current = request;
    return request;
  }
  async function move(target: IssueStatus) {
    const before = current.current;
    if (!before || moving.current || activeCommand.current) return;
    moving.current = true;
    const stamp = generation.current;
    const initial = before.detail ?? (await pending.current);
    if (!initial || !mounted.current || stamp !== generation.current) {
      if (stamp === generation.current) moving.current = false;
      return;
    }
    if (target === initial.status) {
      cancel("La issue è già in questa colonna.");
      return;
    }
    if (!moveTargets(initial, actor.current).includes(target)) {
      cancel("Questo spostamento non è disponibile per il tuo account.");
      return;
    }
    update({ ...before, detail: initial, phase: "checking" });
    let commandStarted = false;
    try {
      const fresh = await issueApi.detail(
        before.summary.id,
        controller.current?.signal,
      );
      if (
        !mounted.current ||
        generation.current !== stamp ||
        controller.current?.signal.aborted
      )
        return;
      cache.setQueryData(["issues", "detail", fresh.id], fresh);
      if (
        fresh.version !== initial.version ||
        fresh.status !== initial.status
      ) {
        const message = `BB-${fresh.number} è cambiata durante lo spostamento. Bacheca aggiornata: riprova.`;
        setNotice(message);
        cancel(message, fresh);
        await invalidate();
        return;
      }
      if (!moveTargets(fresh, actor.current).includes(target)) {
        setNotice(
          "I permessi o lo stato sono cambiati. Bacheca aggiornata: scegli di nuovo la destinazione.",
        );
        setAnnouncement("Spostamento non più disponibile. Bacheca aggiornata.");
        await invalidate();
        cancel("Spostamento non più disponibile. Bacheca aggiornata.", fresh);
        return;
      }
      update({ ...before, detail: fresh, phase: "ready" });
      if (target === "DUPLICATE") {
        activeCommand.current = { issue: fresh, command: "duplicate" };
        setCommand(activeCommand.current);
        moving.current = false;
        return;
      }
      if (fresh.status === "DUPLICATE" && target === "TODO") {
        activeCommand.current = { issue: fresh, command: "undo" };
        setCommand(activeCommand.current);
        moving.current = false;
        return;
      }
      if (requiresAssignment(fresh, target)) {
        activeCommand.current = {
          issue: fresh,
          command: "assignment",
          resume: target,
        };
        setCommand(activeCommand.current);
        moving.current = false;
        return;
      }
      update({ ...before, detail: fresh, phase: "saving" });
      setAnnouncement(
        `Spostamento di BB-${fresh.number} in ${statusNames[target]}…`,
      );
      commandStarted = true;
      const result = await issueApi.command(
        fresh.id,
        "state",
        { status: target },
        fresh.version,
      );
      await completed(
        result,
        `BB-${result.number} spostata in ${statusNames[result.status]}.`,
      );
    } catch (problem) {
      if (commandStarted || !controller.current?.signal.aborted)
        await reportFailure(problem, before.summary, stamp);
    }
  }
  async function completed(result: IssueDetail, text: string) {
    const stamp = generation.current;
    cache.setQueryData(["issues", "detail", result.id], result);
    await invalidate();
    if (!mounted.current || generation.current !== stamp) return;
    moving.current = false;
    activeCommand.current = null;
    update(null);
    setCommand(null);
    setAnnouncement(text);
    setNotice(text);
    setNoticeKind("success");
    restore.current(result);
  }
  function commandSaved(result: IssueDetail) {
    cache.setQueryData(["issues", "detail", result.id], result);
    if (!mounted.current) {
      void invalidate();
      return;
    }
    commandCompleted.current = true;
    const resume = activeCommand.current?.resume;
    const stamp = generation.current;
    activeCommand.current = null;
    setCommand(null);
    if (resume && result.assignee) {
      update({
        summary: result,
        detail: result,
        mode: "drag",
        phase: "checking",
      });
      moving.current = true;
      // The preceding assignment changed both version and permissions; re-read before continuing.
      void invalidate().then(() => {
        if (mounted.current && generation.current === stamp)
          return moveAfterAssignment(result, resume, stamp);
      });
    } else {
      update({
        summary: result,
        detail: result,
        mode: "drag",
        phase: "saving",
      });
      void completed(
        result,
        resume
          ? "L’issue resta Da fare: per spostarla serve un responsabile."
          : `BB-${result.number} aggiornata: ${statusNames[result.status]}.`,
      );
    }
  }
  async function moveAfterAssignment(
    result: IssueDetail,
    target: IssueStatus,
    stamp: number,
  ) {
    update({
      summary: result,
      detail: result,
      mode: "drag",
      phase: "checking",
    });
    let commandStarted = false;
    try {
      const fresh = await issueApi.detail(
        result.id,
        controller.current?.signal,
      );
      if (
        !mounted.current ||
        generation.current !== stamp ||
        controller.current?.signal.aborted
      )
        return;
      if (fresh.version !== result.version || fresh.status !== result.status) {
        await completed(
          fresh,
          "Responsabile assegnato. La issue è cambiata: scegli di nuovo lo stato.",
        );
        return;
      }
      if (!moveTargets(fresh, actor.current).includes(target)) {
        await completed(
          fresh,
          "Responsabile assegnato. La destinazione non è più disponibile: scegli di nuovo lo stato.",
        );
        return;
      }
      update({ summary: fresh, detail: fresh, mode: "drag", phase: "saving" });
      commandStarted = true;
      const moved = await issueApi.command(
        fresh.id,
        "state",
        { status: target },
        fresh.version,
      );
      await completed(
        moved,
        `BB-${moved.number} spostata in ${statusNames[moved.status]}.`,
      );
    } catch (problem) {
      if (commandStarted || !controller.current?.signal.aborted)
        await reportFailure(problem, result, stamp);
    }
  }
  function commandClosed() {
    if (commandCompleted.current) {
      commandCompleted.current = false;
      return;
    }
    cancel();
  }
  async function reloadCommand() {
    if (!command) return;
    const stamp = generation.current;
    const fresh = await issueApi.detail(command.issue.id);
    cache.setQueryData(["issues", "detail", fresh.id], fresh);
    if (mounted.current && stamp === generation.current && current.current) {
      setCommand({ ...command, issue: fresh });
      update({ ...current.current, detail: fresh });
    }
    await invalidate();
  }
  return {
    user,
    session,
    command,
    announcement,
    error,
    notice,
    noticeKind,
    prepare,
    move,
    cancel,
    commandSaved,
    commandClosed,
    reloadCommand,
    targets: session?.detail ? moveTargets(session.detail, user) : [],
  };
}
