import { useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { userApi } from "./userApi";
import {
  fieldErrors,
  normalizedName,
  passwordError,
  roleDescriptions,
  roleNames,
  dateTime,
} from "./adminPresentation";
import type { UserAdmin, UserRole } from "../../api/types";
import { ApiError } from "../../api/ApiClient";
import { Alert, ErrorAlert } from "../../components/Alert";
import { Button } from "../../components/Button";
import { Dialog } from "../../components/Dialog";
import { TextField } from "../../components/TextField";
import { SelectField } from "../../components/SelectField";
import { LoadingState } from "../../components/LoadingState";
import { PasswordField } from "../auth/PasswordField";
import { useAuth } from "../auth/AuthProvider";
import { UnsavedChanges } from "../issues/UnsavedChanges";
import "./admin.css";
import { Avatar } from "../../components/Avatar";
import { IconArrowLeft, IconKey } from "../../components/Icons";

function Comparison({
  latest,
  name,
  role,
  active,
}: {
  latest: UserAdmin;
  name: string;
  role: UserRole;
  active: boolean;
}) {
  return (
    <div className="admin-table-wrap admin-comparison">
      <table className="admin-table">
        <caption>Confronto della bozza con i dati correnti</caption>
        <thead>
          <tr>
            <th scope="col">Campo</th>
            <th scope="col">La tua bozza</th>
            <th scope="col">Valore attuale</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Nome</th>
            <td data-label="La tua bozza">{name}</td>
            <td data-label="Valore attuale">{latest.displayName}</td>
          </tr>
          <tr>
            <th scope="row">Ruolo</th>
            <td data-label="La tua bozza">{roleNames[role]}</td>
            <td data-label="Valore attuale">{roleNames[latest.role]}</td>
          </tr>
          <tr>
            <th scope="row">Stato</th>
            <td data-label="La tua bozza">{active ? "Attivo" : "Inattivo"}</td>
            <td data-label="Valore attuale">{latest.active ? "Attivo" : "Inattivo"}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
function Editor({ initial }: { initial: UserAdmin }) {
  const auth = useAuth(),
    cache = useQueryClient(),
    location = useLocation();
  const [base, setBase] = useState(initial),
    [name, setName] = useState(initial.displayName),
    [role, setRole] = useState(initial.role),
    [active, setActive] = useState(initial.active);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null),
    [fields, setFields] = useState<Record<string, string>>({}),
    [success, setSuccess] = useState(
      location.state?.created
        ? "Utente creato. Il cambio password è richiesto al primo accesso."
        : "",
    );
  const [confirm, setConfirm] = useState(false),
    [conflict, setConflict] = useState(false),
    [latest, setLatest] = useState<UserAdmin | null>(null),
    [conflictError, setConflictError] = useState<unknown>(null),
    [loadingLatest, setLoadingLatest] = useState(false);
  const [resetOpen, setResetOpen] = useState(false),
    [temporary, setTemporary] = useState(""),
    [resetError, setResetError] = useState<unknown>(null),
    [resetField, setResetField] = useState<string | undefined>(),
    [resetLatest, setResetLatest] = useState<UserAdmin | null>(null),
    [resetConflicted, setResetConflicted] = useState(false),
    [blocked, setBlocked] = useState(false),
    [signedOut, setSignedOut] = useState(false);
  const own = auth.user?.id === base.id,
    dirty =
      name !== base.displayName || role !== base.role || active !== base.active;
  async function loadLatest(forReset = false) {
    setLoadingLatest(true);
    setConflictError(null);
    try {
      const fresh = await userApi.get(base.id);
      if (forReset) setResetLatest(fresh);
      else setLatest(fresh);
    } catch (failure) {
      setConflictError(failure);
    } finally {
      setLoadingLatest(false);
    }
  }
  function adopt(fresh: UserAdmin, discard: boolean) {
    setBase(fresh);
    cache.setQueryData(["admin-user", fresh.id], fresh);
    if (discard) {
      setName(fresh.displayName);
      setRole(fresh.role);
      setActive(fresh.active);
    }
    setConflict(false);
    setLatest(null);
    setError(null);
    setSuccess(
      discard
        ? "Dati correnti caricati. La bozza precedente è stata scartata."
        : "Bozza conservata. Controlla i campi e conferma di nuovo il salvataggio.",
    );
  }
  async function save() {
    if (busy || blocked) return;
    setBusy(true);
    setError(null);
    setSuccess("");
    setConfirm(false);
    try {
      const updated = await userApi.update(base.id, {
        displayName: name.normalize("NFC").trim(),
        role,
        active,
        expectedVersion: base.version,
      });
      adopt(updated, true);
      setSuccess("Modifiche salvate.");
      await cache.invalidateQueries({ queryKey: ["admin-users"] });
      await cache.invalidateQueries({ queryKey: ["users", "directory"] });
      await cache.invalidateQueries({ queryKey: ["issues", "suggestions"] });
      await cache.invalidateQueries({ queryKey: ["reporting"] });
      if (own && (updated.role !== auth.user?.role || !updated.active)) {
        auth.clearSession();
        setSignedOut(true);
      } else if (own) auth.updateUser(updated);
    } catch (failure) {
      setError(failure);
      setFields(fieldErrors(failure));
      if (failure instanceof ApiError && failure.code === "VERSION_CONFLICT") {
        setConflict(true);
        await loadLatest();
      }
    } finally {
      setBusy(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || blocked || !dirty) return;
    const invalid = normalizedName(name, 2, 80);
    setFields(invalid ? { displayName: invalid } : {});
    if (invalid) return;
    if (role !== base.role || active !== base.active) setConfirm(true);
    else void save();
  }
  async function reset(event: FormEvent) {
    event.preventDefault();
    if (busy || resetConflicted) return;
    const invalid = passwordError(temporary);
    setResetField(invalid ?? undefined);
    if (invalid) return;
    setBusy(true);
    setResetError(null);
    setSuccess("");
    try {
      await userApi.reset(base.id, temporary, base.version);
      setTemporary("");
      setResetOpen(false);
      setSuccess(
        "Password temporanea impostata. Le sessioni dell'utente sono terminate.",
      );
      try {
        const fresh = await userApi.get(base.id);
        adopt(fresh, true);
        setSuccess(
          "Password temporanea impostata. Il cambio è richiesto al prossimo accesso.",
        );
        await cache.invalidateQueries({ queryKey: ["admin-users"] });
        await cache.invalidateQueries({ queryKey: ["issues", "suggestions"] });
        await cache.invalidateQueries({ queryKey: ["reporting"] });
      } catch (failure) {
        setBlocked(true);
        setError(failure);
        setSuccess(
          "Password temporanea impostata. Non è stato possibile aggiornare i dati dell'account.",
        );
      }
    } catch (failure) {
      setResetError(failure);
      setResetField(fieldErrors(failure).temporaryPassword);
      if (failure instanceof ApiError && failure.code === "VERSION_CONFLICT") {
        setResetConflicted(true);
        await loadLatest(true);
      }
    } finally {
      setBusy(false);
    }
  }
  async function recover() {
    setBusy(true);
    setError(null);
    try {
      adopt(await userApi.get(base.id), true);
      setBlocked(false);
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }
  if (signedOut) return <Navigate to="/login" replace />;
  return (
    <>
      <UnsavedChanges dirty={dirty && !signedOut} />
      <div className="admin-form">
        <header className="admin-account-heading">
          <h1 tabIndex={-1}>{base.displayName}</h1>
        </header>
        {success && <Alert variant="success">{success}</Alert>}
        <ErrorAlert error={error} focus />
        {error instanceof ApiError &&
          error.code === "OPEN_ASSIGNMENTS_EXIST" && (
            <p>
              <Link
                to={`/issues?assignedTo=${base.id}&status=TODO&status=IN_PROGRESS`}
              >
                Apri le issue assegnate per riassegnarle
              </Link>
            </p>
          )}
        {blocked && (
          <Alert variant="warning">
            Ricarica i dati prima di effettuare altre modifiche.{" "}
            <Button busy={busy} onClick={() => void recover()}>
              Ricarica account
            </Button>
          </Alert>
        )}
        <div className="managed-identity"><Avatar name={base.displayName} id={base.id} /><div><strong>{base.email}</strong><p className="muted">Creato il {dateTime(base.createdAt)} · {base.mustChangePassword ? "Cambio password richiesto" : "Password impostata"}</p></div></div>
        <form className="admin-editor-form" onSubmit={submit} noValidate>
          {Object.keys(fields).length > 0 && (
            <Alert focus focusKey={fields}>
              <a href="#edit-user-name">
                {fields.displayName ?? "Controlla i campi indicati."}
              </a>
            </Alert>
          )}
          <fieldset disabled={busy || blocked}>
            <section className="admin-settings-section"><div><h2>Account</h2><p>Il ruolo determina le azioni disponibili nel progetto.</p></div><div className="admin-field-stack">
            <div className="admin-full-field">
              <TextField
                id="edit-user-name"
                label="Nome"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                error={fields.displayName}
              />
            </div>
            <SelectField
              label="Ruolo"
              required
              value={role}
              onChange={(event) => setRole(event.target.value as UserRole)}
              hint={roleDescriptions[role]}
            >
              {Object.entries(roleNames).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </SelectField>
            <label className="admin-checkbox admin-account-active">
              <input
                type="checkbox"
                checked={active}
                onChange={(event) => setActive(event.target.checked)}
              />
              Account attivo
            </label>
            </div></section>
            <div className="actions admin-form-actions">
              <Button
                variant="primary"
                type="submit"
                busy={busy}
                disabled={!dirty}
              >
                Salva modifiche
              </Button>
              <Link className="button" to="/admin/users">
                Annulla
              </Link>
            </div>
          </fieldset>
        </form>
        <section className="admin-settings-section"><div><h2>Password</h2><p>{own ? "Gestisci la tua password dal profilo." : "Imposta una password temporanea e richiedi un nuovo cambio al prossimo accesso."}</p></div><div>
          {own ? (
            <p>
              Per la tua password usa il{" "}
              <Link to="/profile">cambio password nel profilo</Link>.
            </p>
          ) : (
            <>
              <Button
                disabled={busy || blocked || dirty}
                onClick={() => {
                  setResetOpen(true);
                  setResetError(null);
                  setResetField(undefined);
                  setResetLatest(null);
                  setResetConflicted(false);
                }}
              >
                <IconKey size={20} stroke={2} aria-hidden="true" />
                Imposta password temporanea
              </Button>
              {dirty && (
                <p className="muted">
                  Salva o annulla prima le modifiche dell'account.
                </p>
              )}
            </>
          )}
        </div></section>
      </div>
      <Dialog
        className="admin-compact-dialog"
        open={confirm}
        title="Conferma modifica dell'accesso"
        sensitive
        busy={busy}
        onClose={() => setConfirm(false)}
        footer={
          <>
            <Button data-cancel onClick={() => setConfirm(false)}>
              Annulla
            </Button>
            <Button variant={active ? "primary" : "danger"} busy={busy} onClick={() => void save()}>
              Conferma e salva
            </Button>
          </>
        }
      >
        <dl className="admin-access-comparison">
          <div><dt>Ruolo attuale</dt><dd>{roleNames[base.role]}</dd></div>
          <div><dt>Nuovo ruolo</dt><dd>{roleNames[role]}</dd></div>
          <div><dt>Stato attuale</dt><dd>{base.active ? "Attivo" : "Inattivo"}</dd></div>
          <div><dt>Nuovo stato</dt><dd>{active ? "Attivo" : "Inattivo"}</dd></div>
        </dl>
        <p>
          La modifica di ruolo o stato terminerà tutte le sessioni di{" "}
          {base.displayName}.{own && " Dovrai accedere di nuovo."}
        </p>
      </Dialog>
      <Dialog
        className="admin-conflict-dialog"
        open={conflict}
        title="Account aggiornato da un altro utente"
        sensitive
        busy={loadingLatest}
        onClose={() => setConflict(false)}
        footer={
          <>
            <Button data-cancel onClick={() => setConflict(false)}>
              Torna alla bozza
            </Button>
            {latest && (
              <>
                <Button onClick={() => adopt(latest, false)}>
                  Mantieni la bozza e usa la versione corrente
                </Button>
                <Button variant="danger" onClick={() => adopt(latest, true)}>
                  Scarta la bozza e carica i dati correnti
                </Button>
              </>
            )}
          </>
        }
      >
        <p>Nessuna delle tue modifiche è stata salvata.</p>
        <ErrorAlert error={conflictError} />
        {loadingLatest ? (
          <LoadingState label="Caricamento account corrente…" />
        ) : latest ? (
          <Comparison latest={latest} name={name} role={role} active={active} />
        ) : (
          <Button onClick={() => void loadLatest()}>Riprova caricamento</Button>
        )}
        <p>Dopo il confronto il salvataggio richiede una nuova conferma.</p>
      </Dialog>
      <Dialog
        className="admin-compact-dialog"
        open={resetOpen}
        title={`Password temporanea per ${base.displayName}`}
        sensitive
        busy={busy}
        onClose={() => {
          setResetOpen(false);
          setTemporary("");
          setResetLatest(null);
        }}
      >
        <form onSubmit={(event) => void reset(event)} noValidate>
          <p>
            Le sessioni dell'utente saranno terminate. Comunica la password
            tramite un canale privato.
          </p>
          <ErrorAlert error={resetError} focus />
          {resetField && !resetError && (
            <Alert focus focusKey={resetField}>
              <a href="#reset-temporary-password">{resetField}</a>
            </Alert>
          )}
          <ErrorAlert error={conflictError} />
          {resetConflicted && !resetLatest && !loadingLatest && (
            <Alert variant="warning">
              Ricarica l'account per confrontare i dati prima di confermare il
              reset.{" "}
              <Button onClick={() => void loadLatest(true)}>
                Riprova caricamento account
              </Button>
            </Alert>
          )}
          {loadingLatest && (
            <LoadingState label="Caricamento account corrente…" />
          )}
          <PasswordField
            id="reset-temporary-password"
            label="Password temporanea"
            required
            autoComplete="new-password"
            value={temporary}
            onChange={(event) => setTemporary(event.target.value)}
            error={resetField}
            hint="12–128 caratteri, massimo 512 byte UTF-8."
            disabled={busy}
          />
          {resetLatest && (
            <Alert variant="warning">
              L'account è stato aggiornato. La password digitata è conservata.
              Stato corrente: {resetLatest.active ? "attivo" : "inattivo"},
              ruolo {roleNames[resetLatest.role]}.
              <Button
                onClick={() => {
                  setBase(resetLatest);
                  setName(resetLatest.displayName);
                  setRole(resetLatest.role);
                  setActive(resetLatest.active);
                  setResetLatest(null);
                  setResetError(null);
                  setResetConflicted(false);
                }}
              >
                Usa la versione corrente e conferma di nuovo
              </Button>
            </Alert>
          )}
          <div className="actions">
            <Button
              data-cancel
              disabled={busy}
              onClick={() => {
                setResetOpen(false);
                setTemporary("");
              }}
            >
              Annulla
            </Button>
            <Button
              variant="primary"
              type="submit"
              busy={busy}
              disabled={resetConflicted}
            >
              Conferma password temporanea
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
export function UserEditPage() {
  const { userId = "" } = useParams();
  const valid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      userId,
    );
  const account = useQuery({
    queryKey: ["admin-user", userId],
    queryFn: ({ signal }) => userApi.get(userId, signal),
    enabled: valid,
  });
  return (
    <section>
      <Link className="admin-back" to="/admin/users"><IconArrowLeft size={20} stroke={2} aria-hidden="true" />Team</Link>
      {!valid ? (
        <>
          <h1 tabIndex={-1}>Utente non trovato</h1>
          <p>L'identificativo richiesto non è valido.</p>
        </>
      ) : account.isPending ? (
        <>
          <h1 tabIndex={-1}>Gestisci utente</h1>
          <LoadingState />
        </>
      ) : account.error ? (
        <>
          <h1 tabIndex={-1}>
            {account.error instanceof ApiError && account.error.status === 404
              ? "Utente non trovato"
              : "Gestisci utente"}
          </h1>
          <ErrorAlert error={account.error} />
          <Button onClick={() => void account.refetch()}>Riprova</Button>
        </>
      ) : (
        account.data && <Editor key={userId} initial={account.data} />
      )}
    </section>
  );
}
