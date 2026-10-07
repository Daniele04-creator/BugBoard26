import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthProvider";
import { LoginPage, safeReturnTo } from "./LoginPage";
import { RequireSession } from "./RequireSession";
import { RequireRole } from "./RequireRole";
import { authApi } from "./authApi";
import { api, ApiError } from "../../api/ApiClient";
import { ChangePasswordPage, validatePassword } from "./ChangePasswordPage";
import { ProfilePage } from "./ProfilePage";
import { Dialog } from "../../components/Dialog";
import type { Me } from "../../api/types";
import { queryClient } from "../../api/queryClient";
const account: Me = {
  id: "u1",
  email: "person@example.test",
  displayName: "Marta",
  role: "ADMIN",
  active: true,
  mustChangePassword: false,
  version: 0,
};
const anonymous = () =>
  new ApiError({
    type: "urn:test",
    title: "Accesso",
    status: 401,
    detail: "Accedi",
    instance: "/auth/me",
    code: "AUTHENTICATION_REQUIRED",
    requestId: "",
    fieldErrors: [],
  });
describe("identity UI", () => {
  it("keeps profile forms independent and shows the readable role without an editable email", async () => {
    vi.spyOn(authApi, "me").mockResolvedValue(account);
    const nameUpdate = vi.spyOn(authApi, "profile").mockResolvedValue({ ...account, displayName: "Marta Romano", version: 1 });
    const passwordUpdate = vi.spyOn(authApi, "password").mockResolvedValue();
    render(<MemoryRouter><AuthProvider><Routes><Route element={<RequireSession />}><Route path="/" element={<ProfilePage />} /></Route></Routes></AuthProvider></MemoryRouter>);
    const name = await screen.findByLabelText("Nome *");
    await waitFor(() => expect(name).toHaveValue("Marta"));
    expect(screen.getByText(/person@example.test · Amministratore/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Email/)).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Password corrente *"), "Current-Password-2026!");
    await user.type(screen.getByLabelText("Nuova password *"), "Next-Password-2026!");
    await user.clear(name);
    await user.type(name, "Marta Romano");
    await user.click(screen.getByRole("button", { name: "Salva nome" }));
    await screen.findByText("Modifiche salvate.");
    expect(nameUpdate).toHaveBeenCalledWith("Marta Romano", 0);
    expect(passwordUpdate).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Password corrente *")).toHaveValue("Current-Password-2026!");
    expect(screen.getByLabelText("Nuova password *")).toHaveValue("Next-Password-2026!");
  });
  it("compares a profile conflict without discarding the typed name or saving automatically", async () => {
    vi.spyOn(authApi, "me").mockResolvedValueOnce(account).mockResolvedValue({ ...account, displayName: "Nome corrente", version: 2 });
    const update = vi.spyOn(authApi, "profile").mockRejectedValueOnce(new ApiError({
      ...anonymous().problem, status: 409, code: "VERSION_CONFLICT", detail: "Il profilo è cambiato.",
    })).mockResolvedValueOnce({ ...account, displayName: "La mia bozza", version: 3 });
    render(<MemoryRouter><AuthProvider><Routes><Route element={<RequireSession />}><Route path="/" element={<ProfilePage />} /></Route></Routes></AuthProvider></MemoryRouter>);
    const name = await screen.findByLabelText("Nome *");
    await waitFor(() => expect(name).toHaveValue("Marta"));
    const user = userEvent.setup();
    await user.clear(name);
    await user.type(name, "La mia bozza");
    await user.click(screen.getByRole("button", { name: "Salva nome" }));
    const dialog = await screen.findByRole("dialog", { name: "Profilo aggiornato da un altro utente" });
    expect(within(dialog).getByText("La mia bozza")).toBeInTheDocument();
    expect(within(dialog).getByText("Nome corrente")).toBeInTheDocument();
    expect(update).toHaveBeenCalledTimes(1);
    await user.click(within(dialog).getByRole("button", { name: "Torna alla bozza" }));
    expect(name).toHaveValue("La mia bozza");
    await user.click(screen.getByRole("button", { name: "Salva nome" }));
    await screen.findByText("Modifiche salvate.");
    expect(update).toHaveBeenLastCalledWith("La mia bozza", 2);
  });
  it("announces a completed password change even when the session guard redirects to login", async () => {
    vi.spyOn(authApi, "me").mockResolvedValue({
      ...account,
      mustChangePassword: true,
    });
    const change = vi.spyOn(authApi, "password").mockResolvedValue();
    render(
      <MemoryRouter initialEntries={["/change-password"]}>
        <AuthProvider>
          <Routes>
            <Route path="/change-password" element={<ChangePasswordPage />} />
            <Route path="/login" element={<LoginPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    await user.type(
      await screen.findByLabelText("Password corrente *"),
      "Initial-Password-2026!",
    );
    await user.type(
      screen.getByLabelText("Nuova password *"),
      "New-Password-2026!",
    );
    await user.type(
      screen.getByLabelText("Conferma nuova password *"),
      "New-Password-2026!",
    );
    await user.click(screen.getByRole("button", { name: "Salva password" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Password modificata. Accedi con la nuova password.",
    );
    expect(change).toHaveBeenCalledWith(
      "Initial-Password-2026!",
      "New-Password-2026!",
    );
  });
  it("focuses the first field in a regular dialog and prevents Escape while sending", async () => {
    const close = vi.fn();
    const { rerender } = render(
      <Dialog open title="Assegna" onClose={close}>
        <input aria-label="Cerca candidato" />
      </Dialog>,
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Cerca candidato")).toHaveFocus(),
    );
    rerender(
      <Dialog open title="Assegna" onClose={close} busy>
        <input aria-label="Cerca candidato" />
      </Dialog>,
    );
    fireEvent(
      screen.getByRole("dialog"),
      new Event("cancel", { cancelable: true }),
    );
    expect(close).not.toHaveBeenCalled();
    rerender(
      <Dialog open title="Assegna" onClose={close}>
        <input aria-label="Cerca candidato" />
      </Dialog>,
    );
    fireEvent(
      screen.getByRole("dialog"),
      new Event("cancel", { cancelable: true }),
    );
    expect(close).toHaveBeenCalledTimes(1);
  });
  it("keeps a draft for the same account after expiry and removes it on account switch", async () => {
    vi.spyOn(authApi, "me").mockResolvedValue(account);
    vi.spyOn(authApi, "login")
      .mockResolvedValueOnce(account)
      .mockResolvedValueOnce({
        ...account,
        id: "u2",
        displayName: "Altro account",
      });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(anonymous().problem), {
        status: 401,
        headers: { "Content-Type": "application/problem+json" },
      }),
    );
    function DraftProbe() {
      const auth = useAuth();
      return (
        <>
          <p>{auth.user?.displayName ?? "Anonimo"}</p>
          <p>
            {auth.user
              ? (auth.getDraft<string>("draft") ?? "Nessuna bozza")
              : ""}
          </p>
          <button onClick={() => auth.setDraft("draft", "Bozza conservata")}>
            Memorizza
          </button>
          <button
            onClick={() =>
              void api.get("/issues", { retry: false }).catch(() => undefined)
            }
          >
            Scadenza
          </button>
          <button
            onClick={() => void auth.login("account@example.test", "password")}
          >
            Accesso
          </button>
        </>
      );
    }
    render(
      <AuthProvider>
        <DraftProbe />
      </AuthProvider>,
    );
    await screen.findByText("Marta");
    const user = userEvent.setup();
    await user.click(screen.getByText("Memorizza"));
    await user.click(screen.getByText("Scadenza"));
    await screen.findByText("Anonimo");
    expect(screen.queryByText("Bozza conservata")).not.toBeInTheDocument();
    await user.click(screen.getByText("Accesso"));
    await screen.findByText("Marta");
    expect(screen.getByText("Bozza conservata")).toBeInTheDocument();
    await user.click(screen.getByText("Accesso"));
    await screen.findByText("Altro account");
    expect(screen.getByText("Nessuna bozza")).toBeInTheDocument();
  });
  it("blocks external return destinations and disallowed role routes", () => {
    for (const value of [
      "//external.test",
      "https://external.test",
      "/%2fexternal.test",
      "/\\external.test",
      "/login",
      "/unknown",
    ])
      expect(safeReturnTo(value, "ADMIN")).toBe("/issues");
    expect(safeReturnTo("/issues/../admin/users", "MEMBER")).toBe("/issues");
    expect(safeReturnTo("/admin/users", "MEMBER")).toBe("/issues");
    expect(safeReturnTo("/issues/new", "VIEWER")).toBe("/issues");
    expect(safeReturnTo("/issues?q=login", "MEMBER")).toBe("/issues?q=login");
    expect(safeReturnTo("/issues?q=a%23b", "MEMBER")).toBe("/issues?q=a%23b");
  });
  it("clears private volatile query cache and drafts after an explicit successful logout", async () => {
    vi.spyOn(authApi, "me").mockResolvedValue(account);
    vi.spyOn(authApi, "logout").mockResolvedValue();
    function SessionProbe() {
      const auth = useAuth();
      return (
        <>
          <p>{auth.user?.displayName ?? "Anonimo"}</p>
          <button
            onClick={() => {
              auth.setDraft("issue-new", { description: "private draft" });
              queryClient.setQueryData(["private-test"], { secret: true });
            }}
          >
            Bozza
          </button>
          <button onClick={() => void auth.logout()}>Logout</button>
          <button
            onClick={() => {
              expect(auth.getDraft("issue-new")).toBeUndefined();
            }}
          >
            Verifica
          </button>
        </>
      );
    }
    render(
      <AuthProvider>
        <SessionProbe />
      </AuthProvider>,
    );
    await screen.findByText("Marta");
    const user = userEvent.setup();
    await user.click(screen.getByText("Bozza"));
    expect(queryClient.getQueryData(["private-test"])).toEqual({
      secret: true,
    });
    await user.click(screen.getByText("Logout"));
    await screen.findByText("Anonimo");
    expect(queryClient.getQueryData(["private-test"])).toBeUndefined();
    await user.click(screen.getByText("Verifica"));
  });
  it("counts password Unicode codepoints and preserves significant whitespace", () => {
    expect(validatePassword("🙂".repeat(12), "🙂".repeat(12), "old")).toEqual(
      {},
    );
    expect(validatePassword("           x", "           x", "old")).toEqual({});
    expect(validatePassword("123", "different", "old")).toHaveProperty(
      "confirmation",
    );
    expect(
      validatePassword("a".repeat(129), "a".repeat(129), "old"),
    ).toHaveProperty("newPassword");
  });
  it("logs in using the entered password and honors mandatory change before returnTo", async () => {
    vi.spyOn(authApi, "me").mockRejectedValue(anonymous());
    const login = vi
      .spyOn(authApi, "login")
      .mockResolvedValue({ ...account, mustChangePassword: true });
    render(
      <MemoryRouter
        initialEntries={[
          { pathname: "/login", state: { returnTo: "/admin/users" } },
        ]}
      >
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/change-password" element={<h1>Obbligatoria</h1>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    await user.type(
      await screen.findByLabelText("Email *"),
      "person@example.test",
    );
    await user.type(screen.getByLabelText("Password *"), "  twelve chars  ");
    await user.click(screen.getByRole("button", { name: "Accedi" }));
    expect(
      await screen.findByRole("heading", { name: "Obbligatoria" }),
    ).toBeInTheDocument();
    expect(login).toHaveBeenCalledWith(
      "person@example.test",
      "  twelve chars  ",
    );
  });
  it("keeps a generic credential error and the entered form after a failed login", async () => {
    vi.spyOn(authApi, "me").mockRejectedValue(anonymous());
    vi.spyOn(authApi, "login").mockRejectedValue(
      new ApiError({
        ...anonymous().problem,
        code: "INVALID_CREDENTIALS",
        detail: "Credenziali non valide. Controlla email e password.",
      }),
    );
    render(
      <MemoryRouter>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    await user.type(
      await screen.findByLabelText("Email *"),
      "person@example.test",
    );
    await user.type(screen.getByLabelText("Password *"), "password twelve");
    await user.click(screen.getByRole("button", { name: "Accedi" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Credenziali non valide",
    );
    expect(screen.getByLabelText("Email *")).toHaveValue("person@example.test");
    expect(screen.getByRole("alert")).toHaveFocus();
    await user.type(screen.getByLabelText("Email *"), ".more");
    expect(screen.getByLabelText("Email *")).toHaveValue(
      "person@example.test.more",
    );
    expect(screen.getByLabelText("Email *")).toHaveFocus();
  });
  it("denies an ADMIN route for a VIEWER without rendering the protected outlet", async () => {
    vi.spyOn(authApi, "me").mockResolvedValue({ ...account, role: "VIEWER" });
    render(
      <MemoryRouter>
        <AuthProvider>
          <Routes>
            <Route element={<RequireSession />}>
              <Route element={<RequireRole roles={["ADMIN"]} />}>
                <Route path="/" element={<p>Private admin data</p>} />
              </Route>
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: "Accesso non consentito" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Private admin data")).not.toBeInTheDocument();
  });
  it("dialog starts on cancel for a sensitive action and restores origin focus", async () => {
    const close = vi.fn();
    const { rerender } = render(
      <>
        <button>Origin</button>
        <Dialog open={false} title="Conferma" onClose={close} sensitive>
          <input aria-label="Target" />
        </Dialog>
      </>,
    );
    screen.getByText("Origin").focus();
    rerender(
      <>
        <button>Origin</button>
        <Dialog open title="Conferma" onClose={close} sensitive>
          <input aria-label="Target" />
        </Dialog>
      </>,
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Chiudi Conferma" }),
      ).toHaveFocus(),
    );
    rerender(
      <>
        <button>Origin</button>
        <Dialog open={false} title="Conferma" onClose={close} sensitive>
          <input aria-label="Target" />
        </Dialog>
      </>,
    );
    expect(screen.getByText("Origin")).toHaveFocus();
  });
});
