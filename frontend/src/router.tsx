import {
  createBrowserRouter,
  Link,
  Navigate,
  Outlet,
  useLocation,
} from "react-router-dom";
import { useEffect } from "react";
import { IconFileSearch } from "@tabler/icons-react";
import { AppShell } from "./components/AppShell";
import { RequireSession } from "./features/auth/RequireSession";
import { RequireRole } from "./features/auth/RequireRole";
import { LoginPage } from "./features/auth/LoginPage";
import { ChangePasswordPage } from "./features/auth/ChangePasswordPage";
import { ProfilePage } from "./features/auth/ProfilePage";
import { IssueListPage } from "./features/issues/IssueListPage";
import { IssueDetailPage } from "./features/issues/IssueDetailPage";
import { IssueCreatePage } from "./features/issues/IssueCreatePage";
import { IssueEditPage } from "./features/issues/IssueEditPage";
import { ArchivePage } from "./features/issues/ArchivePage";
import { NotificationsPage } from "./features/notifications/NotificationsPage";
import { UsersPage } from "./features/users/UsersPage";
import { UserCreatePage } from "./features/users/UserCreatePage";
import { UserEditPage } from "./features/users/UserEditPage";
import { LabelsPage } from "./features/labels/LabelsPage";
import { DashboardPage } from "./features/reporting/DashboardPage";
import { ReportsPage } from "./features/reporting/ReportsPage";
function RouteFocus() {
  const location = useLocation();
  useEffect(() => {
    const focusTitle = () => {
      const title = document.querySelector<HTMLElement>("h1");
      if (!title) return false;
      title.focus();
      document.title = `${title.textContent ?? "BugBoard26"} — BugBoard26`;
      return true;
    };
    const observer = new MutationObserver(() => {
      if (focusTitle()) observer.disconnect();
    });
    const frame = requestAnimationFrame(() => {
      if (!focusTitle())
        observer.observe(document.getElementById("root") ?? document.body, {
          childList: true,
          subtree: true,
        });
    });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [location.pathname]);
  return <Outlet />;
}
function NotFound() {
  return (
    <section className="route-error">
      <IconFileSearch size={48} stroke={2} aria-hidden="true" />
      <h1 tabIndex={-1}>Pagina non trovata</h1>
      <p>Il percorso richiesto non esiste.</p>
      <Link className="button" to="/issues">
        Torna alle issue
      </Link>
    </section>
  );
}
export const router = createBrowserRouter([
  {
    element: <RouteFocus />,
    children: [
      { path: "/login", element: <LoginPage /> },
      { path: "/change-password", element: <ChangePasswordPage /> },
      {
        element: <RequireSession />,
        children: [
          {
            element: <AppShell />,
            children: [
              { index: true, element: <Navigate to="/issues" replace /> },
              { path: "/issues", element: <IssueListPage /> },
              {
                path: "/issues/:issueId",
                element: <IssueDetailPage />,
              },
              {
                path: "/archive",
                element: <ArchivePage />,
              },
              {
                path: "/notifications",
                element: <NotificationsPage />,
              },
              { path: "/profile", element: <ProfilePage /> },
              {
                element: <RequireRole roles={["ADMIN", "MEMBER"]} />,
                children: [
                  {
                    path: "/issues/new",
                    element: <IssueCreatePage />,
                  },
                  {
                    path: "/issues/:issueId/edit",
                    element: <IssueEditPage />,
                  },
                ],
              },
              {
                element: <RequireRole roles={["ADMIN"]} />,
                children: [
                  {
                    path: "/admin/dashboard",
                    element: <DashboardPage />,
                  },
                  {
                    path: "/admin/users",
                    element: <UsersPage />,
                  },
                  {
                    path: "/admin/users/new",
                    element: <UserCreatePage />,
                  },
                  {
                    path: "/admin/users/:userId/edit",
                    element: <UserEditPage />,
                  },
                  {
                    path: "/admin/labels",
                    element: <LabelsPage />,
                  },
                  {
                    path: "/admin/reports",
                    element: <ReportsPage />,
                  },
                ],
              },
              { path: "*", element: <NotFound /> },
            ],
          },
        ],
      },
    ],
  },
]);
