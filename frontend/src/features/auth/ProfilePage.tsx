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
import { Avatar } from "../../components/Avatar";
import { roleNames } from "../users/adminPresentation";
import "./auth.css";
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
    if (busy || !dirty || !auth.user) return;
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
          auth.updateUser(next);
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
    <section className="profile-page">
      <header className="profile-heading">
        <h1 tabIndex={-1}>Il tuo profilo</h1>
      </header>
      {auth.user && <div className="profile-identity">
        <Avatar name={auth.user.displayName} id={auth.user.id} size={42} />
        <strong>{auth.user.displayName}</strong>
      </div>}
      <div className="profile-sections">
        <section className="profile-section">
          <div className="profile-section-label">
            <h2>Informazioni personali</h2>
            <p>Il nome viene mostrato nelle issue e nei commenti.</p>
          </div>
          <div className="profile-section-content">
          {saved && <Alert variant="success">Modifiche salvate.</Alert>}
          <ErrorAlert error={error} focus />
          <form className="profile-name-form" onSubmit={(e) => void submit(e)}>
            <TextField
              label="Nome"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                setSaved(false);
              }}
              error={fieldError}
              hint="Da 2 a 80 caratteri."
              required
            />
            <dl className="profile-account-facts">
              <div><dt>Email</dt><dd>{auth.user?.email}</dd></div>
              <div><dt>Ruolo</dt><dd>{auth.user && roleNames[auth.user.role]}</dd></div>
            </dl>
            <Button
              type="submit"
              variant="primary"
              busy={busy}
              disabled={!dirty}
            >
              Salva nome
            </Button>
          </form>
          </div>
        </section>
        <section className="profile-section">
          <div className="profile-section-label">
            <h2>Password</h2>
            <p>Il cambio della password termina tutte le tue sessioni.</p>
          </div>
          <div className="profile-section-content"><PasswordChangeForm /></div>
        </section>
      </div>
      <Dialog
        className="profile-conflict-dialog"
        open={conflict}
        title="Profilo aggiornato da un altro utente"
        onClose={() => setConflict(false)}
      >
        <p>Nessuna delle tue modifiche è stata salvata.</p>
        <dl className="profile-comparison">
          <div><dt>La tua bozza</dt><dd>{displayName}</dd></div>
          <div><dt>Valore attuale</dt><dd>{currentName}</dd></div>
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
