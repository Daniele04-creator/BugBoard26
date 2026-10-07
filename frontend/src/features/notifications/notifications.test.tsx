import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api, NetworkError } from "../../api/ApiClient";
import type { Notification, Page } from "../../api/types";
import { NotificationsPage } from "./NotificationsPage";

const unread: Notification = {
  id: "00000000-0000-0000-0000-000000000001",
  type: "ASSIGNED",
  issue: {
    id: "00000000-0000-0000-0000-000000000002",
    number: 142,
    title: "Errore nel salvataggio della configurazione",
  },
  eventId: "00000000-0000-0000-0000-000000000003",
  createdAt: "2026-10-07T08:15:00Z",
  readAt: null,
};
const read: Notification = {
  ...unread,
  id: "00000000-0000-0000-0000-000000000004",
  type: "RESOLVED",
  issue: { ...unread.issue, number: 137, title: "Correggere il nome del file CSV" },
  readAt: "2026-10-07T08:20:00Z",
};
const mixed: Page<Notification> = {
  items: [unread, read],
  page: 0,
  size: 20,
  totalElements: 2,
  totalPages: 1,
};

function show(path = "/notifications") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const router = createMemoryRouter(
    [
      { path: "/notifications", element: <NotificationsPage /> },
      { path: "/issues/:issueId", element: <h1>Dettaglio issue</h1> },
    ],
    { initialEntries: [path] },
  );
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { client, router };
}

beforeEach(() => vi.restoreAllMocks());

describe("notifications register", () => {
  it("keeps the issue, timestamp, read state and available actions in each record", async () => {
    vi.spyOn(api, "get").mockResolvedValue(mixed);
    show();
    const register = await screen.findByRole("list", { name: "Registro delle notifiche" });
    const rows = within(register).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("Non letta")).toBeVisible();
    expect(within(rows[0]).getByRole("heading", {
      name: "Ti è stata assegnata BB-142 — Errore nel salvataggio della configurazione",
    })).toBeVisible();
    expect(rows[0].querySelector("time")).toHaveAttribute("datetime", unread.createdAt);
    expect(within(rows[0]).getByRole("link", { name: "Apri" })).toHaveAttribute("href", `/issues/${unread.issue.id}`);
    expect(within(rows[0]).getByRole("button", { name: "Segna come letta" })).toBeEnabled();
    expect(within(rows[1]).getByText("Letta")).toBeVisible();
    expect(within(rows[1]).getByRole("heading", {
      name: "È stata risolta BB-137 — Correggere il nome del file CSV",
    })).toBeVisible();
    expect(within(rows[1]).queryByRole("button", { name: "Segna come letta" })).not.toBeInTheDocument();
  });

  it("still opens an unread issue when marking the notification fails", async () => {
    vi.spyOn(api, "get").mockResolvedValue(mixed);
    const mark = vi.spyOn(api, "put").mockRejectedValue(new NetworkError(false));
    const { router } = show();
    const register = await screen.findByRole("list", { name: "Registro delle notifiche" });
    await userEvent.setup().click(within(register).getAllByRole("link", { name: "Apri" })[0]);
    await screen.findByRole("heading", { name: "Dettaglio issue" });
    expect(mark).toHaveBeenCalledWith(`/notifications/${unread.id}/read`);
    expect(router.state.location.pathname).toBe(`/issues/${unread.issue.id}`);
    expect(router.state.location.state).toEqual({ notificationReadError: true });
  });

  it("opens a read notification without sending another mark request", async () => {
    vi.spyOn(api, "get").mockResolvedValue(mixed);
    const mark = vi.spyOn(api, "put").mockResolvedValue(undefined);
    show();
    const register = await screen.findByRole("list", { name: "Registro delle notifiche" });
    await userEvent.setup().click(within(register).getAllByRole("link", { name: "Apri" })[1]);
    await screen.findByRole("heading", { name: "Dettaglio issue" });
    expect(mark).not.toHaveBeenCalled();
  });

  it("refreshes the notification query family after marking all records", async () => {
    vi.spyOn(api, "get")
      .mockResolvedValueOnce(mixed)
      .mockResolvedValue({ ...mixed, items: [{ ...unread, readAt: read.readAt }, read] });
    const mark = vi.spyOn(api, "put").mockResolvedValue(undefined);
    const { client } = show();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await screen.findByText("Non letta");
    await userEvent.setup().click(screen.getByRole("button", { name: "Segna tutte come lette" }));
    await screen.findByText("Tutte le notifiche sono state segnate come lette.");
    expect(mark).toHaveBeenCalledWith("/notifications/read-all");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["notifications"] });
    expect(screen.queryByRole("button", { name: "Segna come letta" })).not.toBeInTheDocument();
  });

  it("resets the page while preserving the selected size when filtering unread records", async () => {
    vi.spyOn(api, "get").mockResolvedValue(mixed);
    const { router } = show("/notifications?page=2&size=50");
    await screen.findByText("Non letta");
    await userEvent.setup().click(screen.getByRole("checkbox", { name: "Solo non lette" }));
    await waitFor(() => expect(new URLSearchParams(router.state.location.search).get("unreadOnly")).toBe("true"));
    const params = new URLSearchParams(router.state.location.search);
    expect(params.has("page")).toBe(false);
    expect(params.get("size")).toBe("50");
  });

  it("rejects an invalid query before requesting notification data", () => {
    const get = vi.spyOn(api, "get");
    show("/notifications?unreadOnly=true&unreadOnly=false");
    expect(screen.getByText("Filtri delle notifiche non validi.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Ripristina vista" })).toBeEnabled();
    expect(get).not.toHaveBeenCalled();
  });

  it.each([
    ["/notifications", "Non hai notifiche."],
    ["/notifications?unreadOnly=true", "Non hai notifiche non lette."],
  ])("distinguishes the empty state at %s", async (path, message) => {
    vi.spyOn(api, "get").mockResolvedValue({
      ...mixed, items: [], totalElements: 0, totalPages: 0,
    });
    show(path);
    expect(await screen.findByText(message)).toBeVisible();
    expect(screen.queryByRole("list", { name: "Registro delle notifiche" })).not.toBeInTheDocument();
  });
});
