import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { IssueDetail } from "../../api/types";
import { ApiError, NetworkError } from "../../api/ApiClient";
import { Alert, ErrorAlert } from "../../components/Alert";
import { Button } from "../../components/Button";
import { Pagination } from "../../components/Pagination";
import { issueApi } from "./issueApi";
import {
  codePoints,
  dateTime,
  normalized,
  statusNames,
  typeNames,
  priorityNames,
  userName,
} from "./issuePresentation";
import { UnsavedChanges } from "./UnsavedChanges";
import { useAuth } from "../auth/AuthProvider";
const eventNames: Record<string, string> = {
  CREATED: "Creazione",
  ISSUE_CREATED: "Creazione",
  UPDATED: "Campi modificati",
  ISSUE_UPDATED: "Campi modificati",
  FIELDS_UPDATED: "Campi modificati",
  ASSIGNED: "Assegnazione modificata",
  ASSIGNMENT_CHANGED: "Assegnazione modificata",
  STATE_CHANGED: "Stato modificato",
  COMMENTED: "Commento aggiunto",
  COMMENT_ADDED: "Commento aggiunto",
  ARCHIVED: "Archiviazione",
  RESTORED: "Ripristino",
  DEADLINE_CHANGED: "Scadenza modificata",
  DUPLICATE_MARKED: "Duplicazione",
  DUPLICATE_UNDONE: "Duplicazione annullata",
  IMAGE_CHANGED: "Immagine modificata",
  IMAGE_REMOVED: "Immagine rimossa",
};
const fieldNames: Record<string, string> = {
  title: "Titolo",
  description: "Descrizione",
  type: "Tipo",
  status: "Stato",
  priority: "Priorità",
  reporter: "Reporter",
  reporterId: "Reporter",
  assignee: "Responsabile",
  assigneeId: "Responsabile",
  labels: "Etichette",
  labelIds: "Etichette",
  dueDate: "Scadenza",
  archived: "Archiviata",
  archivedAt: "Archiviata il",
  archivedBy: "Archiviata da",
  duplicateOf: "Issue canonica",
  duplicateOfId: "Issue canonica",
  createdAt: "Creata il",
  updatedAt: "Aggiornata il",
  lastActivityAt: "Ultima attività",
  resolvedAt: "Risolta il",
  resolvedById: "Risolta da",
  creditedAssigneeId: "Risoluzione attribuita a",
  cycleStartedAt: "Inizio ciclo",
  image: "Immagine",
  imageId: "Immagine",
  commentId: "Commento",
  before: "Prima",
  after: "Dopo",
  id: "Identificatore",
  number: "Numero",
  version: "Versione",
  active: "Account attivo",
  displayName: "Nome",
  role: "Ruolo",
  color: "Colore",
  name: "Nome",
  hasImage: "Immagine presente",
  originalName: "Nome file",
  contentType: "Formato",
  byteSize: "Dimensione in byte",
  width: "Larghezza in pixel",
  height: "Altezza in pixel",
  sha256: "Impronta del file",
};
function valueText(value: unknown): string {
  if (value === null) return "Nessuno";
  if (typeof value === "boolean") return value ? "Sì" : "No";
  if (Array.isArray(value))
    return value.length ? value.map(valueText).join("; ") : "Nessuno";
  if (typeof value === "object") {
    const entries = value as Record<string, unknown>;
    if ("before" in entries || "after" in entries)
      return `${"before" in entries ? valueText(entries.before) + " → " : ""}${valueText(entries.after)}`;
    return Object.entries(entries)
      .map(([key, item]) => `${fieldNames[key] ?? key}: ${valueText(item)}`)
      .join("\n");
  }
  if (typeof value === "string") {
    const names: Record<string, string> = {
      ...statusNames,
      ...typeNames,
      ...priorityNames,
      ADMIN: "Amministratore",
      MEMBER: "Membro del team",
      VIEWER: "Sola lettura",
    };
    if (names[value]) return names[value];
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return dateTime(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(value))
      return value.split("-").reverse().join("/");
  }
  return String(value);
}
export function IssueDiscussion({ issue }: { issue: IssueDetail }) {
  const auth = useAuth();
  const discarded = useRef(false);
  const draftName = `comment:${issue.id}`;
  const prior = useRef(
    auth.getDraft<{
      body: string;
      key: string;
      submitted: string;
      uncertain: boolean;
      retryUsed: boolean;
      submittedAt?: number;
    }>(draftName),
  );
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "comments";
  const [focusedTab, setFocusedTab] = useState(tab);
  useEffect(() => setFocusedTab(tab), [tab]);
  const historyPage = Number(params.get("historyPage") ?? "0");
  const requestedComments = params.get("commentsPage");
  const [commentsPage, setCommentsPage] = useState(
    requestedComments === null ? 0 : Number(requestedComments),
  );
  const [initialized, setInitialized] = useState(requestedComments !== null);
  const [body, setBody] = useState(prior.current?.body ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState("");
  const [uncertain, setUncertain] = useState(prior.current?.uncertain ?? false);
  const [retryUsed, setRetryUsed] = useState(prior.current?.retryUsed ?? false);
  const key = useRef(prior.current?.key ?? crypto.randomUUID());
  const submittedAt = useRef(prior.current?.submittedAt ?? 0);
  const submitted = useRef(prior.current?.submitted ?? "");
  useEffect(() => {
    if (!discarded.current && (body || uncertain))
      auth.setDraft(draftName, {
        body,
        key: key.current,
        submitted: submitted.current,
        uncertain,
        retryUsed,
        submittedAt: submittedAt.current,
      });
    else auth.removeDraft(draftName);
  }, [auth, draftName, body, uncertain, retryUsed]);
  const cache = useQueryClient();
  const valid =
    ["comments", "history"].includes(tab) &&
    Array.from(params.keys()).every((key) =>
      ["tab", "commentsPage", "historyPage"].includes(key),
    ) &&
    ["tab", "commentsPage", "historyPage"].every(
      (key) => params.getAll(key).length <= 1,
    ) &&
    [params.get("commentsPage"), params.get("historyPage")].every(
      (value) =>
        value === null ||
        (/^\d+$/.test(value) && Number.isSafeInteger(Number(value))),
    );
  const comments = useQuery({
    queryKey: ["issues", "comments", issue.id, commentsPage],
    queryFn: ({ signal }) => issueApi.comments(issue.id, commentsPage, signal),
    enabled: valid && tab === "comments",
  });
  const history = useQuery({
    queryKey: ["issues", "history", issue.id, historyPage],
    queryFn: ({ signal }) => issueApi.history(issue.id, historyPage, signal),
    enabled: valid && tab === "history",
  });
  useEffect(() => {
    if (!initialized && comments.data) {
      setCommentsPage(Math.max(0, comments.data.totalPages - 1));
      setInitialized(true);
    }
  }, [comments.data, initialized]);
  useEffect(() => {
    if (requestedComments !== null) setCommentsPage(Number(requestedComments));
  }, [requestedComments]);
  function chooseTab(next: string) {
    const query = new URLSearchParams(params);
    if (next === "comments") query.delete("tab");
    else query.set("tab", next);
    setParams(query);
  }
  function changePage(name: string, page: number) {
    const query = new URLSearchParams(params);
    query.set(name, String(page));
    setParams(query);
    if (name === "commentsPage") setCommentsPage(page);
  }
  async function send(retry = false) {
    if (busy || (uncertain && !retry)) return;
    if (
      retry &&
      (retryUsed || Date.now() - submittedAt.current >= 86_400_000)
    ) {
      setError(
        new Error(
          "Il tentativo disponibile è stato usato o sono trascorse 24 ore. Controlla i commenti prima di annullare la bozza.",
        ),
      );
      return;
    }
    const text = normalized(body);
    if (!text || codePoints(text) > 5000) {
      setError(new Error("Il commento deve contenere da 1 a 5000 caratteri."));
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess("");
    if (!retry) {
      submitted.current = text;
      submittedAt.current = Date.now();
    } else setRetryUsed(true);
    try {
      await issueApi.comment(issue.id, submitted.current, key.current);
      setBody("");
      setUncertain(false);
      setRetryUsed(false);
      key.current = crypto.randomUUID();
      auth.removeDraft(draftName);
      try {
        const latest = await issueApi.comments(issue.id, 0);
        changePage("commentsPage", Math.max(0, latest.totalPages - 1));
      } catch {
        setError(
          new Error(
            "Commento inviato. Non è stato possibile aggiornare la pagina dei commenti. Ricarica la discussione.",
          ),
        );
      }
      await cache.invalidateQueries({
        queryKey: ["issues", "comments", issue.id],
      });
      void cache.invalidateQueries({
        queryKey: ["issues", "history", issue.id],
      });
      void cache.invalidateQueries({
        queryKey: ["issues", "detail", issue.id],
      });
      setSuccess("Commento inviato.");
    } catch (problem) {
      setError(problem);
      if (problem instanceof NetworkError) setUncertain(true);
      if (problem instanceof ApiError && problem.status === 409) {
        void cache.invalidateQueries({
          queryKey: ["issues", "detail", issue.id],
        });
      }
    } finally {
      setBusy(false);
    }
  }
  if (!valid)
    return (
      <>
        <Alert>Vista della discussione non valida.</Alert>
        <Button onClick={() => setParams({})}>Ripristina vista</Button>
      </>
    );
  return (
    <section aria-label="Discussione e cronologia">
      <UnsavedChanges
        dirty={!!auth.user && (!!body || uncertain)}
        onDiscard={() => {
          discarded.current = true;
          auth.removeDraft(draftName);
        }}
      />
      <div
        role="tablist"
        className="tabs"
        aria-label="Sezioni issue"
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
            return;
          event.preventDefault();
          const next =
            event.key === "Home"
              ? "comments"
              : event.key === "End"
                ? "history"
                : focusedTab === "comments"
                  ? "history"
                  : "comments";
          setFocusedTab(next);
          document.getElementById(`issue-tab-${next}`)?.focus();
        }}
      >
        <Button
          role="tab"
          id="issue-tab-comments"
          aria-controls="issue-panel-comments"
          aria-selected={tab === "comments"}
          tabIndex={focusedTab === "comments" ? 0 : -1}
          onFocus={() => setFocusedTab("comments")}
          onClick={() => chooseTab("comments")}
        >
          Commenti
        </Button>
        <Button
          role="tab"
          id="issue-tab-history"
          aria-controls="issue-panel-history"
          aria-selected={tab === "history"}
          tabIndex={focusedTab === "history" ? 0 : -1}
          onFocus={() => setFocusedTab("history")}
          onClick={() => chooseTab("history")}
        >
          Cronologia
        </Button>
      </div>
      <div
        role="tabpanel"
        tabIndex={0}
        id={`issue-panel-${tab}`}
        aria-labelledby={`issue-tab-${tab}`}
      >
        {tab === "comments" ? (
          <>
            <h2>Commenti</h2>
            <ErrorAlert error={comments.error} />
            {comments.isPending ? (
              <p role="status">Caricamento commenti…</p>
            ) : (
              comments.data && (
                <>
                  <ul className="comment-list">
                    {comments.data.items.map((comment) => (
                      <li key={comment.id}>
                        <strong>{userName(comment.author)}</strong> ·{" "}
                        <time
                          dateTime={comment.createdAt}
                          title={comment.createdAt}
                        >
                          {dateTime(comment.createdAt)}
                        </time>
                        <p className="comment-body">{comment.body}</p>
                      </li>
                    ))}
                  </ul>
                  {comments.data.totalElements === 0 && (
                    <p>
                      {issue.permissions.canComment
                        ? "Nessun commento. Aggiungi il primo aggiornamento."
                        : "Nessun commento."}
                    </p>
                  )}
                  <Pagination
                    {...comments.data}
                    onPageChange={(page) => changePage("commentsPage", page)}
                  />
                </>
              )
            )}
            {issue.permissions.canComment && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void send();
                }}
              >
                <h3>Aggiungi un commento</h3>
                <ErrorAlert error={error} />
                {success && <Alert variant="success">{success}</Alert>}
                {uncertain && (
                  <Alert variant="warning">
                    L’esito dell’invio è incerto. La bozza è conservata.{" "}
                    <Button
                      disabled={
                        busy ||
                        retryUsed ||
                        Date.now() - submittedAt.current >= 86_400_000
                      }
                      onClick={() => void send(true)}
                    >
                      Riprova invio
                    </Button>
                  </Alert>
                )}
                <label htmlFor="comment-body">Commento</label>
                <textarea
                  id="comment-body"
                  value={body}
                  disabled={busy || uncertain}
                  aria-describedby="comment-count"
                  onChange={(e) => setBody(e.target.value)}
                />
                <p id="comment-count" className="field-hint">
                  {codePoints(body)}/5000 caratteri
                </p>
                <Button
                  type="submit"
                  variant="primary"
                  busy={busy}
                  disabled={uncertain}
                >
                  Invia commento
                </Button>
              </form>
            )}
            {!issue.permissions.canComment && body && (
              <div className="panel">
                <Alert variant="warning">
                  Non è più possibile inviare un commento su questa issue. La
                  bozza è conservata e può essere copiata.
                </Alert>
                <label htmlFor="preserved-comment">
                  Bozza commento conservata
                </label>
                <textarea id="preserved-comment" value={body} readOnly />
                <Button
                  onClick={() => {
                    setBody("");
                    setUncertain(false);
                    setRetryUsed(false);
                    auth.removeDraft(draftName);
                  }}
                >
                  Scarta bozza commento
                </Button>
              </div>
            )}
          </>
        ) : (
          <>
            <h2>Cronologia</h2>
            <ErrorAlert error={history.error} />
            {history.isPending ? (
              <p role="status">Caricamento cronologia…</p>
            ) : (
              history.data && (
                <>
                  <ol className="history-list">
                    {history.data.items.map((event) => (
                      <li key={event.id}>
                        <strong>
                          {eventNames[event.eventType] ?? event.eventType}
                        </strong>{" "}
                        · {userName(event.actor)} ·{" "}
                        <time
                          dateTime={event.occurredAt}
                          title={event.occurredAt}
                        >
                          {dateTime(event.occurredAt)}
                        </time>
                        <dl className="event-fields">
                          {Object.entries(event.changes ?? {}).map(
                            ([field, value]) => (
                              <div key={field}>
                                <dt>{fieldNames[field] ?? field}</dt>
                                <dd className="issue-description">
                                  {valueText(value)}
                                </dd>
                              </div>
                            ),
                          )}
                          {event.snapshot && (
                            <div>
                              <dt>Dati dell’evento</dt>
                              <dd className="issue-description">
                                {valueText(event.snapshot)}
                              </dd>
                            </div>
                          )}
                        </dl>
                      </li>
                    ))}
                  </ol>
                  {history.data.totalElements === 0 && (
                    <p>Nessun evento disponibile.</p>
                  )}
                  <Pagination
                    {...history.data}
                    onPageChange={(page) => changePage("historyPage", page)}
                  />
                </>
              )
            )}
          </>
        )}
      </div>
      <div
        role="tabpanel"
        id={`issue-panel-${tab === "comments" ? "history" : "comments"}`}
        aria-labelledby={`issue-tab-${tab === "comments" ? "history" : "comments"}`}
        hidden
      />
    </section>
  );
}
