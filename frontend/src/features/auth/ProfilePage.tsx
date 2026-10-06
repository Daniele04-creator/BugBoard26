import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "./AuthProvider";
import { authApi } from "./authApi";
import { PasswordChangeForm } from "./ChangePasswordPage";
import { TextField } from "../../components/TextField";
import { Button } from "../../components/Button";
import { Alert, ErrorAlert } from "../../components/Alert";
import { ApiError } from "../../api/ApiClient";
import { Dialog } from "../../components/Dialog";
export function ProfilePage() {
  const auth = useAuth();
  const [displayName, setDisplayName] = useState(
    () =>
      auth.getDraft<{ displayName: string }>("profile")?.displayName ??
      auth.user?.displayName ??
      "",
  );
  const [version, setVersion] = useState(
    () =>
      auth.getDraft<{ version: number }>("profile")?.version ??
      auth.user?.version ??
      0,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [fieldError, setFieldError] = useState("");
  const [saved, setSaved] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [currentName, setCurrentName] = useState("");
  const [newVersion, setNewVersion] = useState(0);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const dirty = displayName.normalize("NFC").trim() !== auth.user?.displayName;
  useEffect(() => {
    if (dirty) auth.setDraft("profile", { displayName, version });
    else auth.removeDraft("profile");
  }, [displayName, version, dirty, auth]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !auth.user) return;
    setError(null);
    setSaved(false);
    const normalized = displayName.normalize("NFC").trim();
    if (
      Array.from(normalized).length < 2 ||
      Array.from(normalized).length > 80
    ) {
      setFieldError("Il nome deve contenere da 2 a 80 caratteri.");
      return;
    }
    setFieldError("");
    setBusy(true);
    try {
      const next = await authApi.profile(normalized, version);
      auth.updateUser(next);
      setDisplayName(next.displayName);
      setVersion(next.version);
      setSaved(true);
    } catch (err) {
      setError(err);
      if (err instanceof ApiError && err.code === "VERSION_CONFLICT") {
        try {
          const next = await authApi.me();
          setCurrentName(next.displayName);
          setNewVersion(next.version);
          setConflict(true);
        } catch (readError) {
          setError(readError);
        }
      } else if (err instanceof ApiError)
        setFieldError(
          err.problem.fieldErrors.find((field) => field.field === "displayName")
            ?.message ?? "",
        );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="form-layout">
      <h1 tabIndex={-1}>Il tuo profilo</h1>
      <p>
        {auth.user?.email} · {auth.user?.role}
      </p>
      <section className="panel">
        <h2>Nome visualizzato</h2>
        {saved && <Alert variant="success">Modifiche salvate.</Alert>}
        <ErrorAlert error={error} focus />
        <form onSubmit={(e) => void submit(e)}>
          <p className="muted">* Campo obbligatorio.</p>
          <TextField
            label="Nome"
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              setSaved(false);
            }}
            error={fieldError}
            required
          />
          <Button
            type="submit"
            variant="primary"
            busy={busy}
            disabled={
              displayName.normalize("NFC").trim() === auth.user?.displayName
            }
          >
            Salva nome
          </Button>
        </form>
      </section>
      <section className="panel">
        <h2>Cambia password</h2>
        <PasswordChangeForm />
      </section>
      <Dialog
        open={conflict}
        title="Profilo aggiornato da un altro utente"
        onClose={() => setConflict(false)}
      >
        <p>Nessuna delle tue modifiche è stata salvata.</p>
        <dl>
          <dt>La tua bozza</dt>
          <dd>{displayName}</dd>
          <dt>Valore attuale</dt>
          <dd>{currentName}</dd>
        </dl>
        <p>Puoi mantenere la bozza e confermare nuovamente il salvataggio.</p>
        {confirmDiscard ? (
          <>
            <p>Scartare la bozza e caricare il nome corrente?</p>
            <div className="actions">
              <Button data-cancel onClick={() => setConfirmDiscard(false)}>
                Annulla
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  setDisplayName(currentName);
                  setVersion(newVersion);
                  setConflict(false);
                  setConfirmDiscard(false);
                  setError(null);
                }}
              >
                Scarta bozza
              </Button>
            </div>
          </>
        ) : (
          <div className="actions">
            <Button
              onClick={() => {
                setVersion(newVersion);
                setConflict(false);
                setError(null);
              }}
            >
              Torna alla bozza
            </Button>
            <Button onClick={() => setConfirmDiscard(true)}>
              Carica dati correnti
            </Button>
          </div>
        )}
      </Dialog>
    </section>
  );
}
