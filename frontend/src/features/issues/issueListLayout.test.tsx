import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { IssueSummary, Page } from "../../api/types";
import { IssueListPage } from "./IssueListPage";
import { issueApi } from "./issueApi";
import { todayRome } from "./issuePresentation";

const drafts = vi.hoisted(() => new Map<string, unknown>());
vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { role: "MEMBER" },
    getDraft: (key: string) => drafts.get(key),
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
function mount(query = "", archived = false, state?: Record<string, unknown>) {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(
    [{ path: "/issues", element: <IssueListPage archived={archived} /> }],
    { initialEntries: [{ pathname: "/issues", search: query ? "?" + query : "", state }] },
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
  drafts.clear();
  vi.mocked(issueApi.list).mockResolvedValue({
    items: [issue],
    page: 0,
    size: 20,
    totalElements: 1,
    totalPages: 1,
  });
});
async function choose(name: string, option: string) {
  await userEvent.click(
    screen.getByRole("button", { name: new RegExp(`^${name}:`) }),
  );
  await userEvent.click(await screen.findByRole("option", { name: option }));
}
describe("issue board, archive and preserved URL behavior", () => {
  it.each(["state", "draft"])(
    "mounts the issue beyond fifty before restoring focus from %s",
    async (source) => {
      const rows = Array.from({ length: 80 }, (_, index) => ({
        ...issue, id: `issue-${index}`, number: index,
      }));
      vi.mocked(issueApi.list).mockResolvedValue({
        items: rows, page: 0, size: 100, totalElements: 80, totalPages: 1,
      });
      const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
      if (source === "draft") {
        drafts.set("list-focus:/issues?q=login", rows[70].id);
        drafts.set("list-scroll:/issues?q=login", 360);
      }
      mount("q=login", false, source === "state" ? {
        focusIssueId: rows[70].id, restoreScrollY: 360,
      } : undefined);
      const column = await screen.findByRole("region", { name: "In corso: 80 issue" });
      const target = within(column).getByRole("link", { name: "BB-70 · Problema da verificare" });
      expect(within(column).getAllByRole("link")).toHaveLength(71);
      await waitFor(() => expect(target).toHaveFocus());
      expect(scroll).toHaveBeenCalledWith({ top: 360, behavior: "instant" });
      scroll.mockRestore();
    },
  );
  it("resets visible batches on a filter change while preserving the server's ordered results", async () => {
    const rows = Array.from({ length: 80 }, (_, index) => ({
      ...issue, id: `issue-${index}`, number: index,
    }));
    vi.mocked(issueApi.list).mockImplementation(async (query) => ({
      items: new URLSearchParams(query).has("q") ? [...rows].reverse() : rows,
      page: 0, size: 100, totalElements: 80, totalPages: 1,
    }));
    const { router } = mount();
    const board = await screen.findByRole("region", { name: "Bacheca issue" });
    await userEvent.click(screen.getByRole("button", { name: "Mostra altre 30 issue in In corso" }));
    expect(within(board).getAllByRole("link")).toHaveLength(80);
    await act(async () => router.navigate("/issues?q=login"));
    const nextBoard = await screen.findByRole("region", { name: "Bacheca issue" });
    await waitFor(() => expect(within(nextBoard).getAllByRole("link")[0])
      .toHaveAttribute("data-issue-id", "issue-79"));
    expect(within(nextBoard).getAllByRole("link")).toHaveLength(50);
  });
  it("starts with closed filters and applies each selection while preserving the query and sorting", async () => {
    const { router } = mount("q=login&size=50&sort=priority,asc");
    const filters = screen.getByRole("button", { name: "Filtri" });
    expect(filters).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("button", { name: /^Tipo:/ }),
    ).not.toBeInTheDocument();
    await userEvent.click(filters);
    await choose("Tipo", "Bug");
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
  it("renders one board with readable priority, labels and four status columns", async () => {
    mount();
    const board = await screen.findByRole("region", { name: "Bacheca issue" });
    expect(
      within(board).getByRole("region", { name: "In corso: 1 issue" }),
    ).toBeInTheDocument();
    expect(within(board).getAllByRole("region")).toHaveLength(4);
    const card = within(board).getByRole("link", {
      name: "BB-42 · Problema da verificare",
    });
    expect(card).toHaveAttribute("data-issue-id", issue.id);
    expect(within(card).getByText("Alta")).toBeInTheDocument();
    expect(within(card).getByText("Backend")).toHaveClass("badge-blue");
    expect(screen.queryByText(/Scaduta ·/)).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Successiva" }),
    ).not.toBeInTheDocument();
  });
  it("loads every server page for the board and deduplicates stable issue IDs", async () => {
    const second = {
      ...issue,
      id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
      number: 43,
      title: "Seconda issue",
      status: "TODO" as const,
    };
    vi.mocked(issueApi.list).mockImplementation(async (query) => {
      const page = Number(new URLSearchParams(query).get("page"));
      return {
        items: page === 0 ? [issue] : [issue, second],
        page,
        size: 100,
        totalElements: 2,
        totalPages: 2,
      };
    });
    mount("q=login&status=TODO&status=IN_PROGRESS&page=8");
    const board = await screen.findByRole("region", { name: "Bacheca issue" });
    expect(within(board).getAllByRole("link")).toHaveLength(2);
    expect(issueApi.list).toHaveBeenCalledTimes(2);
    const requests = vi
      .mocked(issueApi.list)
      .mock.calls.map(([query]) => new URLSearchParams(query));
    expect(requests.map((params) => params.get("page"))).toEqual(["0", "1"]);
    expect(requests.every((params) => params.get("size") === "100")).toBe(true);
    expect(
      requests.every(
        (params) =>
          params.getAll("status").length === 2 && params.get("q") === "login",
      ),
    ).toBe(true);
  });
  it("loads at most four pages together and preserves page order despite out-of-order responses", async () => {
    const pending = new Map<number, (page: Page<IssueSummary>) => void>();
    let active = 0;
    let maximumActive = 0;
    const pageResult = (page: number): Page<IssueSummary> => ({
      items: [{ ...issue, id: String(page), number: page, status: "TODO" }],
      page,
      size: 100,
      totalElements: 7,
      totalPages: 7,
    });
    vi.mocked(issueApi.list).mockImplementation(async (query) => {
      const page = Number(new URLSearchParams(query).get("page"));
      if (page === 0) return pageResult(0);
      active++;
      maximumActive = Math.max(maximumActive, active);
      return new Promise((resolve) => {
        pending.set(page, (result) => {
          active--;
          resolve(result);
        });
      });
    });
    mount("q=login&status=TODO&status=IN_PROGRESS&sort=title,asc");
    await waitFor(() => expect(pending.size).toBe(4));
    await act(async () => {
      for (const page of [4, 2, 3]) {
        const result = pageResult(page);
        if (page !== 3)
          result.items.push({
            ...pageResult(0).items[0],
            title: `Duplicata dalla pagina ${page}`,
          });
        pending.get(page)!(result);
      }
    });
    expect(issueApi.list).toHaveBeenCalledTimes(5);
    expect(screen.queryByRole("region", { name: "Bacheca issue" })).toBeNull();
    await act(async () => pending.get(1)!(pageResult(1)));
    await waitFor(() => expect(pending.size).toBe(6));
    await act(async () => {
      pending.get(6)!(pageResult(6));
      pending.get(5)!(pageResult(5));
    });
    const board = await screen.findByRole("region", { name: "Bacheca issue" });
    expect(
      within(board).getAllByRole("link").map((link) => link.dataset.issueId),
    ).toEqual(["0", "1", "2", "3", "4", "5", "6"]);
    expect(
      within(board).getByRole("link", { name: "BB-0 · Duplicata dalla pagina 4" }),
    ).toBeInTheDocument();
    expect(maximumActive).toBe(4);
    const requests = vi.mocked(issueApi.list).mock.calls;
    const signal = requests[0][1];
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(
      requests.every(([, requestSignal]) => requestSignal === signal),
    ).toBe(true);
    expect(
      requests.every(([query]) => {
        const params = new URLSearchParams(query);
        return (
          params.getAll("status").join(",") === "TODO,IN_PROGRESS" &&
          params.get("q") === "login" &&
          params.get("sort") === "title,asc" &&
          params.get("size") === "100"
        );
      }),
    ).toBe(true);
  });
  it("aborts in-flight board pages on unmount without starting another batch", async () => {
    const signals: AbortSignal[] = [];
    vi.mocked(issueApi.list).mockImplementation(async (query, signal) => {
      const page = Number(new URLSearchParams(query).get("page"));
      if (page === 0)
        return {
          items: [issue], page, size: 100, totalElements: 800, totalPages: 8,
        };
      signals.push(signal!);
      return new Promise((_resolve, reject) => {
        signal!.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      });
    });
    const { unmount } = mount();
    await waitFor(() => expect(signals).toHaveLength(4));
    await act(async () => unmount());
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    expect(issueApi.list).toHaveBeenCalledTimes(5);
  });
  it("shows a page failure without a partial board and can retry the full load", async () => {
    vi.mocked(issueApi.list).mockImplementation(async (query) => {
      const page = Number(new URLSearchParams(query).get("page"));
      if (page === 2) throw new Error("Page unavailable");
      return {
        items: [issue], page, size: 100, totalElements: 800, totalPages: 8,
      };
    });
    mount();
    const retry = await screen.findByRole("button", { name: "Riprova caricamento" });
    expect(screen.queryByRole("region", { name: "Bacheca issue" })).toBeNull();
    expect(issueApi.list).toHaveBeenCalledTimes(5);
    vi.mocked(issueApi.list).mockResolvedValue({
      items: [issue], page: 0, size: 100, totalElements: 1, totalPages: 1,
    });
    await userEvent.click(retry);
    expect(await screen.findByRole("region", { name: "Bacheca issue" })).toBeInTheDocument();
    expect(issueApi.list).toHaveBeenCalledTimes(6);
  });
  it("removes only the selected filter, retaining repeated filters, scope, query and sorting", async () => {
    const { router } = mount(
      "assignedTo=me&status=TODO&status=IN_PROGRESS&priority=HIGH&q=login&sort=dueDate,asc&page=2",
    );
    await screen.findByRole("region", { name: "Bacheca issue" });
    await userEvent.click(
      screen.getByRole("button", { name: "Rimuovi filtro Stato: Da fare" }),
    );
    const query = new URLSearchParams(router.state.location.search);
    expect(query.getAll("status")).toEqual(["IN_PROGRESS"]);
    expect(query.get("assignedTo")).toBe("me");
    expect(query.get("priority")).toBe("HIGH");
    expect(query.get("q")).toBe("login");
    expect(query.get("sort")).toBe("dueDate,asc");
    expect(query.has("page")).toBe(false);
  });
  it("recovers an out-of-range archive page without dropping repeated filters or sort", async () => {
    vi.mocked(issueApi.list).mockResolvedValue({
      items: [],
      page: 999,
      size: 50,
      totalElements: 21,
      totalPages: 1,
    });
    const { router } = mount(
      "page=999&size=50&q=login&status=TODO&status=IN_PROGRESS&sort=dueDate,asc",
      true,
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
  it("preserves archive filters across pagination and resets the page on size or sorting changes", async () => {
    vi.mocked(issueApi.list).mockResolvedValue({
      items: [
        {
          ...issue,
          archived: true,
          archivedAt: issue.createdAt,
          archivedBy: issue.reporter,
        },
      ],
      page: 1,
      size: 20,
      totalElements: 60,
      totalPages: 3,
    });
    const { router } = mount(
      "page=1&status=TODO&status=IN_PROGRESS&q=login",
      true,
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Successiva" }),
    );
    let query = new URLSearchParams(router.state.location.search);
    expect(query.get("page")).toBe("2");
    expect(query.getAll("status")).toEqual(["TODO", "IN_PROGRESS"]);
    await choose("Per pagina", "50");
    query = new URLSearchParams(router.state.location.search);
    expect(query.has("page")).toBe(false);
    expect(query.get("size")).toBe("50");
    expect(query.get("q")).toBe("login");
    await choose("Ordina issue", "Titolo");
    query = new URLSearchParams(router.state.location.search);
    expect(query.get("sort")).toBe("title,desc");
    expect(query.getAll("status")).toEqual(["TODO", "IN_PROGRESS"]);
    expect(query.get("size")).toBe("50");
  });
  it.each([false, true])(
    "uses the priority default and preserves filters when choosing direction and field (archive: %s)",
    async (archived) => {
      const { router } = mount(
        "assignedTo=me&status=TODO&status=IN_PROGRESS&priority=HIGH&q=login&size=50&page=2",
        archived,
      );
      await screen.findByRole("button", { name: "Ordina issue: Priorità" });
      expect(
        screen.getByRole("button", {
          name: "Direzione ordinamento: Più alta prima",
        }),
      ).toBeInTheDocument();
      await waitFor(() => expect(issueApi.list).toHaveBeenCalled());
      expect(
        new URLSearchParams(vi.mocked(issueApi.list).mock.calls[0][0]).get(
          "sort",
        ),
      ).toBe("priority,desc");
      expect(
        new URLSearchParams(router.state.location.search).has("sort"),
      ).toBe(false);
      await choose("Direzione ordinamento", "Più bassa prima");
      let query = new URLSearchParams(router.state.location.search);
      expect(query.get("sort")).toBe("priority,asc");
      expect(query.has("page")).toBe(false);
      await choose("Ordina issue", "Data creazione");
      expect(
        screen.getByRole("button", {
          name: "Direzione ordinamento: Meno recenti prima",
        }),
      ).toBeInTheDocument();
      expect(
        new URLSearchParams(router.state.location.search).get("sort"),
      ).toBe("createdAt,asc");
      await choose("Direzione ordinamento", "Più recenti prima");
      query = new URLSearchParams(router.state.location.search);
      expect(query.get("sort")).toBe("createdAt,desc");
      expect(query.getAll("status")).toEqual(["TODO", "IN_PROGRESS"]);
      expect(query.get("assignedTo")).toBe("me");
      expect(query.get("priority")).toBe("HIGH");
      expect(query.get("q")).toBe("login");
      expect(query.get("size")).toBe("50");
      await waitFor(() =>
        expect(
          vi.mocked(issueApi.list).mock.calls.some(([request]) => {
            const params = new URLSearchParams(request);
            return (
              params.get("sort") === "createdAt,desc" &&
              params.get("archived") === String(archived)
            );
          }),
        ).toBe(true),
      );
    },
  );

  it.each([
    [
      "updatedAt,asc",
      "Data modifica",
      "Meno recenti prima",
      "Più recenti prima",
      "updatedAt,desc",
    ],
    [
      "lastActivityAt,desc",
      "Ultima attività",
      "Più recenti prima",
      "Meno recenti prima",
      "lastActivityAt,asc",
    ],
    [
      "dueDate,desc",
      "Scadenza",
      "Più lontane prima",
      "Più vicine prima",
      "dueDate,asc",
    ],
    ["title,desc", "Titolo", "Z → A", "A → Z", "title,asc"],
    [
      "number,asc",
      "Numero issue",
      "Più basso prima",
      "Più alto prima",
      "number,desc",
    ],
  ])(
    "represents external sort %s without rewriting it and changes only its direction",
    async (sort, field, direction, nextDirection, nextSort) => {
      const { router } = mount(
        `sort=${sort}&q=login&status=TODO&status=IN_PROGRESS`,
      );
      await screen.findByRole("button", { name: `Ordina issue: ${field}` });
      expect(
        screen.getByRole("button", {
          name: `Direzione ordinamento: ${direction}`,
        }),
      ).toBeInTheDocument();
      expect(
        new URLSearchParams(router.state.location.search).get("sort"),
      ).toBe(sort);
      await choose("Direzione ordinamento", nextDirection);
      const query = new URLSearchParams(router.state.location.search);
      expect(query.get("sort")).toBe(nextSort);
      expect(query.get("q")).toBe("login");
      expect(query.getAll("status")).toEqual(["TODO", "IN_PROGRESS"]);
    },
  );
  it("keeps the archive read-only and exposes archival provenance", async () => {
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
    await screen.findByRole("link", { name: "BB-42 · Problema da verificare" });
    expect(
      screen.queryByRole("link", { name: "Nuova issue" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Archiviata il 07\/10\/2026 00:30 da Giulia/),
    ).toBeInTheDocument();
    expect(vi.mocked(issueApi.list).mock.calls[0][0]).toContain(
      "archived=true",
    );
    expect(
      screen.queryByRole("region", { name: "Bacheca issue" }),
    ).not.toBeInTheDocument();
  });
});
