import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
} from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { api, ApiError, NetworkError } from "../api/ApiClient";
import { AppShell } from "./AppShell";

const auth = vi.hoisted(() => ({
  user: {
    id: "00000000-0000-0000-0000-000000000001",
    displayName: "Administrator",
    role: "ADMIN" as "ADMIN" | "MEMBER" | "VIEWER",
  },
  logout: async () => {},
}));
vi.mock("../features/auth/AuthProvider", () => ({ useAuth: () => auth }));
let client: QueryClient;
beforeEach(() => {
  auth.user.role = "ADMIN";
  vi.useFakeTimers();
  focusManager.setFocused(true);
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 15_000, gcTime: Infinity },
    },
  });
});
describe("role-aware shell presentation", () => {
  it("keeps profile and logout visible with the Italian role and real notification count", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ count: 7 });
    const { container } = renderShell();
    await advance(0);
    const sidebar = within(container.querySelector(".sidebar")!);
    expect(sidebar.getByRole("link", { name: "Il tuo profilo" })).toHaveAttribute("title", "Administrator · Amministratore");
    expect(sidebar.getByRole("link", { name: "Analisi" })).toHaveAttribute("href", "/admin/dashboard");
    expect(sidebar.queryByRole("link", { name: "Report" })).not.toBeInTheDocument();
    expect(
      sidebar.getByRole("link", { name: "Il tuo profilo" }),
    ).toHaveAttribute("href", "/profile");
    expect(sidebar.getByRole("button", { name: "Esci" })).toBeInTheDocument();
    expect(
      sidebar.queryByRole("button", { name: /profilo/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Notifiche, 7 non lette" }),
    ).toHaveAttribute("href", "/notifications");
  });
  it("preserves viewer navigation restrictions and the read-only explanation", async () => {
    auth.user.role = "VIEWER";
    vi.spyOn(api, "get").mockResolvedValue({ count: 0 });
    renderShell();
    await advance(0);
    expect(screen.getByRole("link", { name: "Il tuo profilo" })).toHaveAttribute("title", "Administrator · Sola lettura");
    expect(
      screen.queryByRole("link", { name: "Team" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Assegnate a me" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Sola lettura: puoi consultare/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Esci" })).toBeInTheDocument();
  });
});
afterEach(() => {
  client.clear();
  focusManager.setFocused(undefined);
  vi.useRealTimers();
});
function renderShell() {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AppShell />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
async function advance(milliseconds: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}
describe("notification polling", () => {
  it("backs off 30/60/120 seconds for network and unavailable responses, caps at 120, and resets after success", async () => {
    const unavailable = new ApiError({
      type: "about:blank",
      title: "Unavailable",
      status: 503,
      code: "SERVICE_UNAVAILABLE",
      detail: "Unavailable",
      instance: "/api",
      requestId: "request",
      fieldErrors: [],
    });
    const get = vi
      .spyOn(api, "get")
      .mockRejectedValueOnce(new NetworkError(false))
      .mockRejectedValueOnce(unavailable)
      .mockRejectedValueOnce(new NetworkError(true))
      .mockRejectedValueOnce(unavailable)
      .mockResolvedValue({ count: 2 });
    renderShell();
    await advance(0);
    expect(get).toHaveBeenCalledTimes(1);
    await advance(29_999);
    expect(get).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(get).toHaveBeenCalledTimes(2);
    await advance(59_999);
    expect(get).toHaveBeenCalledTimes(2);
    await advance(1);
    expect(get).toHaveBeenCalledTimes(3);
    await advance(119_999);
    expect(get).toHaveBeenCalledTimes(3);
    await advance(1);
    expect(get).toHaveBeenCalledTimes(4);
    await advance(120_000);
    expect(get).toHaveBeenCalledTimes(5);
    await advance(29_999);
    expect(get).toHaveBeenCalledTimes(5);
    await advance(1);
    expect(get).toHaveBeenCalledTimes(6);
  });
  it("suspends hidden-tab polling, refreshes on return and stops after the shell unmounts", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ count: 0 });
    const rendered = renderShell();
    await advance(0);
    expect(get).toHaveBeenCalledTimes(1);
    await act(async () => {
      focusManager.setFocused(false);
    });
    await advance(90_000);
    expect(get).toHaveBeenCalledTimes(1);
    await act(async () => {
      focusManager.setFocused(true);
    });
    await advance(0);
    expect(get).toHaveBeenCalledTimes(2);
    rendered.unmount();
    await advance(120_000);
    expect(get).toHaveBeenCalledTimes(2);
  });
});
