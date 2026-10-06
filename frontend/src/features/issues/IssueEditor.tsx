import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, NetworkError } from "../../api/ApiClient";
import type { IssueDetail } from "../../api/types";
import { Alert, ErrorAlert } from "../../components/Alert";
import { Button } from "../../components/Button";
import { getLabels, issueApi } from "./issueApi";
import type { IssueFields } from "./issueApi";
import {
  codePoints,
  normalized,
  priorityNames,
  typeNames,
} from "./issuePresentation";
import { ImagePicker } from "./ImagePicker";
import { UnsavedChanges } from "./UnsavedChanges";
import { useAuth } from "../auth/AuthProvider";
import "./styles.css";
const fieldsOf = (issue: IssueDetail): IssueFields => ({
  title: issue.title,
  description: issue.description,
  type: issue.type,
  priority: issue.priority,
  labelIds: issue.labels.map((label) => label.id),
});
const empty: IssueFields = {
  title: "",
  description: "",
  type: "BUG",
  priority: "MEDIUM",
  labelIds: [],
};
export function IssueEditor({ issue }: { issue?: IssueDetail }) {
  const auth = useAuth();
  const discarded = useRef(false);
  const draftName = `issue:${issue?.id ?? "new"}`;
  const previousDraft = useRef(
    auth.getDraft<{
      fields: IssueFields;
      file: File | null;
      version: number;
      key: string;
      submitted: { fields: IssueFields; file: File | null } | null;
      uncertain: boolean;
      retryUsed: boolean;
      submittedAt?: number;
    }>(draftName),
  );
  const [fields, setFields] = useState<IssueFields>(
    () => previousDraft.current?.fields ?? (issue ? fieldsOf(issue) : empty),
  );
  const [file, setFile] = useState<File | null>(
    previousDraft.current?.file ?? null,
  );
  const [version, setVersion] = useState(
    previousDraft.current?.version ?? issue?.version ?? 0,
  );
  const [initial] = useState(JSON.stringify(issue ? fieldsOf(issue) : empty));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const errorSummary = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) {
      const frame = requestAnimationFrame(() => errorSummary.current?.focus());
      return () => cancelAnimationFrame(frame);
    }
  }, [error]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uncertain, setUncertain] = useState(
    previousDraft.current?.uncertain ?? false,
  );
  const [retryUsed, setRetryUsed] = useState(
    previousDraft.current?.retryUsed ?? false,
  );
  const [current, setCurrent] = useState<IssueDetail | null>(null);
  const key = useRef(previousDraft.current?.key ?? crypto.randomUUID());
  const submittedAt = useRef(previousDraft.current?.submittedAt ?? 0);
  const submitted = useRef(previousDraft.current?.submitted ?? null);
  const navigate = useNavigate();
  const cache = useQueryClient();
  const labels = useQuery({
    queryKey: ["labels", "active"],
    queryFn: ({ signal }) => getLabels(signal),
  });
  useEffect(() => {
    if (saved) navigate(`/issues/${savedId.current}`, { replace: true });
  }, [saved, navigate]);
  const savedId = useRef("");
  const dirty =
    !saved && (JSON.stringify(fields) !== initial || !!file || uncertain);
  useEffect(() => {
    if (saved || discarded.current) auth.removeDraft(draftName);
    else if (dirty)
      auth.setDraft(draftName, {
        fields,
        file,
        version,
        key: key.current,
        submitted: submitted.current,
        uncertain,
        retryUsed,
        submittedAt: submittedAt.current,
      });
    else auth.removeDraft(draftName);
  }, [
    fields,
    file,
    version,
    uncertain,
    retryUsed,
    saved,
    dirty,
    auth,
    draftName,
  ]);
  function change(name: keyof IssueFields, value: unknown) {
    setFields((previous) => ({ ...previous, [name]: value }));
    setErrors((previous) => ({ ...previous, [name]: "" }));
  }
  async function save(event?: FormEvent, retry = false) {
    event?.preventDefault();
    if (busy) return;
    if (uncertain && !retry) return;
    if (
      retry &&
      (retryUsed || Date.now() - submittedAt.current >= 86_400_000)
    ) {
      setError(
        new Error(
          "Il tentativo disponibile è stato usato o sono trascorse 24 ore. Controlla l’elenco prima di annullare la bozza.",
        ),
      );
      return;
    }
    const clean = {
      ...fields,
      title: normalized(fields.title),
      description: normalized(fields.description),
    };
    const validation: Record<string, string> = {};
    if (codePoints(clean.title) < 3 || codePoints(clean.title) > 160)
      validation.title = "Il titolo deve contenere da 3 a 160 caratteri.";
    if (
      codePoints(clean.description) < 10 ||
      codePoints(clean.description) > 10000
    )
      validation.description =
        "La descrizione deve contenere da 10 a 10000 caratteri.";
    if (clean.labelIds.length > 20)
      validation.labelIds = "Scegli al massimo 20 etichette.";
    setErrors(validation);
    if (Object.keys(validation).length) {
      setError(new Error("Controlla i campi indicati."));
      return;
    }
    if (issue && JSON.stringify(clean) === initial) return;
    setBusy(true);
    setError(null);
    if (!retry) {
      submitted.current = { fields: clean, file };
      submittedAt.current = Date.now();
    } else setRetryUsed(true);
    try {
      const result = issue
        ? await issueApi.update(issue.id, clean, version)
        : await issueApi.create(
            submitted.current!.fields,
            submitted.current!.file,
            key.current,
          );
      cache.setQueryData(["issues", "detail", result.id], result);
      void cache.invalidateQueries({ queryKey: ["issues", "list"] });
      void cache.invalidateQueries({ queryKey: ["reporting"] });
      savedId.current = result.id;
      setSaved(true);
      setUncertain(false);
    } catch (problem) {
      setError(problem);
      if (problem instanceof ApiError) {
        setErrors(
          Object.fromEntries(
            problem.problem.fieldErrors.map((field) => [
              field.field,
              field.message,
            ]),
          ),
        );
        if (problem.code === "VERSION_CONFLICT" && issue) {
          try {
            setCurrent(await issueApi.detail(issue.id));
          } catch {
            /* Keep the draft and explicit reload action. */
          }
        }
      }
      if (!issue && problem instanceof NetworkError) setUncertain(true);
    } finally {
      setBusy(false);
    }
  }
  const selectedInactive =
    issue?.labels.filter(
      (label) => !label.active && fields.labelIds.includes(label.id),
    ) ?? [];
  return (
    <div className="form-layout">
      <h1 tabIndex={-1}>
        {issue ? `Modifica issue BB-${issue.number}` : "Nuova issue"}
      </h1>
      <UnsavedChanges
        dirty={dirty && !!auth.user}
        onDiscard={() => {
          discarded.current = true;
          auth.removeDraft(draftName);
        }}
      />
      <div ref={errorSummary} tabIndex={-1}>
        {Object.values(errors).some(Boolean) ? (
          <Alert>
            <p>Controlla i campi indicati.</p>
            <ul>
              {Object.entries(errors)
                .filter(([, message]) => !!message)
                .map(([field, message]) => (
                  <li key={field}>
                    <a
                      href={`#issue-${field}`}
                      onClick={(event) => {
                        event.preventDefault();
                        (
                          document.getElementById(`issue-${field}`) ??
                          (field === "labelIds"
                            ? document.getElementById("issue-labels")
                            : document.querySelector<HTMLInputElement>(
                                "input[type=file]",
                              ))
                        )?.focus();
                      }}
                    >
                      {message}
                    </a>
                  </li>
                ))}
            </ul>
          </Alert>
        ) : (
          <ErrorAlert error={error} />
        )}
      </div>
      {uncertain && (
        <Alert variant="warning">
          L’esito della creazione è incerto. La bozza è conservata; riprova con
          gli stessi dati per evitare duplicati.{" "}
          <Button
            disabled={
              busy ||
              retryUsed ||
              Date.now() - submittedAt.current >= 86_400_000
            }
            onClick={() => void save(undefined, true)}
          >
            Riprova creazione
          </Button>
          {retryUsed && (
            <p>
              Il tentativo disponibile è stato usato. Controlla l’elenco prima
              di una nuova creazione.
            </p>
          )}
        </Alert>
      )}
      {error instanceof ApiError && error.code === "VERSION_CONFLICT" && (
        <Alert variant="warning">
          <p>
            La issue è stata modificata da un altro utente. La tua bozza resta
            disponibile.
          </p>
          {current && (
            <>
              <p>
                Dati correnti: <strong>{current.title}</strong> ·{" "}
                {priorityNames[current.priority]} · versione {current.version}
              </p>
              <p className="issue-description">{current.description}</p>
              <Button
                onClick={() => {
                  setVersion(current.version);
                  setError(null);
                }}
              >
                Usa la versione corrente mantenendo la bozza
              </Button>
            </>
          )}
          <Button
            onClick={async () => {
              try {
                setCurrent(await issueApi.detail(issue!.id));
              } catch (problem) {
                setError(problem);
              }
            }}
          >
            Ricarica dati per confronto
          </Button>
        </Alert>
      )}
      <form className="panel" onSubmit={(event) => void save(event)}>
        <p>* Campo obbligatorio</p>
        <div className="field">
          <label htmlFor="issue-title">Titolo *</label>
          <input
            id="issue-title"
            data-field-error={errors.title || undefined}
            aria-invalid={!!errors.title}
            aria-describedby="title-count title-error"
            value={fields.title}
            disabled={busy || uncertain}
            onChange={(e) => change("title", e.target.value)}
          />
          <p id="title-count" className="field-hint">
            {codePoints(fields.title)}/160 caratteri
          </p>
          {errors.title && (
            <p id="title-error" className="field-error">
              {errors.title}
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor="issue-description">Descrizione *</label>
          <textarea
            id="issue-description"
            data-field-error={errors.description || undefined}
            aria-invalid={!!errors.description}
            aria-describedby="description-count description-error"
            value={fields.description}
            disabled={busy || uncertain}
            onChange={(e) => change("description", e.target.value)}
          />
          <p id="description-count" className="field-hint">
            {codePoints(fields.description)}/10000 caratteri
          </p>
          {errors.description && (
            <p id="description-error" className="field-error">
              {errors.description}
            </p>
          )}
        </div>
        <div className="issue-form-grid">
          <div className="field">
            <label htmlFor="issue-type">Tipo *</label>
            <select
              id="issue-type"
              value={fields.type}
              disabled={busy || uncertain}
              onChange={(e) => change("type", e.target.value)}
            >
              {Object.entries(typeNames).map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="issue-priority">Priorità</label>
            <select
              id="issue-priority"
              value={fields.priority}
              disabled={busy || uncertain}
              onChange={(e) => change("priority", e.target.value)}
            >
              {Object.entries(priorityNames).map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </select>
          </div>
        </div>
        <fieldset id="issue-labels" tabIndex={-1} className="field">
          <legend>Etichette · massimo 20</legend>
          <ErrorAlert error={labels.error} />
          <div className="label-options">
            {[...(labels.data ?? []), ...selectedInactive].map((label) => (
              <label className="check-option" key={label.id}>
                <input
                  type="checkbox"
                  disabled={busy || uncertain}
                  checked={fields.labelIds.includes(label.id)}
                  onChange={(e) =>
                    change(
                      "labelIds",
                      e.target.checked
                        ? [...fields.labelIds, label.id]
                        : fields.labelIds.filter((id) => id !== label.id),
                    )
                  }
                />
                {label.name}
                {label.active ? "" : " · Inattiva (rimuovibile)"}
              </label>
            ))}
          </div>
          {errors.labelIds && <p className="field-error">{errors.labelIds}</p>}
        </fieldset>
        {issue ? (
          <p>
            Immagine: {issue.image?.originalName ?? "Nessuna immagine"}.{" "}
            <Link to={`/issues/${issue.id}`}>
              Torna al dettaglio per gestirla
            </Link>
            . La gestione dell’immagine salva un comando separato.
          </p>
        ) : (
          <>
            <ImagePicker
              file={file}
              onChange={setFile}
              disabled={busy || uncertain}
            />
            <p>L’issue nascerà Da fare e senza assegnatario.</p>
          </>
        )}
        <div className="actions">
          <Button
            type="submit"
            variant="primary"
            busy={busy}
            disabled={
              uncertain ||
              (error instanceof ApiError &&
                error.code === "VERSION_CONFLICT") ||
              (!!issue && JSON.stringify(fields) === initial) ||
              labels.isPending ||
              !!labels.error
            }
          >
            {issue ? "Salva modifiche" : "Crea issue"}
          </Button>
          <Link
            className="button button-link"
            to={issue ? `/issues/${issue.id}` : "/issues"}
          >
            Annulla
          </Link>
        </div>
      </form>
    </div>
  );
}
