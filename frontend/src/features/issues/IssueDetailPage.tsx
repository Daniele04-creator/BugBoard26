import {
  IconArrowLeft,
  IconPencil,
  IconPhoto,
  IconUserPlus,
  IconCalendar,
  IconSwitchHorizontal,
  IconCopy,
  IconCopyOff,
  IconArchive,
  IconRestore,
} from "@tabler/icons-react";
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
import { IssueBadges } from "./IssueBadges";
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
    enabled: imageOpen && !!issue.data?.image,
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
        <Link to="/issues">Torna alle issue</Link>
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
      <Link
        className="issue-back-link"
        to={back}
        state={{ restoreScrollY: state?.scrollY }}
      >
        <IconArrowLeft size={20} stroke={2} aria-hidden="true" />
        Torna {back.startsWith("/archive") ? "all’archivio" : "all’elenco"}
      </Link>
      <div className="issue-heading">
        <div>
          <p className="issue-number">BB-{data.number}</p>
          <h1 tabIndex={-1}>{data.title}</h1>
          <IssueBadges issue={data} />
        </div>
        {p.canEdit && (
          <Link className="button" to={`/issues/${issueId}/edit`}>
            <IconPencil size={20} stroke={2} aria-hidden="true" />
            Modifica
          </Link>
        )}
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
        <aside className="panel issue-meta">
          <h2>Metadati</h2>
          <dl>
            <dt>Reporter</dt>
            <dd>
              <IssuePerson user={data.reporter} />
            </dd>
            <dt>Responsabile</dt>
            <dd>
              <IssuePerson user={data.assignee} />
            </dd>
            <dt>Scadenza</dt>
            <dd>
              {dateOnly(data.dueDate)}
              {!data.archived &&
                ["TODO", "IN_PROGRESS"].includes(data.status) &&
                data.dueDate &&
                data.dueDate < todayRome() && (
                  <p className="overdue-text">
                    Scaduta il {dateOnly(data.dueDate)}
                  </p>
                )}
            </dd>
            <dt>Creata</dt>
            <dd>
              <time dateTime={data.createdAt} title={data.createdAt}>
                {dateTime(data.createdAt)}
              </time>
            </dd>
            <dt>Aggiornata</dt>
            <dd>{dateTime(data.updatedAt)}</dd>
            <dt>Ultima attività</dt>
            <dd>{dateTime(data.lastActivityAt)}</dd>
            <dt>Versione</dt>
            <dd>{data.version}</dd>
          </dl>
          <div className="actions">
            {p.canAssign && (
              <Button onClick={() => setCommand("assignment")}>
                <IconUserPlus size={20} stroke={2} aria-hidden="true" />
                {data.assignee ? "Riassegna" : "Assegna"}
              </Button>
            )}
            {p.canSetDeadline && (
              <Button onClick={() => setCommand("deadline")}>
                <IconCalendar size={20} stroke={2} aria-hidden="true" />
                Scadenza
              </Button>
            )}
            {p.canChangeState && (
              <Button onClick={() => setCommand("state")}>
                <IconSwitchHorizontal size={20} stroke={2} aria-hidden="true" />
                {data.status === "RESOLVED" ? "Riapri" : "Cambia stato"}
              </Button>
            )}
            {p.canDuplicate && (
              <Button onClick={() => setCommand("duplicate")}>
                <IconCopy size={20} stroke={2} aria-hidden="true" />
                Segna duplicato
              </Button>
            )}
            {p.canUndoDuplicate && (
              <Button onClick={() => setCommand("undo")}>
                <IconCopyOff size={20} stroke={2} aria-hidden="true" />
                Annulla duplicazione
              </Button>
            )}
            {p.canArchive && (
              <Button onClick={() => setCommand("archive")}>
                <IconArchive size={20} stroke={2} aria-hidden="true" />
                Archivia
              </Button>
            )}
            {p.canRestore && (
              <Button onClick={() => setCommand("restore")}>
                <IconRestore size={20} stroke={2} aria-hidden="true" />
                Ripristina
              </Button>
            )}
            {p.canEdit && (
              <Button onClick={() => setCommand("image")}>
                <IconPhoto size={20} stroke={2} aria-hidden="true" />
                Gestisci immagine
              </Button>
            )}
          </div>
        </aside>
        <div className="issue-detail-main">
          <article className="panel issue-description-panel">
            <h2>Descrizione</h2>
            <p className="issue-description">{data.description}</p>
            {data.image && (
              <Button onClick={() => setImageOpen(true)}>
                <IconPhoto size={20} stroke={2} aria-hidden="true" />
                Apri immagine · {data.image.originalName}
              </Button>
            )}
          </article>
          <IssueDiscussion key={issueId} issue={data} />
        </div>
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
