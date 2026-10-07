import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { IssueSummary } from "../../api/types";
import { IssueListPage } from "./IssueListPage";
import { issueApi } from "./issueApi";
import { todayRome } from "./issuePresentation";

vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { role: "MEMBER" },
    getDraft: () => undefined,
    setDraft: vi.fn(),
  }),
}));
vi.mock("./issueApi", () => ({
  getLabels: vi.fn(async () => []),
  getDirectory: vi.fn(async () => []),
  issueApi: { list: vi.fn(), export: vi.fn() },
}));
const issue: IssueSummary = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  number: 42,
  title: "Problema da verificare",
  type: "BUG",
  status: "IN_PROGRESS",
  priority: "HIGH",
  reporter: {
    id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    displayName: "Giulia",
    role: "MEMBER",
    active: true,
  },
  assignee: null,
  labels: [
    {
      id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      name: "Backend",
      color: "blue",
      active: true,
      version: 1,
    },
  ],
  dueDate: todayRome(),
  archived: false,
  archivedAt: null,
  archivedBy: null,
  createdAt: "2026-10-06T22:30:00Z",
  updatedAt: "2026-10-06T22:30:00Z",
  lastActivityAt: "2026-10-06T22:30:00Z",
  resolvedAt: null,
  duplicateOf: null,
  hasImage: false,
  version: 1,
};
function mount(query = "", archived = false) {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(
    [{ path: "/issues", element: <IssueListPage archived={archived} /> }],
    { initialEntries: [`/issues${query ? "?" + query : ""}`] },
  );
  const result = render(
    <QueryClientProvider client={cache}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...result, router };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(issueApi.list).mockResolvedValue({
    items: [issue],
    page: 0,
    size: 20,
    totalElements: 1,
    totalPages: 1,
  });
});
describe("issue register and preserved URL behavior", () => {
  it("starts with closed filters and applies the draft only on submit", async () => {
    const { router } = mount("q=login&size=50&sort=priority,asc");
    const filters = screen.getByRole("button", { name: /Filtri/ });
    expect(filters).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("checkbox", { name: "Bug" }),
    ).not.toBeInTheDocument();
    await userEvent.click(filters);
    await userEvent.click(screen.getByRole("checkbox", { name: "Bug" }));
    expect(router.state.location.search).not.toContain("type=BUG");
    await userEvent.click(filters);
    expect(router.state.location.search).not.toContain("type=BUG");
    await userEvent.click(filters);
    await userEvent.click(
      screen.getByRole("button", { name: "Applica filtri" }),
    );
    await waitFor(() =>
      expect(
        new URLSearchParams(router.state.location.search).get("type"),
      ).toBe("BUG"),
    );
    const query = new URLSearchParams(router.state.location.search);
    expect(query.get("q")).toBe("login");
    expect(query.get("size")).toBe("50");
    expect(query.get("sort")).toBe("priority,asc");
  });
  it("keeps separate state and priority and all record metadata with neutral today's deadline", async () => {
    const { container } = mount();
    const table = await screen.findByRole("table");
    expect(
      within(table).getByRole("columnheader", { name: "Stato" }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole("columnheader", { name: "Priorità" }),
    ).toBeInTheDocument();
    expect(
      within(table).queryByRole("columnheader", { name: "Creata il" }),
    ).not.toBeInTheDocument();
    expect(within(table).getByText("Creata: 07/10/2026")).toBeInTheDocument();
    expect(screen.queryByText("Scaduta")).not.toBeInTheDocument();
    const register = container.querySelector(".issue-register")!;
    expect(register.querySelectorAll(".issue-record")).toHaveLength(1);
    expect(
      within(register as HTMLElement).getByText("Backend"),
    ).toBeInTheDocument();
    expect(
      within(register as HTMLElement).getByText("Nessuno"),
    ).toBeInTheDocument();
    expect(
      within(register as HTMLElement).getByText("Creata: 07/10/2026"),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole("link", {
        name: "BB-42 · Problema da verificare",
      }),
    ).toHaveAttribute("data-issue-id", issue.id);
  });
  it("recovers an out-of-range page without dropping repeated filters or sort", async () => {
    vi.mocked(issueApi.list).mockResolvedValue({
      items: [],
      page: 999,
      size: 50,
      totalElements: 21,
      totalPages: 1,
    });
    const { router } = mount(
      "page=999&size=50&q=login&status=TODO&status=IN_PROGRESS&sort=dueDate,asc",
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Prima pagina" }),
    );
    const query = new URLSearchParams(router.state.location.search);
    expect(query.get("page")).toBe("0");
    expect(query.getAll("status")).toEqual(["TODO", "IN_PROGRESS"]);
    expect(query.get("size")).toBe("50");
    expect(query.get("sort")).toBe("dueDate,asc");
    expect(query.get("q")).toBe("login");
  });
  it("preserves confirmed filters across pagination and resets the page on size or sort changes", async () => {
    vi.mocked(issueApi.list).mockResolvedValue({
      items: [issue],
      page: 1,
      size: 20,
      totalElements: 60,
      totalPages: 3,
    });
    const { router } = mount("page=1&status=TODO&status=IN_PROGRESS&q=login");
    await userEvent.click(
      await screen.findByRole("button", { name: "Successiva" }),
    );
    let query = new URLSearchParams(router.state.location.search);
    expect(query.get("page")).toBe("2");
    expect(query.getAll("status")).toEqual(["TODO", "IN_PROGRESS"]);
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Per pagina" }),
      "50",
    );
    query = new URLSearchParams(router.state.location.search);
    expect(query.has("page")).toBe(false);
    expect(query.get("size")).toBe("50");
    expect(query.get("q")).toBe("login");
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Ordina" }),
      "priority",
    );
    query = new URLSearchParams(router.state.location.search);
    expect(query.get("sort")).toBe("priority,desc");
    expect(query.getAll("status")).toEqual(["TODO", "IN_PROGRESS"]);
    expect(query.get("size")).toBe("50");
  });
  it("keeps the archived register read-only and exposes archival provenance", async () => {
    vi.mocked(issueApi.list).mockResolvedValue({
      items: [
        {
          ...issue,
          archived: true,
          archivedAt: issue.createdAt,
          archivedBy: issue.reporter,
        },
      ],
      page: 0,
      size: 20,
      totalElements: 1,
      totalPages: 1,
    });
    mount("", true);
    await screen.findByRole("table");
    expect(
      screen.queryByRole("link", { name: "Nuova issue" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByText(/Archiviata il 07\/10\/2026 00:30 da Giulia/),
    ).toHaveLength(2);
    expect(vi.mocked(issueApi.list).mock.calls[0][0]).toContain(
      "archived=true",
    );
  });
});
