import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment } from "react";
import { IconCheck, IconUser } from "../../components/Icons";
import { api } from "../../api/ApiClient";
import type { Notification, Page } from "../../api/types";
import { Alert, ErrorAlert } from "../../components/Alert";
import { Button } from "../../components/Button";
import { Pagination } from "../../components/Pagination";
import { EmptyState } from "../../components/EmptyState";
import { LoadingState } from "../../components/LoadingState";
import { dateTime } from "../issues/issuePresentation";
import "./styles.css";
export function NotificationsPage() {
  const [params, setParams] = useSearchParams();
  const cache = useQueryClient();
  const navigate = useNavigate();
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const valid =
    Array.from(params.keys()).every((key) =>
      ["unreadOnly", "page", "size"].includes(key),
    ) &&
    ["unreadOnly", "page", "size"].every(
      (key) => params.getAll(key).length <= 1,
    ) &&
    (!params.has("unreadOnly") ||
      ["true", "false"].includes(params.get("unreadOnly")!)) &&
    /^\d+$/.test(params.get("page") ?? "0") &&
    Number.isSafeInteger(Number(params.get("page") ?? 0)) &&
    /^\d+$/.test(params.get("size") ?? "20") &&
    Number(params.get("size") ?? 20) >= 1 &&
    Number(params.get("size") ?? 20) <= 100;
  const query = useQuery({
    queryKey: ["notifications", "list", params.toString()],
    queryFn: ({ signal }) =>
      api.get<Page<Notification>>(`/notifications?${params}`, { signal }),
    enabled: valid,
  });
  useEffect(() => {
    if (!valid || !query.isSuccess || query.isFetching || query.isPlaceholderData) return;
    const lastPage = Math.max(0, query.data.totalPages - 1);
    if (Number(params.get("page") ?? 0) > lastPage) {
      const next = new URLSearchParams(params);
      next.set("page", String(lastPage));
      setParams(next, { replace: true });
    }
  }, [valid, query.isSuccess, query.isFetching, query.isPlaceholderData, query.data, params, setParams]);
  async function mark(id?: string, open?: string) {
    let readFailed = false;
    setBusy(true);
    setError(null);
    setMessage("");
    try {
      if (id) await api.put(`/notifications/${id}/read`);
      else await api.put("/notifications/read-all");
      await cache.invalidateQueries({ queryKey: ["notifications"] });
      setMessage(
        id
          ? "Notifica segnata come letta."
          : "Tutte le notifiche sono state segnate come lette.",
      );
    } catch (problem) {
      readFailed = true;
      setError(problem);
    } finally {
      setBusy(false);
      if (open)
        navigate(`/issues/${open}`, {
          state: { notificationReadError: readFailed },
        });
    }
  }
  function change(name: string, value: string) {
    const next = new URLSearchParams(params);
    if (name === "unreadOnly") {
      next.delete("page");
      if (value === "true") next.set(name, value);
      else next.delete(name);
    } else next.set(name, value);
    setParams(next);
  }
  return (
    <section className="notifications-page" aria-labelledby="notifications-title">
      <header className="notifications-heading">
        <h1 id="notifications-title" tabIndex={-1}>
          Notifiche
        </h1>
        <p>Resta aggiornato sulle attività del progetto.</p>
      </header>
      {!valid ? (
        <>
          <Alert>Filtri delle notifiche non validi.</Alert>
          <Button onClick={() => setParams({})}>Ripristina vista</Button>
        </>
      ) : (
        <>
          <div className="notifications-toolbar">
            <nav className="notifications-tabs" aria-label="Vista notifiche">
              <Button variant="link" className={params.get("unreadOnly") === "true" ? "active" : ""} aria-pressed={params.get("unreadOnly") === "true"} onClick={() => change("unreadOnly", "true")}>Non lette</Button>
              <Button variant="link" className={params.get("unreadOnly") !== "true" ? "active" : ""} aria-pressed={params.get("unreadOnly") !== "true"} onClick={() => change("unreadOnly", "false")}>Tutte</Button>
            </nav>
            <Button variant="link" busy={busy} onClick={() => void mark()}>
              Segna tutte come lette
            </Button>
          </div>
          <ErrorAlert error={error} />
          {message && <Alert variant="success">{message}</Alert>}
          <ErrorAlert error={query.error} />
          {query.isPending ? (
            <LoadingState label="Caricamento notifiche…" />
          ) : (
            query.data && (
              <>
                {query.data.items.length > 0 && (
                  <ul
                    className="notifications-register"
                    aria-label="Registro delle notifiche"
                  >
                    {query.data.items.map((notification, index, rows) => {
                      const day = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "long", year: "numeric" }).format(new Date(notification.createdAt));
                      const previousDay = index ? new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "long", year: "numeric" }).format(new Date(rows[index - 1].createdAt)) : null;
                      return <Fragment key={notification.id}>
                        {day !== previousDay && <li className="notifications-day"><h2>{day}</h2></li>}
                        <li className={`notifications-row ${notification.readAt ? "" : "notifications-row-unread"}`}>
                          <div className="notification-symbol" aria-hidden="true">{notification.type === "ASSIGNED" ? <IconUser size={16} /> : <IconCheck size={16} />}</div>
                          <div className="notifications-content">
                            <div className="notifications-meta"><strong>BB-{notification.issue.number}</strong><span>{notification.type === "ASSIGNED" ? "Assegnata a te" : "Risolta"}</span><span className="notifications-read-state">{notification.readAt ? "Letta" : "Non letta"}</span></div>
                            <h2><Link to={`/issues/${notification.issue.id}`} onClick={(event) => {
                              if (!notification.readAt && event.button === 0 &&
                                !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
                                event.preventDefault();
                                void mark(notification.id, notification.issue.id);
                              }
                            }}>{notification.issue.title}</Link></h2>
                          </div>
                          <div className="notifications-actions">
                            <time dateTime={notification.createdAt} title={dateTime(notification.createdAt)}>{new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(notification.createdAt))}</time>
                            {!notification.readAt && <Button variant="link" disabled={busy} onClick={() => void mark(notification.id)}>Segna come letta</Button>}
                          </div>
                        </li>
                      </Fragment>;
                    })}

                  </ul>
                )}
                {query.data.totalElements === 0 && (
                  <EmptyState
                    title={
                      params.get("unreadOnly") === "true"
                        ? "Non hai notifiche non lette."
                        : "Non hai notifiche."
                    }
                  />
                )}
                <p className="notifications-results" role="status">{query.data.totalElements} notifiche</p>
                {query.data.totalPages > 1 && <Pagination
                  {...query.data}
                  onPageChange={(page) => change("page", String(page))}
                  onSizeChange={(size) => {
                    const next = new URLSearchParams(params);
                    next.set("size", String(size));
                    next.delete("page");
                    setParams(next);
                  }}
                />}
              </>
            )
          )}
        </>
      )}
    </section>
  );
}
