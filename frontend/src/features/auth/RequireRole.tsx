import { Link, Outlet } from "react-router-dom";
import type { UserRole } from "../../api/types";
import { useAuth } from "./AuthProvider";
import { IconLock } from "@tabler/icons-react";
export function RequireRole({ roles }: { roles: UserRole[] }) {
  const { user } = useAuth();
  return user && roles.includes(user.role) ? (
    <Outlet />
  ) : (
    <section className="route-error">
      <IconLock size={48} stroke={2} aria-hidden="true" />
      <h1 tabIndex={-1}>Accesso non consentito</h1>
      <p>Non hai i permessi per questa operazione.</p>
      <Link className="button button-primary" to="/issues">Torna alle issue</Link>
    </section>
  );
}
