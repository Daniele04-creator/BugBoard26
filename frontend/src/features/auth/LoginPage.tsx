import { useState } from "react";
import type { FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { TextField } from "../../components/TextField";
import { PasswordField } from "./PasswordField";
import { Button } from "../../components/Button";
import { Alert, ErrorAlert } from "../../components/Alert";
import { ApiError } from "../../api/ApiClient";
import { LoadingState } from "../../components/LoadingState";
import { AuthLayout } from "../../components/AuthLayout";
import "./auth.css";
export function safeReturnTo(value: unknown, role: string): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    Array.from(value).some((char) => char.codePointAt(0)! < 32)
  )
    return "/issues";
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return "/issues";
  }
  if (
    decoded.startsWith("//") ||
    decoded.includes("\\") ||
    Array.from(decoded).some((char) => char.codePointAt(0)! < 32)
  )
    return "/issues";
  const url = new URL(value, "https://bugboard.invalid");
  if (url.pathname.includes("%")) return "/issues";
  const path = url.pathname;
  const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
  const ordinary = new RegExp(
    `^/(issues(?:/${uuid})?|archive|notifications|profile)$`,
  );
  const editing = new RegExp(`^/issues/(new|${uuid}/edit)$`);
  const administration = new RegExp(
    `^/admin/(dashboard|labels|reports|users(?:/(new|${uuid}/edit))?)$`,
  );
  if (
    !ordinary.test(path) &&
    !(role !== "VIEWER" && editing.test(path)) &&
    !(role === "ADMIN" && administration.test(path))
  )
    return "/issues";
  return path + url.search + url.hash;
}
export function LoginPage() {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [retryAt, setRetryAt] = useState(0);
  const [remaining, setRemaining] = useState(0);
  if (auth.loading) return <LoadingState />;
  if (auth.user)
    return (
      <Navigate
        to={
          auth.user.mustChangePassword
            ? "/change-password"
            : safeReturnTo(
              (
                location.state as {
                  returnTo?: unknown;
                } | null
              )?.returnTo,
              auth.user.role,
            )
        }
        replace
      />
    );
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || Date.now() < retryAt) return;
    setBusy(true);
    setError(null);
    try {
      const user = await auth.login(email, password);
      setPassword("");
      navigate(
        user.mustChangePassword
          ? "/change-password"
          : safeReturnTo(
            (
              location.state as {
                returnTo?: unknown;
              } | null
            )?.returnTo,
            user.role,
          ),
        { replace: true },
      );
    } catch (e) {
      setError(e);
      if (e instanceof ApiError && e.status === 429) {
        const delay = e.retryAfter ?? 60;
        setRetryAt(Date.now() + delay * 1000);
        setRemaining(delay);
        setTimeout(() => {
          setRetryAt(0);
          setRemaining(0);
        }, delay * 1000);
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthLayout>
      <h1 tabIndex={-1}>Accedi</h1>
      {auth.sessionExpired && (
        <Alert variant="warning">
          La sessione è terminata. Accedi di nuovo.
        </Alert>
      )}
      {(auth.passwordChanged ||
        (
          location.state as {
            passwordChanged?: boolean;
          } | null
        )?.passwordChanged) && (
          <Alert variant="success">
            Password modificata. Accedi con la nuova password.
          </Alert>
        )}
      <ErrorAlert error={error} focus />
      {remaining > 0 && (
        <p>Troppi tentativi. Riprova tra {remaining} secondi.</p>
      )}
      <form className="auth-form" onSubmit={(e) => void submit(e)}>
        <TextField
          label="Email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <PasswordField
          label="Password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <Button
          type="submit"
          variant="primary"
          busy={busy}
          disabled={retryAt > 0}
        >
          Accedi
        </Button>
      </form>
    </AuthLayout>
  );
}
