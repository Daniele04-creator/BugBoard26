import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { IconCheck } from "@tabler/icons-react";
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
            <label className="notifications-filter">
              <input
                type="checkbox"
                checked={params.get("unreadOnly") === "true"}
                onChange={(e) => change("unreadOnly", String(e.target.checked))}
              />
              Solo non lette
            </label>
            <Button variant="secondary" busy={busy} onClick={() => void mark()}>
              <IconCheck size={20} stroke={2} aria-hidden="true" />
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
                    {query.data.items.map((notification) => (
                      <li
                        key={notification.id}
                        className={
                          notification.readAt
                            ? "notifications-row"
                            : "notifications-row notifications-row-unread"
                        }
                      >
                        <p className="notifications-read-state">
                          <span
                            className="notifications-state-dot"
                            aria-hidden="true"
                          />
                          {notification.readAt ? "Letta" : "Non letta"}
                        </p>
                        <div className="notifications-content">
                          <h2>
                            {notification.type === "ASSIGNED"
                              ? "Ti è stata assegnata"
                              : "È stata risolta"}{" "}
                            <span className="notifications-issue-number">
                              BB-{notification.issue.number}
                            </span>
                            {" — "}
                            <span className="notifications-issue-title">
                              {notification.issue.title}
                            </span>
                          </h2>
                          <time
                            dateTime={notification.createdAt}
                            title={notification.createdAt}
                          >
                            {dateTime(notification.createdAt)}
                          </time>
                        </div>
                        <div className="notifications-actions">
                          <Link
                            className="button button-link"
                            to={`/issues/${notification.issue.id}`}
                            onClick={(event) => {
                              if (!notification.readAt) {
                                event.preventDefault();
                                void mark(notification.id, notification.issue.id);
                              }
                            }}
                          >
                            Apri
                          </Link>
                          {!notification.readAt && (
                            <Button
                              variant="secondary"
                              disabled={busy}
                              onClick={() => void mark(notification.id)}
                            >
                              <IconCheck size={20} stroke={2} aria-hidden="true" />
                              Segna come letta
                            </Button>
                          )}
                        </div>
                      </li>
                    ))}
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
                <Pagination
                  {...query.data}
                  onPageChange={(page) => change("page", String(page))}
                  onSizeChange={(size) => {
                    const next = new URLSearchParams(params);
                    next.set("size", String(size));
                    next.delete("page");
                    setParams(next);
                  }}
                />
              </>
            )
          )}
        </>
      )}
    </section>
  );
}
