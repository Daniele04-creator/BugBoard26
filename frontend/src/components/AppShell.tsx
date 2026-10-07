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
import { roleNames } from "../features/users/adminPresentation";
import mark from "../assets/brand/bugboard-mark.png";
import {
  IconArchive,
  IconBell,
  IconChartBar,
  IconChevronRight,
  IconFileText,
  IconListDetails,
  IconLogout,
  IconMenu2,
  IconTag,
  IconUser,
  IconUsers,
} from "@tabler/icons-react";
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
  const myIssues =
    location.pathname === "/issues" &&
    new URLSearchParams(location.search).get("assignedTo") === "me";
  const navigation = (
    <>
      <div className="nav-heading">Lavoro</div>
      <Link
        to="/issues"
        className={
          location.pathname.startsWith("/issues") && !myIssues
            ? "active"
            : undefined
        }
        aria-current={
          location.pathname.startsWith("/issues") && !myIssues
            ? "page"
            : undefined
        }
      >
        <IconListDetails size={24} stroke={2} aria-hidden="true" />
        Issue
      </Link>
      {auth.user?.role !== "VIEWER" && (
        <Link
          to="/issues?assignedTo=me"
          className={myIssues ? "active" : undefined}
          aria-current={myIssues ? "page" : undefined}
        >
          <IconUser size={24} stroke={2} aria-hidden="true" />
          Assegnate a me
        </Link>
      )}
      <NavLink to="/archive">
        <IconArchive size={24} stroke={2} aria-hidden="true" />
        Archivio
      </NavLink>
      {auth.user?.role === "ADMIN" && (
        <>
          <div className="nav-heading">Amministrazione</div>
          <NavLink to="/admin/dashboard">
            <IconChartBar size={24} stroke={2} aria-hidden="true" />
            Dashboard
          </NavLink>
          <NavLink to="/admin/users">
            <IconUsers size={24} stroke={2} aria-hidden="true" />
            Utenti
          </NavLink>
          <NavLink to="/admin/labels">
            <IconTag size={24} stroke={2} aria-hidden="true" />
            Etichette
          </NavLink>
          <NavLink to="/admin/reports">
            <IconFileText size={24} stroke={2} aria-hidden="true" />
            Report
          </NavLink>
        </>
      )}
    </>
  );
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
  const account = auth.user && (
    <div className="sidebar-account">
      <Link to="/profile" className="account-link" aria-label="Il tuo profilo">
        <Avatar name={auth.user.displayName} id={auth.user.id} size={36} />
        <span className="account-identity">
          <span className="account-name">{auth.user.displayName}</span>
          <span className="account-role">{roleNames[auth.user.role]}</span>
        </span>
        <IconChevronRight size={20} stroke={2} aria-hidden="true" />
      </Link>
      <Button
        className="sidebar-logout"
        busy={logoutBusy}
        onClick={() => void logout()}
      >
        <IconLogout size={24} stroke={2} aria-hidden="true" />
        Esci
      </Button>
    </div>
  );
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
        <Link className="brand mobile-brand" to="/issues">
          <img src={mark} width={28} height={28} alt="" />
          BugBoard26
        </Link>
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
          <span className="notifications-text">Notifiche</span>
          {unread.data && unread.data.count > 0 && (
            <span className="count-badge">{unread.data.count}</span>
          )}
        </Link>
      </header>
      <aside className="sidebar">
        <Link className="brand sidebar-brand" to="/issues">
          <img src={mark} width={32} height={32} alt="" />
          BugBoard26
        </Link>
        <nav aria-label="Navigazione principale">{navigation}</nav>
        {account}
      </aside>
      <main id="main-content" className="main-content">
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
