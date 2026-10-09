import {
  IconArrowLeft,
  IconPencil,
  IconPhoto,
  IconCalendar,
  IconCopy,
  IconCopyOff,
  IconArchive,
  IconRestore,
  IconDots,
  IconChevronDown,
  IconLink,
} from "../../components/Icons";
import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { IssueDetail } from "../../api/types";
import { ApiError } from "../../api/ApiClient";
import { Alert, ErrorAlert } from "../../components/Alert";
import { Button } from "../../components/Button";
import { Dialog } from "../../components/Dialog";
import { LoadingState } from "../../components/LoadingState";
import { issueApi } from "./issueApi";
import {
  dateOnly,
  dateTime,
  todayRome,
  UUID,
  userName,
} from "./issuePresentation";
import {
  IssueTypeIcon,
  IssueStatusBadge,
  IssuePriorityBadge,
  IssueLabels,
} from "./IssueBadges";
import { IssuePerson } from "./IssuePerson";
import { IssueCommandDialog } from "./IssueCommandDialog";
import type { IssueCommand } from "./IssueCommandDialog";
import { IssueDiscussion } from "./IssueDiscussion";
import "./styles.css";
export function IssueDetailPage() {
  const { issueId = "" } = useParams();
  const valid = UUID.test(issueId);
  const location = useLocation();
  const cache = useQueryClient();
  const [command, setCommand] = useState<IssueCommand | null>(null);
  const [imageOpen, setImageOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [message, setMessage] = useState("");
  const issue = useQuery({
    queryKey: ["issues", "detail", issueId],
    queryFn: ({ signal }) => issueApi.detail(issueId, signal),
    enabled: valid,
    refetchOnMount: "always",
    staleTime: 0,
  });
  const image = useQuery({
    queryKey: ["issues", "image", issueId, issue.data?.image?.sha256],
    queryFn: ({ signal }) => issueApi.image(issueId, signal),
    enabled: !!issue.data?.image,
  });
  useEffect(() => {
    if (issue.data && !issue.data.image) setImageOpen(false);
  }, [issue.data]);
  useEffect(() => {
    if (!image.data) {
      setImageUrl("");
      return;
    }
    const url = URL.createObjectURL(image.data);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [image.data]);
  function saved(result: IssueDetail, message = "Modifica salvata.") {
    cache.setQueryData(["issues", "detail", issueId], result);
    void cache.invalidateQueries({ queryKey: ["issues"] });
    void cache.invalidateQueries({ queryKey: ["notifications"] });
    void cache.invalidateQueries({ queryKey: ["reporting"] });
    setMessage(message);
  }
  const state = location.state as {
    returnTo?: string;
    scrollY?: number;
    focusIssueId?: string;
    focusNewIssue?: boolean;
    boardScrollLeft?: number;
    notificationReadError?: boolean;
  } | null;
  const back =
    state?.returnTo?.startsWith("/issues") ||
    state?.returnTo?.startsWith("/archive")
      ? state.returnTo
      : issue.data?.archived
        ? "/archive"
        : "/issues";
  if (!valid || (issue.error instanceof ApiError && issue.error.status === 404))
    return (
      <>
        <h1 tabIndex={-1}>Issue non trovata</h1>
        <Link
          to={back}
          state={{
            restoreScrollY: state?.scrollY,
            focusIssueId: state?.focusIssueId,
            focusNewIssue: state?.focusNewIssue,
            boardScrollLeft: state?.boardScrollLeft,
          }}
        >
          Torna alle issue
        </Link>
      </>
    );
  if (issue.isPending) return <LoadingState />;
  if (issue.error)
    return (
      <>
        <h1 tabIndex={-1}>Dettaglio issue</h1>
        <ErrorAlert error={issue.error} />
        <Button onClick={() => void issue.refetch()}>
          Riprova caricamento
        </Button>
      </>
    );
  if (!issue.data) return null;
  const data = issue.data;
  const p = data.permissions;
  return (
    <section className="issue-detail-page">
      <div className="issue-context">
        <Link
          className="issue-back-link"
          to={back}
          state={{
            restoreScrollY: state?.scrollY,
            focusIssueId: state?.focusIssueId,
            focusNewIssue: state?.focusNewIssue,
            boardScrollLeft: state?.boardScrollLeft,
          }}
        >
          <IconArrowLeft size={16} aria-hidden="true" />
          {back.startsWith("/archive") ? "Archivio" : "Issue"}
        </Link>
        <span>/</span>
        <span className="issue-context-number">
          <IssueTypeIcon type={data.type} size={14} /> BB-{data.number}
        </span>
        <div className="issue-context-actions">
          <Button
            variant="link"
            aria-label="Copia link della issue"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(window.location.href);
                setMessage("Link copiato.");
              } catch {
                setMessage("Copia il link dalla barra degli indirizzi.");
              }
            }}
          >
            <IconLink size={16} aria-hidden="true" />
          </Button>
          {p.canEdit && (
            <Link
              className="button"
              to={`/issues/${issueId}/edit`}
              state={state}
            >
              <IconPencil size={16} aria-hidden="true" /> Modifica
            </Link>
          )}
          {(p.canDuplicate ||
            p.canUndoDuplicate ||
            p.canArchive ||
            p.canRestore) && (
            <details className="issue-actions-menu">
              <summary aria-label="Altre azioni sulla issue">
                <IconDots size={20} aria-hidden="true" />
              </summary>
              <div>
                {p.canDuplicate && (
                  <Button
                    variant="link"
                    onClick={() => setCommand("duplicate")}
                  >
                    <IconCopy size={16} aria-hidden="true" /> Segna duplicato
                  </Button>
                )}
                {p.canUndoDuplicate && (
                  <Button variant="link" onClick={() => setCommand("undo")}>
                    <IconCopyOff size={16} aria-hidden="true" /> Annulla
                    duplicazione
                  </Button>
                )}
                {p.canArchive && (
                  <Button variant="link" onClick={() => setCommand("archive")}>
                    <IconArchive size={16} aria-hidden="true" /> Archivia
                  </Button>
                )}
                {p.canRestore && (
                  <Button variant="link" onClick={() => setCommand("restore")}>
                    <IconRestore size={16} aria-hidden="true" /> Ripristina
                  </Button>
                )}
              </div>
            </details>
          )}
        </div>
      </div>
      {message && <Alert variant="success">{message}</Alert>}
      {state?.notificationReadError && (
        <Alert variant="warning">
          La issue è stata aperta, ma non è stato possibile segnare la notifica
          come letta. Il conteggio resta quello del server.
        </Alert>
      )}
      {data.archived && (
        <Alert variant="info">
          <p>
            Issue archiviata: i dati restano consultabili. Non sono consentite
            modifiche.
          </p>
          <p>
            Archiviata il {dateTime(data.archivedAt!)} da{" "}
            {userName(data.archivedBy)}.
          </p>
        </Alert>
      )}
      {data.duplicateOf && (
        <Alert variant="info">
          Duplicata di{" "}
          <Link to={`/issues/${data.duplicateOf.id}`}>
            BB-{data.duplicateOf.number} — {data.duplicateOf.title}
          </Link>
          . Leggi e aggiungi nuovi commenti alla canonica.
        </Alert>
      )}
      <div className="issue-detail-grid">
        <div className="issue-detail-main">
          <header className="issue-title">
            <h1 tabIndex={-1}>{data.title}</h1>
            <p>
              <IssuePerson user={data.reporter} />
              <span>
                ha aperto questa issue il{" "}
                <time dateTime={data.createdAt}>
                  {dateTime(data.createdAt)}
                </time>
              </span>
            </p>
          </header>
          <article className="issue-description-panel">
            <h2 className="sr-only">Descrizione</h2>
            <p className="issue-description">{data.description}</p>
          </article>
          <section className="attachments-block">
            <header>
              <h2>
                Allegati <span>{data.image ? 1 : 0}</span>
              </h2>
              {p.canEdit && (
                <Button variant="link" onClick={() => setCommand("image")}>
                  <IconPhoto size={14} aria-hidden="true" /> Gestisci immagine
                </Button>
              )}
            </header>
            {data.image ? (
              <>
                <ErrorAlert error={image.error} />
                <button
                  type="button"
                  className="attachment-preview"
                  onClick={() => setImageOpen(true)}
                  aria-label={`Apri immagine · ${data.image.originalName}`}
                >
                  {imageUrl && (
                    <img src={imageUrl} alt="Anteprima immagine allegata" />
                  )}
                  <span>
                    <IconPhoto size={14} aria-hidden="true" />
                    {data.image.originalName}
                  </span>
                </button>
              </>
            ) : (
              <p>Nessuna immagine allegata.</p>
            )}
          </section>
          <IssueDiscussion key={issueId} issue={data} />
        </div>
        <aside className="issue-meta" aria-label="Proprietà della issue">
          <h2>Proprietà</h2>
          <div className="property-list">
            <div className="property-row">
              <span className="property-label">Stato</span>
              {p.canChangeState ? (
                <Button
                  className="property-control"
                  aria-label={`Stato: ${data.status === "RESOLVED" ? "Risolta" : data.status === "IN_PROGRESS" ? "In corso" : data.status === "TODO" ? "Da fare" : "Duplicata"}`}
                  onClick={() => setCommand("state")}
                >
                  <IssueStatusBadge status={data.status} />
                  <IconChevronDown size={14} aria-hidden="true" />
                </Button>
              ) : (
                <span className="property-control static">
                  <IssueStatusBadge status={data.status} />
                </span>
              )}
              {!data.archived && !data.assignee && data.status === "TODO" && (
                <small className="property-note">
                  Assegna un responsabile per cambiare stato.
                </small>
              )}
            </div>
            <div className="property-row">
              <span className="property-label">Priorità</span>
              <span className="property-control static">
                <IssuePriorityBadge priority={data.priority} />
              </span>
            </div>
            <div className="property-row">
              <span className="property-label">Responsabile</span>
              {p.canAssign ? (
                <Button
                  className="property-control"
                  aria-label={`Responsabile: ${userName(data.assignee)}`}
                  onClick={() => setCommand("assignment")}
                >
                  <IssuePerson user={data.assignee} />
                  <IconChevronDown size={14} aria-hidden="true" />
                </Button>
              ) : (
                <span className="property-control static">
                  <IssuePerson user={data.assignee} />
                </span>
              )}
            </div>
            <div className="property-row">
              <span className="property-label">Scadenza</span>
              {p.canSetDeadline ? (
                <Button
                  className="property-control"
                  aria-label={`Scadenza: ${dateOnly(data.dueDate)}`}
                  onClick={() => setCommand("deadline")}
                >
                  <IconCalendar size={16} aria-hidden="true" />
                  {data.dueDate ? dateOnly(data.dueDate) : "Nessuna"}
                  <IconChevronDown size={14} aria-hidden="true" />
                </Button>
              ) : (
                <span className="property-control static">
                  <IconCalendar size={16} aria-hidden="true" />
                  {data.dueDate ? dateOnly(data.dueDate) : "Nessuna"}
                </span>
              )}
              {!data.archived &&
                ["TODO", "IN_PROGRESS"].includes(data.status) &&
                data.dueDate &&
                data.dueDate < todayRome() && (
                  <small className="overdue-text">
                    Scaduta il {dateOnly(data.dueDate)}
                  </small>
                )}
            </div>
            <div className="property-row">
              <span className="property-label">Tipo</span>
              <span className="property-control static">
                <IssueTypeIcon type={data.type} size={16} />
                {
                  {
                    BUG: "Bug",
                    QUESTION: "Domanda",
                    FEATURE: "Funzionalità",
                    DOCUMENTATION: "Documentazione",
                  }[data.type]
                }
              </span>
            </div>
          </div>
          <section className="property-labels">
            <h2>Etichette</h2>
            {data.labels.length ? (
              <IssueLabels issue={data} />
            ) : (
              <p>Nessuna etichetta</p>
            )}
          </section>
        </aside>
      </div>
      {command && (
        <IssueCommandDialog
          key={command}
          issue={data}
          command={command}
          onClose={() => setCommand(null)}
          onSaved={saved}
          onReload={async () => {
            await issue.refetch({ throwOnError: true });
          }}
        />
      )}
      <Dialog
        open={imageOpen}
        title={data.image?.originalName ?? "Immagine"}
        className="image-view-dialog"
        onClose={() => setImageOpen(false)}
      >
        <ErrorAlert error={image.error} />
        {image.isPending ? (
          <p role="status">Caricamento immagine…</p>
        ) : (
          imageUrl && (
            <img
              src={imageUrl}
              alt={`Immagine allegata alla issue BB-${data.number}: ${data.image?.originalName}`}
            />
          )
        )}
      </Dialog>
    </section>
  );
}
