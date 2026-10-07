import { useState } from "react";
import type { FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { authApi } from "./authApi";
import { PasswordField } from "./PasswordField";
import { Button } from "../../components/Button";
import { Alert, ErrorAlert } from "../../components/Alert";
import { LoadingState } from "../../components/LoadingState";
import { ApiError } from "../../api/ApiClient";
import { AuthLayout } from "../../components/AuthLayout";
import "./auth.css";
export function validatePassword(
  password: string,
  confirmation: string,
  current: string,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const length = Array.from(password).length;
  if (
    length < 12 ||
    length > 128 ||
    new TextEncoder().encode(password).byteLength > 512
  )
    errors.newPassword = "Usa da 12 a 128 caratteri, fino a 512 byte.";
  if (password === current)
    errors.newPassword =
      "La nuova password deve essere diversa da quella corrente.";
  if (password !== confirmation)
    errors.confirmation = "Le password non corrispondono.";
  if (!current) errors.currentPassword = "Inserisci la password corrente.";
  return errors;
}
export function PasswordChangeForm({
  mandatory = false,
}: {
  mandatory?: boolean;
}) {
  const auth = useAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const invalid = validatePassword(password, confirmation, current);
    setFields(invalid);
    setError(null);
    if (Object.keys(invalid).length) return;
    setBusy(true);
    try {
      await authApi.password(current, password);
      setCurrent("");
      setPassword("");
      setConfirmation("");
      auth.clearSession("password-changed");
      navigate("/login", { replace: true, state: { passwordChanged: true } });
    } catch (err) {
      setError(err);
      if (err instanceof ApiError)
        setFields(
          Object.fromEntries(
            err.problem.fieldErrors.map((field) => [
              field.field,
              field.message,
            ]),
          ),
        );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className={`password-change-form${mandatory ? " password-change-mandatory" : ""}`} onSubmit={(e) => void submit(e)}>
      <p className="muted">* Campo obbligatorio.</p>
      {Object.keys(fields).length > 0 && (
        <Alert focus focusKey={fields}>
          Controlla i campi indicati.
        </Alert>
      )}
      <ErrorAlert error={error} focus />
      <PasswordField
        label="Password corrente"
        autoComplete="current-password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        error={fields.currentPassword}
        required
      />
      <PasswordField
        label="Nuova password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={fields.newPassword}
        hint="12–128 caratteri. La password non viene troncata."
        required
      />
      <PasswordField
        label="Conferma nuova password"
        autoComplete="new-password"
        value={confirmation}
        onChange={(e) => setConfirmation(e.target.value)}
        error={fields.confirmation}
        required
      />
      <Alert variant="info">
        Il cambio password chiude tutte le tue sessioni. Dovrai accedere di
        nuovo.
      </Alert>
      <div className="actions">
        <Button type="submit" variant="primary" busy={busy}>
          Salva password
        </Button>
        {mandatory && (
          <Button
            disabled={busy}
            onClick={() =>
              void auth
                .logout()
                .then(() => navigate("/login", { replace: true }))
                .catch(setError)
            }
          >
            Esci
          </Button>
        )}
      </div>
    </form>
  );
}
export function ChangePasswordPage() {
  const auth = useAuth();
  if (auth.loading) return <LoadingState />;
  if (!auth.user) return <Navigate to="/login" replace />;
  if (!auth.user.mustChangePassword) return <Navigate to="/profile" replace />;
  return (
    <AuthLayout>
      <h1 tabIndex={-1}>Cambia la password iniziale</h1>
      <p>Per accedere alle issue scegli una nuova password.</p>
      <PasswordChangeForm mandatory />
    </AuthLayout>
  );
}
