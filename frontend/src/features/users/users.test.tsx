import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UserAdmin } from "../../api/types";
import { ApiError } from "../../api/ApiClient";
import { AuthProvider } from "../auth/AuthProvider";
import { authApi } from "../auth/authApi";
import { UserEditPage } from "./UserEditPage";
import { UserCreatePage } from "./UserCreatePage";
import { userApi } from "./userApi";
import {
  parseAdminFilters,
  normalizedName,
  passwordError,
} from "./adminPresentation";

const admin: UserAdmin = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "admin@example.test",
  displayName: "Admin",
  role: "ADMIN",
  active: true,
  mustChangePassword: false,
  version: 0,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};
const member: UserAdmin = {
  ...admin,
  id: "00000000-0000-0000-0000-000000000002",
  email: "member@example.test",
  displayName: "Member",
  role: "MEMBER",
};
function failure(code: string, status = 409) {
  return new ApiError({
    type: "urn:test",
    title: "Conflitto",
    status,
    detail: "Operazione non completata.",
    instance: "/admin/users",
    code,
    requestId: "",
    fieldErrors: [],
  });
}
function show(path: string) {
  vi.spyOn(authApi, "me").mockResolvedValue(admin);
  const router = createMemoryRouter(
    [
      { path: "/admin/users/new", element: <UserCreatePage /> },
      { path: "/admin/users/:userId/edit", element: <UserEditPage /> },
      { path: "/profile", element: <h1>Profilo</h1> },
      { path: "/admin/users", element: <h1>Utenti</h1> },
    ],
    { initialEntries: [path] },
  );
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  );
}
beforeEach(() => vi.restoreAllMocks());
describe("administrator accounts", () => {
  it("validates URL filters without silently coercing unknown values", () => {
    expect(
      parseAdminFilters(
        new URLSearchParams("role=VIEWER&active=false&page=2&size=50"),
      ).valid,
    ).toBe(true);
    for (const query of [
      "role=ROOT",
      "active=yes",
      "page=-1",
      "size=101",
      "q=a&q=b",
      "unknown=true",
      "page=9007199254740992",
    ])
      expect(parseAdminFilters(new URLSearchParams(query)).valid).toBe(false);
    expect(parseAdminFilters(new URLSearchParams(), true).active).toBe("all");
  });
  it("counts Unicode code points and preserves raw password whitespace", () => {
    expect(normalizedName("é".repeat(80), 2, 80)).toBeNull();
    expect(normalizedName("😀".repeat(80), 2, 80)).toBeNull();
    expect(normalizedName("a\nname", 2, 80)).not.toBeNull();
    expect(passwordError("  twelve chars  ")).toBeNull();
    expect(passwordError("😀".repeat(128))).toBeNull();
    expect(passwordError("😀".repeat(129))).not.toBeNull();
  });
  it("loads the direct editor by UUID and confirms role changes before writing", async () => {
    vi.spyOn(userApi, "get").mockResolvedValue(member);
    const update = vi
      .spyOn(userApi, "update")
      .mockResolvedValue({ ...member, role: "VIEWER", version: 1 });
    show(`/admin/users/${member.id}/edit`);
    await screen.findByLabelText(/^Nome/);
    expect(screen.getByRole("heading", { name: "Gestisci utente" })).toBeInTheDocument();
    expect(userApi.get).toHaveBeenCalledWith(
      member.id,
      expect.any(AbortSignal),
    );
    await userEvent
      .setup()
      .selectOptions(screen.getByLabelText(/^Ruolo/), "VIEWER");
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Salva modifiche" }));
    expect(update).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog", {
      name: "Conferma modifica dell'accesso",
    });
    await userEvent
      .setup()
      .click(within(dialog).getByRole("button", { name: "Conferma e salva" }));
    await screen.findByText("Modifiche salvate.");
    expect(update).toHaveBeenCalledWith(member.id, {
      displayName: "Member",
      role: "VIEWER",
      active: true,
      expectedVersion: 0,
    });
  });
  it("preserves a stale edit and only adopts a new version after explicit comparison", async () => {
    vi.spyOn(userApi, "get")
      .mockResolvedValueOnce(member)
      .mockResolvedValueOnce({
        ...member,
        displayName: "Server name",
        version: 1,
      });
    const update = vi
      .spyOn(userApi, "update")
      .mockRejectedValueOnce(failure("VERSION_CONFLICT"))
      .mockResolvedValueOnce({
        ...member,
        displayName: "My draft",
        version: 2,
      });
    show(`/admin/users/${member.id}/edit`);
    await screen.findByLabelText(/^Nome/);
    expect(screen.getByRole("heading", { name: "Gestisci utente" })).toBeInTheDocument();
    const input = screen.getByLabelText(/^Nome/);
    await userEvent.setup().clear(input);
    await userEvent.setup().type(input, "My draft");
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Salva modifiche" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Account aggiornato da un altro utente",
    });
    await within(dialog).findByText("Server name");
    expect(input).toHaveValue("My draft");
    expect(update).toHaveBeenCalledTimes(1);
    await userEvent.setup().click(
      within(dialog).getByRole("button", {
        name: "Mantieni la bozza e usa la versione corrente",
      }),
    );
    expect(input).toHaveValue("My draft");
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Salva modifiche" }));
    await screen.findByText("Modifiche salvate.");
    expect(update).toHaveBeenLastCalledWith(
      member.id,
      expect.objectContaining({ displayName: "My draft", expectedVersion: 1 }),
    );
  });
  it("never offers an administrative temporary password for the current account", async () => {
    vi.spyOn(userApi, "get").mockResolvedValue(admin);
    show(`/admin/users/${admin.id}/edit`);
    await screen.findByLabelText(/^Nome/);
    expect(screen.getByRole("heading", { name: "Gestisci utente" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Imposta password temporanea" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "cambio password nel profilo" }),
    ).toHaveAttribute("href", "/profile");
  });
  it("keeps a confirmed reset successful if the follow-up read fails and blocks stale edits", async () => {
    vi.spyOn(userApi, "get")
      .mockResolvedValueOnce(member)
      .mockRejectedValueOnce(new Error("Read unavailable"));
    const reset = vi.spyOn(userApi, "reset").mockResolvedValue();
    show(`/admin/users/${member.id}/edit`);
    await screen.findByLabelText(/^Nome/);
    expect(screen.getByRole("heading", { name: "Gestisci utente" })).toBeInTheDocument();
    await userEvent
      .setup()
      .click(
        screen.getByRole("button", { name: "Imposta password temporanea" }),
      );
    const dialog = await screen.findByRole("dialog", {
      name: "Password temporanea per Member",
    });
    await userEvent
      .setup()
      .type(
        within(dialog).getByLabelText(/^Password temporanea/),
        "Replacement password 2026",
      );
    await userEvent.setup().click(
      within(dialog).getByRole("button", {
        name: "Conferma password temporanea",
      }),
    );
    await screen.findByText(
      "Password temporanea impostata. Non è stato possibile aggiornare i dati dell'account.",
    );
    expect(reset).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText(/^Nome/)).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Ricarica account" }),
    ).toBeInTheDocument();
  });
  it("keeps the creation fields on duplicate email failure", async () => {
    vi.spyOn(userApi, "create").mockRejectedValue(
      failure("EMAIL_ALREADY_EXISTS"),
    );
    show("/admin/users/new");
    await screen.findByRole("heading", { name: "Nuovo utente" });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^Nome/), "New member");
    await user.type(screen.getByLabelText(/^Email/), member.email);
    await user.type(
      screen.getByLabelText(/^Password temporanea/),
      "Temporary password 2026",
    );
    await user.click(screen.getByRole("button", { name: "Crea utente" }));
    await waitFor(() =>
      expect(screen.getByLabelText(/^Email/)).toHaveAttribute(
        "aria-invalid",
        "true",
      ),
    );
    expect(screen.getByLabelText(/^Nome/)).toHaveValue("New member");
    expect(screen.getByLabelText(/^Email/)).toHaveValue(member.email);
  });
});
