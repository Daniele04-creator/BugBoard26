import { IconSearch, IconRefresh } from "@tabler/icons-react";
import { Avatar } from "../../components/Avatar";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { IssueDetail, IssueStatus } from "../../api/types";
import { ApiError } from "../../api/ApiClient";
import { Alert, ErrorAlert } from "../../components/Alert";
import { Button } from "../../components/Button";
import { Dialog } from "../../components/Dialog";
import { Pagination } from "../../components/Pagination";
import { issueApi } from "./issueApi";
import {
  dateOnly,
  dateTime,
  normalized,
  codePoints,
  todayRome,
  userName,
} from "./issuePresentation";
import { ImagePicker } from "./ImagePicker";
import { roleNames } from "../users/adminPresentation";
import { IssueStatusBadge } from "./IssueBadges";
import { IssuePerson } from "./IssuePerson";
export type IssueCommand =
  | "assignment"
  | "state"
  | "deadline"
  | "archive"
  | "restore"
  | "duplicate"
  | "undo"
  | "image";
const titles: Record<IssueCommand, string> = {
  assignment: "Assegna",
  state: "Cambia stato",
  deadline: "Scadenza",
  archive: "Archivia",
  restore: "Ripristina",
  duplicate: "Segna duplicato",
  undo: "Annulla duplicazione",
  image: "Gestisci immagine",
};
export function IssueCommandDialog({
  issue,
  command,
  onClose,
  onSaved,
  onReload,
}: {
  issue: IssueDetail;
  command: IssueCommand;
  onClose: () => void;
  onSaved: (issue: IssueDetail, message?: string) => void;
  onReload: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState("");
  const [selection, setSelection] = useState(
    command === "assignment" ? (issue.assignee?.id ?? "") : "",
  );
  const [selectedUser, setSelectedUser] = useState(
    command === "assignment" ? issue.assignee : null,
  );
  const [dueDate, setDueDate] = useState(issue.dueDate ?? "");
  const [removeDate, setRemoveDate] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [candidateDraft, setCandidateDraft] = useState("");
  const [candidateSearch, setCandidateSearch] = useState("");
  const [candidatePage, setCandidatePage] = useState(0);
  const [candidateSearchError, setCandidateSearchError] = useState("");
  const candidates = useQuery({
    queryKey: [
      "issues",
      "assignment-candidates",
      candidateSearch,
      candidatePage,
    ],
    queryFn: ({ signal }) =>
      issueApi.candidates(candidateSearch, candidatePage, signal),
    enabled: command === "assignment",
    staleTime: 0,
  });
  const suggestions = useQuery({
    queryKey: ["issues", "suggestions", issue.id],
    queryFn: ({ signal }) => issueApi.suggestions(issue.id, signal),
    enabled: command === "assignment",
  });
  const targets = useQuery({
    queryKey: ["issues", "duplicate-targets", search, page],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({
        q: search,
        archived: "false",
        page: String(page),
        size: "20",
      });
      ["TODO", "IN_PROGRESS", "RESOLVED"].forEach((status) =>
        params.append("status", status),
      );
      return issueApi.list(params.toString(), signal);
    },
    enabled: command === "duplicate" && !!search,
  });
  const ranked =
    suggestions.data && !suggestions.error ? suggestions.data.candidates : null;
  const rankedById = new Map(
    ranked?.map((candidate) => [candidate.user.id, candidate]),
  );
  const candidateRows =
    !candidateSearch && ranked
      ? ranked
          .slice(candidatePage * 20, (candidatePage + 1) * 20)
          .map((candidate) => candidate.user)
      : [...(candidates.data?.items ?? [])].sort(
          (left, right) =>
            (rankedById.get(left.id)?.rank ?? Number.MAX_SAFE_INTEGER) -
            (rankedById.get(right.id)?.rank ?? Number.MAX_SAFE_INTEGER),
        );
  const candidateTotal =
    !candidateSearch && ranked
      ? ranked.length
      : (candidates.data?.totalElements ?? 0);
  const candidateTotalPages = Math.ceil(candidateTotal / 20);
  const selectedCandidate =
    ranked?.find((candidate) => candidate.user.id === selection)?.user ??
    candidates.data?.items.find((user) => user.id === selection) ??
    (selectedUser?.id === selection ? selectedUser : null);
  const pinnedCandidates = [issue.assignee, selectedCandidate].filter(
    (user) => user !== null && user !== undefined,
  );
  const visibleCandidates = Array.from(
    new Map(
      [...candidateRows, ...pinnedCandidates].map((user) => [user.id, user]),
    ).values(),
  );
  useEffect(() => {
    if (
      command === "state" &&
      selection &&
      !issue.permissions.allowedStateTargets.includes(selection as IssueStatus)
    )
      setError(
        new Error(
          "Lo stato scelto non è più disponibile. Scegli un’opzione corrente.",
        ),
      );
  }, [issue.permissions.allowedStateTargets, command, selection]);
  async function save() {
    if (busy) return;
    if (
      command === "deadline" &&
      !removeDate &&
      (dueDate < todayRome() ||
        dueDate > "2100-12-31" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(dueDate))
    ) {
      setError(new Error("Scegli una scadenza da oggi al 31/12/2100."));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let result: IssueDetail;
      if (command === "image")
        result = removeImage
          ? await issueApi.deleteImage(issue.id, issue.version)
          : await issueApi.putImage(issue.id, file!, issue.version);
      else {
        const [name, body] =
          command === "assignment"
            ? ["assignment", { assigneeId: selection || null }]
            : command === "state"
              ? ["state", { status: selection }]
              : command === "deadline"
                ? ["deadline", { dueDate: removeDate ? null : dueDate }]
                : command === "duplicate"
                  ? ["duplicate", { targetIssueId: selection }]
                  : command === "undo"
                    ? ["duplicate", { targetIssueId: null }]
                    : ["archive", { archived: command === "archive" }];
        result = await issueApi.command(
          issue.id,
          name as string,
          body as Record<string, unknown>,
          issue.version,
        );
      }
      onSaved(
        result,
        command === "assignment" && result.version === issue.version
          ? "Assegnazione già presente."
          : undefined,
      );
      setConflict(false);
      if (command === "image") {
        setFile(null);
        setRemoveImage(false);
        setSuccess("Immagine aggiornata. Il comando è stato salvato.");
      } else onClose();
    } catch (problem) {
      setError(problem);
      if (problem instanceof ApiError && problem.code === "VERSION_CONFLICT")
        setConflict(true);
    } finally {
      setBusy(false);
    }
  }
  const stateValid =
    command !== "state" ||
    issue.permissions.allowedStateTargets.includes(selection as IssueStatus);
  const disabled =
    busy ||
    !(command === "assignment"
      ? issue.permissions.canAssign
      : command === "state"
        ? issue.permissions.canChangeState
        : command === "deadline"
          ? issue.permissions.canSetDeadline
          : command === "duplicate"
            ? issue.permissions.canDuplicate
            : command === "undo"
              ? issue.permissions.canUndoDuplicate
              : command === "archive"
                ? issue.permissions.canArchive
                : command === "restore"
                  ? issue.permissions.canRestore
                  : issue.permissions.canEdit) ||
    conflict ||
    !stateValid ||
    (command === "assignment" && !!selection && !selectedCandidate) ||
    (command === "duplicate" && !selection) ||
    (command === "deadline" && !removeDate && !dueDate) ||
    (command === "image" && !removeImage && !file);
  return (
    <Dialog
      open
      title={`${titles[command]} BB-${issue.number}`}
      className={`command-dialog issue-command-${command}`}
      onClose={onClose}
      busy={busy}
      sensitive={["archive", "restore", "undo"].includes(command)}
      footer={
        <>
          <Button
            variant={
              ["archive", "undo"].includes(command) ||
              (command === "image" && removeImage)
                ? "danger"
                : "primary"
            }
            busy={busy}
            disabled={disabled}
            onClick={() => void save()}
          >
            {command === "image"
              ? removeImage
                ? "Conferma rimozione"
                : issue.image
                  ? "Sostituisci immagine"
                  : "Aggiungi immagine"
              : command === "state"
                ? selection === "RESOLVED"
                  ? "Segna come risolta"
                  : issue.status === "RESOLVED"
                    ? "Riapri issue"
                    : "Salva stato"
                : command === "deadline"
                  ? "Salva scadenza"
                  : command === "assignment"
                    ? "Conferma assegnazione"
                    : titles[command]}
          </Button>
          <Button data-cancel disabled={busy} onClick={onClose}>
            Annulla
          </Button>
        </>
      }
    >
      <ErrorAlert error={error} />
      {success && <Alert variant="success">{success}</Alert>}
      {conflict && (
        <Alert variant="warning">
          La issue è cambiata. Le tue scelte restano disponibili.{" "}
          <Button
            onClick={async () => {
              try {
                await onReload();
                setConflict(false);
                setError(null);
              } catch (problem) {
                setError(problem);
              }
            }}
          >
            Ricarica dati per confronto
          </Button>
        </Alert>
      )}
      {command === "assignment" && (
        <>
          <div className="issue-command-summary">
            <span>Responsabile attuale:</span>
            <IssuePerson user={issue.assignee} />
          </div>
          <p>
            Un solo responsabile. I suggerimenti confrontano le issue aperte,
            escludendo questa issue.
          </p>
          <form
            className="assignment-search"
            onSubmit={(event) => {
              event.preventDefault();
              const clean = normalized(candidateDraft);
              if (codePoints(clean) > 100) {
                setCandidateSearchError(
                  "La ricerca può contenere al massimo 100 caratteri.",
                );
                return;
              }
              setCandidateSearchError("");
              setCandidateSearch(clean);
              setCandidatePage(0);
            }}
          >
            <label htmlFor="candidate-search">Cerca utenti per nome</label>
            <input
              id="candidate-search"
              disabled={busy}
              value={candidateDraft}
              onChange={(event) => setCandidateDraft(event.target.value)}
              aria-invalid={!!candidateSearchError}
              aria-describedby={
                candidateSearchError ? "candidate-search-error" : undefined
              }
            />
            <Button type="submit" disabled={busy}>
              <IconSearch size={20} stroke={2} aria-hidden="true" />
              Cerca utenti
            </Button>
            {candidateSearchError && (
              <p
                id="candidate-search-error"
                role="alert"
                className="field-error"
              >
                {candidateSearchError}
              </p>
            )}
          </form>
          {suggestions.error && (
            <Alert variant="warning">
              Carico non disponibile. Puoi scegliere fra i candidati manuali.
            </Alert>
          )}
          <div className="actions">
            <Button
              disabled={busy}
              onClick={() => void suggestions.refetch()}
              busy={suggestions.isFetching}
            >
              <IconRefresh size={20} stroke={2} aria-hidden="true" />
              Aggiorna carichi
            </Button>
            {ranked && (
              <span>Rilevato alle {dateTime(suggestions.data!.asOf)}</span>
            )}
          </div>
          <ErrorAlert error={candidates.error} />
          {candidates.error && (
            <Button onClick={() => void candidates.refetch()}>
              Riprova elenco candidati
            </Button>
          )}
          {!ranked && candidates.isPending && (
            <p role="status">Caricamento dei candidati…</p>
          )}
          <fieldset className="assignment-list">
            <legend>Scegli responsabile</legend>
            <label className="assignment-option">
              <input
                type="radio"
                disabled={busy}
                name="assignee"
                value=""
                checked={!selection}
                onChange={() => {
                  setSelection("");
                  setSelectedUser(null);
                }}
              />
              <span>Nessuna assegnazione</span>
            </label>
            {visibleCandidates.map((user) => (
              <label className="assignment-option" key={user.id}>
                <input
                  type="radio"
                  disabled={busy}
                  name="assignee"
                  value={user.id}
                  checked={selection === user.id}
                  onChange={() => {
                    setSelection(user.id);
                    setSelectedUser(user);
                  }}
                />
                <Avatar name={user.displayName} id={user.id} size={32} />
                <span>
                  {userName(user)} · {roleNames[user.role]} ·{" "}
                  {user.id.slice(0, 8)}
                  <small>
                    {rankedById.has(user.id)
                      ? `${rankedById.get(user.id)!.openIssueCount} issue aperte · ${rankedById.get(user.id)!.reason}`
                      : "Carico non disponibile"}
                  </small>
                  {rankedById.get(user.id)?.rank === 1 && (
                    <small>Suggerito per il carico minore</small>
                  )}
                  {user.id === issue.assignee?.id && (
                    <small>Responsabile attuale</small>
                  )}
                  {!candidateRows.some(
                    (candidate) => candidate.id === user.id,
                  ) &&
                    user.id === selection && (
                      <small>Selezione conservata fuori pagina</small>
                    )}
                </span>
              </label>
            ))}
          </fieldset>
          {(ranked || candidates.data) && (
            <Pagination
              page={candidatePage}
              size={20}
              totalPages={candidateTotalPages}
              totalElements={candidateTotal}
              onPageChange={setCandidatePage}
            />
          )}
          {(ranked || candidates.data) &&
            candidateTotal === 0 &&
            !candidates.error && (
              <p>
                Non ci sono utenti assegnabili
                {candidateSearch ? " per questa ricerca" : ""}.{" "}
                <Link to="/admin/users">Gestisci utenti</Link>
              </p>
            )}
          {issue.status === "IN_PROGRESS" &&
            selection !== (issue.assignee?.id ?? "") && (
              <p>Lo stato tornerà Da fare; il ciclo corrente continua.</p>
            )}
          {selectedCandidate && selection !== (issue.assignee?.id ?? "") && (
            <p>
              {selectedCandidate.displayName} riceverà una notifica nell’app.
            </p>
          )}
          {!selection && issue.assignee && (
            <p>La rimozione non invia una notifica.</p>
          )}
          <p>
            Il carico può cambiare prima della conferma. Nessuna assegnazione
            automatica.
          </p>
        </>
      )}
      {command === "state" && (
        <>
          <div className="issue-command-summary">
            <span>Stato corrente:</span>
            <IssueStatusBadge status={issue.status} />
          </div>
          <div className="issue-command-summary">
            <span>Responsabile del lavoro:</span>
            <IssuePerson user={issue.assignee} />
          </div>
          <fieldset>
            <legend>Nuovo stato</legend>
            {issue.permissions.allowedStateTargets.map((status) => (
              <label className="check-option" key={status}>
                <input
                  type="radio"
                  disabled={busy}
                  name="status"
                  checked={selection === status}
                  onChange={() => {
                    setSelection(status);
                    setError(null);
                  }}
                />
                <IssueStatusBadge status={status} />
              </label>
            ))}
          </fieldset>
          {selection === "RESOLVED" && (
            <p>
              Il reporter riceverà una notifica nell’app. La risoluzione sarà
              attribuita al responsabile del lavoro e registrata nella
              cronologia.
            </p>
          )}
          {issue.status === "RESOLVED" && (
            <p>
              Si avvierà un nuovo ciclo; i precedenti restano. Il responsabile
              resterà assegnato solo se ancora idoneo; altrimenti l’issue sarà
              senza responsabile.
            </p>
          )}
        </>
      )}
      {command === "deadline" && (
        <>
          <p>Attuale: {dateOnly(issue.dueDate)}</p>
          <label htmlFor="deadline-date">Data</label>
          <input
            id="deadline-date"
            type="date"
            min={todayRome()}
            max="2100-12-31"
            value={dueDate}
            disabled={removeDate || busy}
            onChange={(e) => setDueDate(e.target.value)}
          />
          <p className="field-hint">Da oggi al 31/12/2100.</p>
          <label className="check-option">
            <input
              type="checkbox"
              disabled={busy}
              checked={removeDate}
              onChange={(e) => setRemoveDate(e.target.checked)}
            />
            Rimuovi scadenza
          </label>
        </>
      )}
      {command === "duplicate" && (
        <>
          <form
            className="assignment-search duplicate-search"
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(searchDraft.trim());
              setPage(0);
              setSelection("");
            }}
          >
            <label htmlFor="duplicate-search">
              Cerca issue canonica nel titolo o nella descrizione
            </label>
            <input
              id="duplicate-search"
              disabled={busy}
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              maxLength={100}
            />
            <Button type="submit" disabled={busy}>
              <IconSearch size={20} stroke={2} aria-hidden="true" />
              Cerca canonica
            </Button>
          </form>
          <ErrorAlert error={targets.error} />
          {targets.isFetching && <p role="status">Ricerca in corso…</p>}
          {targets.data && (
            <>
              <fieldset className="duplicate-targets">
                <legend>Scegli issue canonica</legend>
                {targets.data.items
                  .filter((target) => target.id !== issue.id)
                  .map((target) => (
                    <label className="check-option" key={target.id}>
                      <input
                        type="radio"
                        disabled={busy}
                        name="target"
                        checked={selection === target.id}
                        onChange={() => setSelection(target.id)}
                      />
                      <span>
                        BB-{target.number} · {target.title}
                      </span>
                      <IssueStatusBadge status={target.status} />
                    </label>
                  ))}
              </fieldset>
              <Pagination {...targets.data} onPageChange={setPage} />
            </>
          )}
          {targets.data &&
            targets.data.items.filter((target) => target.id !== issue.id)
              .length === 0 && (
              <p>Nessuna issue canonica corrisponde alla ricerca.</p>
            )}
          <p>
            Questa issue sarà chiusa come Duplicata. Non verrà inviata una
            notifica di risoluzione.
          </p>
        </>
      )}
      {command === "archive" && (
        <>
          <p>
            <strong>{issue.title}</strong>
          </p>
          <p>
            Non apparirà nelle liste e nel carico corrente. Stato, commenti e
            cronologia saranno conservati.
          </p>
        </>
      )}
      {command === "restore" && (
        <>
          <p>
            <strong>{issue.title}</strong>
          </p>
          <p>
            L’issue tornerà nell’elenco corrente. Se l’issue è aperta e il
            responsabile è inattivo, è un utente in sola lettura o deve ancora
            completare il cambio password, verrà rimosso e lo stato sarà Da
            fare.
          </p>
        </>
      )}
      {command === "undo" && (
        <>
          <p>
            Canonica attuale:{" "}
            {issue.duplicateOf
              ? `BB-${issue.duplicateOf.number} · ${issue.duplicateOf.title}`
              : "Non disponibile"}
            .
          </p>
          <p>
            Il collegamento alla canonica sarà rimosso. Stato futuro: Da fare,
            con un nuovo ciclo. Il responsabile sarà mantenuto solo se ancora
            idoneo.
          </p>
        </>
      )}
      {command === "image" && (
        <>
          <p>
            Attuale: {issue.image?.originalName ?? "Nessuna immagine"}. Queste
            azioni salvano soltanto l’immagine.
          </p>
          <ImagePicker
            file={file}
            onChange={(next) => {
              setFile(next);
              setRemoveImage(false);
            }}
            disabled={busy}
          />
          {issue.image && (
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                setRemoveImage(true);
                setFile(null);
              }}
            >
              Rimuovi immagine
            </Button>
          )}
          {removeImage && (
            <Alert variant="warning">
              Conferma la rimozione dell’immagine attuale. Gli altri dati
              resteranno disponibili.
            </Alert>
          )}
        </>
      )}
    </Dialog>
  );
}
