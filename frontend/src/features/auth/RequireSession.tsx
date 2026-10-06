import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { LoadingState } from "../../components/LoadingState";
import { ErrorAlert } from "../../components/Alert";
import { Button } from "../../components/Button";
export function RequireSession() {
  const auth = useAuth();
  const location = useLocation();
  if (auth.loading) return <LoadingState />;
  if (auth.error && !auth.user)
    return (
      <main className="auth-layout">
        <h1 tabIndex={-1}>Accesso al progetto</h1>
        <ErrorAlert error={auth.error} />
        <Button onClick={() => void auth.refresh()}>Riprova</Button>
      </main>
    );
  if (!auth.user)
    return (
      <Navigate
        to="/login"
        replace
        state={{ returnTo: location.pathname + location.search }}
      />
    );
  if (auth.user.mustChangePassword)
    return <Navigate to="/change-password" replace />;
  return <Outlet />;
}
