import { useEffect, useRef, useState } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError, NetworkError } from "../api/ApiClient";
import { useAuth } from "../features/auth/AuthProvider";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { ErrorAlert } from "./Alert";
import { Avatar } from "./Avatar";
import { BrandMark } from "./BrandMark";
import { roleNames } from "../features/users/adminPresentation";

import {
  IconArchive,
  IconBell,
  IconChartBar,
  IconListDetails,
  IconLogout,
  IconMenu2,
  IconTag,

  IconUsers,
} from "./Icons";
export function AppShell() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawer, setDrawer] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const notificationFailures = useRef(0);
  const unread = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: async ({ signal }) => {
      try {
        const count = await api.get<{ count: number }>(
          "/notifications/unread-count",
          { signal },
        );
        notificationFailures.current = 0;
        return count;
      } catch (problem) {
        notificationFailures.current =
          problem instanceof NetworkError ||
          (problem instanceof ApiError && problem.status === 503)
            ? Math.min(3, notificationFailures.current + 1)
            : 0;
        throw problem;
      }
    },
    refetchInterval: () =>
      30_000 * 2 ** Math.max(0, notificationFailures.current - 1),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
  useEffect(() => {
    setDrawer(false);
  }, [location.pathname, location.search]);
  const notifications = <NavLink className="desktop-notifications" to="/notifications"><IconBell />Notifiche{unread.data && unread.data.count > 0 && <span className="count-badge">{unread.data.count}</span>}</NavLink>;
  const navigation = <>
    <NavLink to="/issues"><IconListDetails />Issue</NavLink>
    <NavLink to="/archive"><IconArchive />Archivio</NavLink>
    {notifications}
    {auth.user?.role === "ADMIN" && <>
      <hr className="nav-divider" />
      <Link to="/admin/dashboard" className={/^\/admin\/(dashboard|reports)/.test(location.pathname) ? "active" : undefined} aria-current={/^\/admin\/(dashboard|reports)/.test(location.pathname) ? "page" : undefined}><IconChartBar />Analisi</Link>
      <NavLink to="/admin/users"><IconUsers />Team</NavLink>
      <NavLink to="/admin/labels"><IconTag />Etichette</NavLink>
    </>}
  </>;
  async function logout() {
    if (logoutBusy) return;
    setLogoutBusy(true);
    setError(null);
    try {
      await auth.logout();
      navigate("/login", { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setLogoutBusy(false);
    }
  }
  const account = auth.user && <div className="sidebar-account">
    <Link to="/profile" className="account-link" aria-label="Il tuo profilo" title={`${auth.user.displayName} · ${roleNames[auth.user.role]}`}>
      <Avatar name={auth.user.displayName} id={auth.user.id} size={28} />
      <span className="sr-only">{auth.user.displayName} · {roleNames[auth.user.role]}</span>
    </Link>
    <Button className="sidebar-logout" busy={logoutBusy} onClick={() => void logout()} aria-label="Esci" title="Esci"><IconLogout /></Button>
  </div>;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Salta al contenuto
      </a>
      <header className="app-header">
        <Button
          className="drawer-toggle"
          onClick={() => setDrawer(true)}
          aria-expanded={drawer}
          aria-label="Menu"
        >
          <IconMenu2 size={20} stroke={2} aria-hidden="true" />
        </Button>
        <Link className="workspace-label" to="/issues"><BrandMark />BugBoard26</Link>
        <Link
          className="notifications-link"
          to="/notifications"
          aria-label={
            unread.data
              ? `Notifiche, ${unread.data.count} non lette`
              : "Notifiche"
          }
        >
          <IconBell size={24} stroke={2} aria-hidden="true" />

          {unread.data && unread.data.count > 0 && (
            <span className="count-badge">{unread.data.count}</span>
          )}
        </Link>
      </header>
      <aside className="sidebar">
        <Link className="brand sidebar-brand" to="/issues">
          <BrandMark />
          BugBoard26
        </Link>
        <nav aria-label="Navigazione principale">{navigation}</nav>
        {account}
      </aside>
      <main id="main-content" className={`main-content${["/issues", "/archive"].includes(location.pathname) ? " wide" : ""}`}>
        <ErrorAlert error={error} />
        {auth.user?.role === "VIEWER" && (
          <p className="readonly-banner">
            Sola lettura: puoi consultare le issue ed esportare l'elenco.
          </p>
        )}
        <Outlet />
      </main>
      <Dialog
        open={drawer}
        title="Navigazione"
        onClose={() => setDrawer(false)}
        className="navigation-drawer"
      >
        <nav aria-label="Navigazione mobile">{navigation}</nav>
        {account}
      </Dialog>
    </div>
  );
}
