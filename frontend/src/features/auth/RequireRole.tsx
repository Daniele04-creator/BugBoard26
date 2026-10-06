import { Link, Outlet } from "react-router-dom";
import type { UserRole } from "../../api/types";
import { useAuth } from "./AuthProvider";
export function RequireRole({ roles }: { roles: UserRole[] }) {
  const { user } = useAuth();
  return user && roles.includes(user.role) ? (
    <Outlet />
  ) : (
    <section>
      <h1 tabIndex={-1}>Accesso non consentito</h1>
      <p>Non hai i permessi per questa operazione.</p>
      <Link to="/issues">Torna alle issue</Link>
    </section>
  );
}
