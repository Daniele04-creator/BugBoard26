import { StrictMode, useRef, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import type { IssueDetail, UserRole } from "../../api/types";
import { ApiError, NetworkError } from "../../api/ApiClient";
import { IssueBoard } from "./IssueBoard";
import { issueApi } from "./issueApi";
import { useIssueBoardMove } from "./useIssueBoardMove";

const auth = vi.hoisted(() => ({
  user: { id: "admin", role: "ADMIN" as UserRole },
}));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("./issueApi", () => ({
  issueApi: {
    list: vi.fn(),
    detail: vi.fn(),
    command: vi.fn(),
    suggestions: vi.fn(),
    candidates: vi.fn(),
  },
}));
const assignee = {
  id: "member",
  displayName: "Giulia",
  role: "MEMBER" as const,
  active: true,
};
const issue: IssueDetail = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  number: 42,
  title: "Errore salvataggio",
  description: "Passaggi riproducibili",
  type: "BUG",
  status: "IN_PROGRESS",
  priority: "HIGH",
  reporter: assignee,
  assignee,
  labels: [],
  dueDate: null,
  archived: false,
  archivedAt: null,
  archivedBy: null,
  createdAt: "2026-10-09T10:00:00Z",
  updatedAt: "2026-10-09T10:00:00Z",
  lastActivityAt: "2026-10-09T10:00:00Z",
  resolvedAt: null,
  duplicateOf: null,
  hasImage: false,
  version: 3,
  cycleStartedAt: "2026-10-09T10:00:00Z",
  image: null,
  permissions: {
    canEdit: true,
    canComment: true,
    canChangeState: true,
    canAssign: true,
    canSetDeadline: true,
    canDuplicate: true,
    canUndoDuplicate: false,
    canArchive: true,
    canRestore: false,
    allowedStateTargets: ["TODO", "RESOLVED"],
  },
};
let server: IssueDetail;
const page = (items = [server]) => ({
  items,
  page: 0,
  size: 100,
  totalElements: items.length,
  totalPages: items.length ? 1 : 0,
});
const openIssue = vi.fn((event: React.MouseEvent<HTMLAnchorElement>) =>
  event.preventDefault(),
);
function Board() {
  const board = useRef<HTMLDivElement>(null);
  const rows = useQuery({
    queryKey: ["issues", "list", "board-test"],
    queryFn: () => issueApi.list(""),
  });
  return (
    rows.data && (
      <IssueBoard
        issues={rows.data.items}
        boardRef={board}
        onOpenIssue={openIssue}
        linkState={{ returnTo: "/issues?assignedTo=me&priority=HIGH" }}
      />
    )
  );
}
function mount() {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(cache, "invalidateQueries");
  const result = render(
    <StrictMode>
      <QueryClientProvider client={cache}>
        <MemoryRouter>
          <Board />
        </MemoryRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
  return { ...result, cache, invalidate };
}
function bounds(
  left: number,
  top: number,
  width: number,
  height: number,
): DOMRect {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    x: left,
    y: top,
    toJSON: () => ({}),
  };
}
async function ready() {
  const region = await screen.findByRole("region", { name: "Bacheca issue" });
  vi.spyOn(region, "getBoundingClientRect").mockReturnValue(
    bounds(0, 100, 1000, 500),
  );
  const columns = [
    ...region.querySelectorAll<HTMLElement>("[data-board-status]"),
  ];
  columns.forEach((column, index) =>
    vi
      .spyOn(column, "getBoundingClientRect")
      .mockReturnValue(bounds(index * 250, 100, 250, 500)),
  );
  return region;
}
function pointer(
  target: Element | Document,
  type: "pointerDown" | "pointerMove" | "pointerUp" | "pointerCancel",
  x: number,
  y = 250,
  pointerType = "mouse",
) {
  fireEvent[type](target, {
    pointerId: 1,
    isPrimary: true,
    pointerType,
    button: 0,
    clientX: x,
    clientY: y,
  });
}
async function startDrag(x = 630, target?: Element, pointerType = "mouse") {
  const handle = target ?? screen.getByRole("button", { name: "Sposta BB-42" });
  pointer(handle, "pointerDown", 300, 250, pointerType);
  pointer(document, "pointerMove", x, 250, pointerType);
  await waitFor(() => expect(issueApi.detail).toHaveBeenCalled());
  return handle;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  vi.resetAllMocks();
  auth.user = { id: "admin", role: "ADMIN" };
  server = structuredClone(issue);
  vi.mocked(issueApi.list).mockImplementation(async () => page());
  vi.mocked(issueApi.detail).mockImplementation(async () =>
    structuredClone(server),
  );
  vi.mocked(issueApi.command).mockImplementation(async (_id, command, body) => {
    server = {
      ...server,
      version: server.version + 1,
      ...(command === "state"
        ? { status: (body as { status: IssueDetail["status"] }).status }
        : {}),
    };
    return structuredClone(server);
  });
  vi.mocked(issueApi.candidates).mockResolvedValue({
    ...page([]),
    items: [assignee],
    totalElements: 1,
    totalPages: 1,
  });
  vi.mocked(issueApi.suggestions).mockResolvedValue({
    asOf: "2026-10-09T10:00:00Z",
    candidates: [
      { user: assignee, rank: 1, openIssueCount: 2, reason: "Carico minore" },
    ],
  });
  class TestPointerEvent extends MouseEvent {
    pointerId: number;
    pointerType: string;
    isPrimary: boolean;
    constructor(type: string, options: PointerEventInit = {}) {
      super(type, options);
      this.pointerId = options.pointerId ?? 1;
      this.pointerType = options.pointerType ?? "mouse";
      this.isPrimary = options.isPrimary ?? true;
    }
  }
  vi.stubGlobal("PointerEvent", TestPointerEvent);
});

describe("issue board movement", () => {
  it("limits each column independently while retaining complete status counts", async () => {
    const rows = (["TODO", "IN_PROGRESS"] as const).flatMap((status) =>
      Array.from({ length: 60 }, (_, index) => ({
        ...issue, id: `${status}-${index}`, number: index, status,
      })),
    );
    vi.mocked(issueApi.list).mockResolvedValue(page(rows));
    mount();
    await ready();
    const todo = screen.getByRole("region", { name: "Da fare: 60 issue" });
    const inProgress = screen.getByRole("region", { name: "In corso: 60 issue" });
    expect(within(todo).getAllByRole("link")).toHaveLength(50);
    expect(within(inProgress).getAllByRole("link")).toHaveLength(50);
    await userEvent.click(
      within(todo).getByRole("button", { name: "Mostra altre 10 issue in Da fare" }),
    );
    expect(within(todo).getAllByRole("link")).toHaveLength(60);
    expect(within(inProgress).getAllByRole("link")).toHaveLength(50);
  });

  it("renders fifty cards per column, reveals every result in order and retains the limit on refetch", async () => {
    const rows = Array.from({ length: 121 }, (_, index) => ({
      ...issue,
      id: `issue-${index}`,
      number: index,
    }));
    vi.mocked(issueApi.list).mockResolvedValue(page(rows));
    const { cache } = mount();
    const board = await ready();
    const frames = vi.spyOn(window, "requestAnimationFrame");
    const column = screen.getByRole("region", { name: "In corso: 121 issue" });
    const visibleCards = (count: number) => {
      const links = within(column).getAllByRole("link");
      expect(links).toHaveLength(count);
      return links;
    };
    visibleCards(50);
    const more = column.querySelector<HTMLButtonElement>(".board-load-more")!;
    expect(more).toHaveAccessibleName("Mostra altre 50 issue in In corso");
    await userEvent.click(more);
    visibleCards(100);
    const firstAdded = column.querySelector('a[data-issue-id="issue-50"]');
    expect(firstAdded).toHaveAccessibleName("BB-50 · Errore salvataggio");
    await waitFor(() => expect(firstAdded).toHaveFocus());
    await act(async () => {
      cache.setQueryData(["issues", "list", "board-test"], page([...rows]));
    });
    visibleCards(100);
    expect(more).toHaveAccessibleName("Mostra altre 21 issue in In corso");
    await userEvent.click(more);
    const allCards = visibleCards(121);
    expect(allCards.map((link) => link.dataset.issueId)).toEqual(rows.map((row) => row.id));
    for (const link of allCards)
      expect(link).toHaveAttribute("href", `/issues/${link.dataset.issueId}`);
    expect(board.querySelector(".board-load-more")).toBeNull();
    expect(frames).not.toHaveBeenCalled();
    frames.mockRestore();
  });

  it("clears pending focus when a refreshed result removes the newly revealed card", async () => {
    const rows = Array.from({ length: 60 }, (_, index) => ({
      ...issue, id: `issue-${index}`, number: index,
    }));
    function ChangingBoard() {
      const board = useRef<HTMLDivElement>(null);
      const [currentRows, setRows] = useState(rows);
      return (
        <div onClick={(event) => {
          if ((event.target as Element).closest(".board-load-more"))
            setRows(rows.filter((row) => row.id !== "issue-50"));
        }}>
          <button onClick={() => setRows(rows)}>Aggiorna bacheca</button>
          <IssueBoard
            issues={currentRows}
            boardRef={board}
            onOpenIssue={openIssue}
            linkState={{ returnTo: "/issues" }}
          />
        </div>
      );
    }
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter><ChangingBoard /></MemoryRouter>
      </QueryClientProvider>,
    );
    const board = screen.getByRole("region", { name: "Bacheca issue" });
    await userEvent.click(screen.getByRole("button", {
      name: "Mostra altre 10 issue in In corso",
    }));
    expect(board).toHaveFocus();
    expect(within(board).queryByRole("link", {
      name: "BB-50 · Errore salvataggio",
    })).toBeNull();
    const refresh = screen.getByRole("button", { name: "Aggiorna bacheca" });
    await userEvent.click(refresh);
    expect(within(board).getByRole("link", {
      name: "BB-50 · Errore salvataggio",
    })).toBeInTheDocument();
    expect(refresh).toHaveFocus();
  });

  it("keeps a moved card mounted and restores keyboard focus beyond the destination batch", async () => {
    const destinationRows = Array.from({ length: 60 }, (_, index) => ({
      ...issue,
      id: `resolved-${index}`,
      number: index + 100,
      status: "RESOLVED" as const,
    }));
    vi.mocked(issueApi.list).mockImplementation(async () =>
      page([...destinationRows, server]),
    );
    mount();
    await ready();
    const frames = vi.spyOn(window, "requestAnimationFrame");
    expect(within(screen.getByRole("region", { name: "Risolta: 60 issue" }))
      .getAllByRole("link")).toHaveLength(50);
    await userEvent.click(screen.getByRole("button", { name: "Sposta BB-42" }));
    await userEvent.click(await screen.findByRole("button", { name: /^Destinazione/ }));
    await userEvent.click(screen.getByRole("option", { name: "Risolta" }));
    await userEvent.click(screen.getByRole("button", { name: "Sposta" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Sposta BB-42" })).toHaveFocus(),
    );
    expect(within(screen.getByRole("region", { name: "Risolta: 61 issue" }))
      .getAllByRole("link")).toHaveLength(61);
    expect(frames).not.toHaveBeenCalled();
    frames.mockRestore();
  });

  it("focuses the board after the final refreshed result removes a moved issue", async () => {
    vi.mocked(issueApi.list).mockImplementation(async () =>
      page(server.status === "IN_PROGRESS" ? [server] : []),
    );
    mount();
    const board = await ready();
    await userEvent.click(screen.getByRole("button", { name: "Sposta BB-42" }));
    await userEvent.click(await screen.findByRole("button", { name: /^Destinazione/ }));
    await userEvent.click(screen.getByRole("option", { name: "Risolta" }));
    await userEvent.click(screen.getByRole("button", { name: "Sposta" }));
    await waitFor(() => expect(within(board).queryAllByRole("link")).toHaveLength(0));
    expect(board).toHaveFocus();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("restores focus to a newer server version even if its status changed again", async () => {
    vi.mocked(issueApi.list).mockImplementation(async () =>
      page([server.status === "RESOLVED"
        ? { ...server, version: server.version + 1, status: "TODO" }
        : server]),
    );
    mount();
    await ready();
    await userEvent.click(screen.getByRole("button", { name: "Sposta BB-42" }));
    await userEvent.click(await screen.findByRole("button", { name: /^Destinazione/ }));
    await userEvent.click(screen.getByRole("option", { name: "Risolta" }));
    await userEvent.click(screen.getByRole("button", { name: "Sposta" }));
    const column = await screen.findByRole("region", { name: "Da fare: 1 issue" });
    await waitFor(() => expect(within(column)
      .getByRole("button", { name: "Sposta BB-42" })).toHaveFocus());
  });

  it.each(["VIEWER", "MEMBER"] as UserRole[])(
    "does not load details or expose commands for a %s on somebody else's issue",
    async (role) => {
      auth.user = { id: "another-user", role };
      mount();
      await ready();
      expect(
        screen.queryByRole("button", { name: "Sposta BB-42" }),
      ).not.toBeInTheDocument();
      expect(issueApi.detail).not.toHaveBeenCalled();
      const link = screen.getByRole("link", {
        name: "BB-42 · Errore salvataggio",
      });
      pointer(link, "pointerDown", 300);
      pointer(document, "pointerMove", 630);
      pointer(document, "pointerUp", 630);
      await userEvent.click(link);
      expect(openIssue).toHaveBeenCalledOnce();
      expect(issueApi.command).not.toHaveBeenCalled();
    },
  );

  it("lets the assigned member choose only server-authorized normal states using the same handle", async () => {
    auth.user = { id: assignee.id, role: "MEMBER" };
    const { invalidate } = mount();
    await ready();
    expect(issueApi.detail).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Sposta BB-42" }));
    await screen.findByRole("button", { name: /^Destinazione/ });
    await userEvent.click(
      screen.getByRole("button", { name: /^Destinazione/ }),
    );
    expect(
      screen.queryByRole("option", { name: "Duplicata" }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("option", { name: "Risolta" }));
    await userEvent.click(screen.getByRole("button", { name: "Sposta" }));
    await waitFor(() =>
      expect(issueApi.command).toHaveBeenCalledWith(
        issue.id,
        "state",
        { status: "RESOLVED" },
        3,
      ),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["issues"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["reporting"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["notifications"] });
    expect(openIssue).not.toHaveBeenCalled();
  });

  it("drags the card body with a threshold, highlights permitted columns and waits for the server before moving", async () => {
    const saving = deferred<IssueDetail>();
    vi.mocked(issueApi.command).mockReturnValue(saving.promise);
    mount();
    await ready();
    const link = screen.getByRole("link", {
      name: "BB-42 · Errore salvataggio",
    });
    pointer(link, "pointerDown", 300);
    pointer(document, "pointerMove", 304);
    expect(issueApi.detail).not.toHaveBeenCalled();
    pointer(document, "pointerMove", 630);
    await waitFor(() =>
      expect(
        document.querySelector('[data-board-status="RESOLVED"]'),
      ).toHaveClass("board-drop-allowed"),
    );
    expect(document.querySelector(".board-drag-preview")).toBeInTheDocument();
    pointer(document, "pointerUp", 630);
    pointer(document, "pointerUp", 630);
    await waitFor(() => expect(issueApi.command).toHaveBeenCalledOnce());
    expect(
      within(
        screen.getByRole("region", { name: "In corso: 1 issue" }),
      ).getByRole("link"),
    ).toBeInTheDocument();
    fireEvent.click(link);
    expect(openIssue).not.toHaveBeenCalled();
    server = { ...server, status: "RESOLVED", version: 4 };
    await act(async () => saving.resolve(structuredClone(server)));
    await waitFor(() =>
      expect(
        screen.getByRole("region", { name: "Risolta: 1 issue" }),
      ).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Sposta BB-42" }),
      ).toHaveFocus(),
    );
    pointer(screen.getByRole("link"), "pointerDown", 630);
    fireEvent.click(screen.getByRole("link"));
    expect(openIssue).toHaveBeenCalledOnce();
  });

  it("preserves touch scrolling on the card and supports touch dragging only from the handle", async () => {
    mount();
    await ready();
    const link = screen.getByRole("link");
    pointer(link, "pointerDown", 300, 250, "touch");
    pointer(document, "pointerMove", 630, 250, "touch");
    pointer(document, "pointerUp", 630, 250, "touch");
    expect(issueApi.detail).not.toHaveBeenCalled();
    await startDrag(630, undefined, "touch");
    pointer(document, "pointerUp", 630, 250, "touch");
    await waitFor(() => expect(issueApi.command).toHaveBeenCalledOnce());
  });

  it("treats a same-column drop as no change and does not swallow a later intentional click", async () => {
    mount();
    await ready();
    await startDrag(340);
    pointer(document, "pointerUp", 340);
    await waitFor(() =>
      expect(
        document.querySelector(".board-card-moving"),
      ).not.toBeInTheDocument(),
    );
    expect(issueApi.command).not.toHaveBeenCalled();
    expect(issueApi.detail).toHaveBeenCalledOnce();
    const link = screen.getByRole("link");
    pointer(link, "pointerDown", 340);
    pointer(document, "pointerUp", 340);
    fireEvent.click(link);
    expect(openIssue).toHaveBeenCalledOnce();
  });

  it("aborts an in-flight lazy permission check on Escape and removes document listeners on unmount", async () => {
    const loading = deferred<IssueDetail>();
    vi.mocked(issueApi.detail).mockReturnValue(loading.promise);
    const { unmount } = mount();
    await ready();
    await startDrag();
    const signal = vi.mocked(issueApi.detail).mock.calls[0][1];
    fireEvent.keyDown(document, { key: "Escape" });
    expect(signal?.aborted).toBe(true);
    expect(document.body).not.toHaveClass("issue-board-dragging");
    await act(async () => loading.resolve(structuredClone(server)));
    pointer(document, "pointerUp", 630);
    expect(issueApi.command).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await startDrag();
    const secondSignal = vi.mocked(issueApi.detail).mock.calls.at(-1)![1];
    unmount();
    expect(secondSignal?.aborted).toBe(true);
    expect(document.body).not.toHaveClass("issue-board-dragging");
    pointer(document, "pointerMove", 800);
    pointer(document, "pointerUp", 800);
    expect(
      document.querySelector(".board-drag-preview"),
    ).not.toBeInTheDocument();
    expect(issueApi.command).not.toHaveBeenCalled();
  });

  it.each(["version", "permissions"])(
    "blocks a drop if fresh %s changed since drag start",
    async (change) => {
      mount();
      await ready();
      await startDrag();
      await waitFor(() =>
        expect(
          document.querySelector('[data-board-status="RESOLVED"]'),
        ).toHaveClass("board-drop-allowed"),
      );
      server =
        change === "version"
          ? { ...server, version: 4 }
          : {
              ...server,
              permissions: {
                ...server.permissions,
                canChangeState: false,
                allowedStateTargets: [],
                canDuplicate: false,
              },
            };
      pointer(document, "pointerUp", 630);
      await waitFor(() =>
        expect(document.querySelector(".board-card")).not.toHaveClass(
          "board-card-moving",
        ),
      );
      expect(issueApi.command).not.toHaveBeenCalled();
      expect(screen.getAllByText(/Bacheca aggiornata:/).length).toBeGreaterThan(
        0,
      );
    },
  );

  it("refreshes a stale card at drag start and requires a new gesture", async () => {
    mount();
    await ready();
    server = { ...server, status: "RESOLVED", version: 4 };
    await startDrag(800);
    pointer(document, "pointerUp", 800);
    await waitFor(() =>
      expect(
        screen.getByRole("region", { name: "Risolta: 1 issue" }),
      ).toBeInTheDocument(),
    );
    expect(issueApi.command).not.toHaveBeenCalled();
  });

  it.each([
    new NetworkError(false),
    new ApiError({
      type: "about:blank",
      title: "Conflict",
      status: 409,
      detail: "Versione superata",
      instance: "",
      code: "CONFLICT",
      requestId: "",
      fieldErrors: [],
    }),
  ])(
    "reloads the real position after a failed command: %s",
    async (problem) => {
      vi.mocked(issueApi.command).mockImplementation(async () => {
        server = { ...server, status: "TODO", version: 4 };
        throw problem;
      });
      mount();
      await ready();
      await startDrag();
      pointer(document, "pointerUp", 630);
      await waitFor(() =>
        expect(
          screen.getByRole("region", { name: "Da fare: 1 issue" }),
        ).toBeInTheDocument(),
      );
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(issueApi.command).toHaveBeenCalledOnce();
      expect(
        screen.getByRole("region", { name: "Risolta: 0 issue" }),
      ).toBeInTheDocument();
    },
  );

  it("opens canonical selection when dropped into Duplicata, without sending an automatic command", async () => {
    mount();
    await ready();
    await startDrag(880);
    pointer(document, "pointerUp", 880);
    const dialog = await screen.findByRole("dialog", {
      name: "Segna duplicato BB-42",
    });
    expect(
      within(dialog).getByLabelText(
        "Cerca issue canonica nel titolo o nella descrizione",
      ),
    ).toBeInTheDocument();
    expect(issueApi.command).not.toHaveBeenCalled();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Annulla" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(server.status).toBe("IN_PROGRESS");
  });

  it("requires explicit undo confirmation to move a duplicate to Da fare", async () => {
    server = {
      ...server,
      status: "DUPLICATE",
      duplicateOf: { id: "canonical", number: 10, title: "Issue originale" },
      permissions: {
        ...server.permissions,
        canChangeState: false,
        allowedStateTargets: [],
        canDuplicate: false,
        canUndoDuplicate: true,
      },
    };
    vi.mocked(issueApi.command).mockImplementation(
      async (_id, command, body, version) => {
        expect(command).toBe("duplicate");
        expect(body).toEqual({ targetIssueId: null });
        expect(version).toBe(3);
        server = { ...server, status: "TODO", duplicateOf: null, version: 4 };
        return server;
      },
    );
    mount();
    await ready();
    await startDrag(100);
    pointer(document, "pointerUp", 100);
    const dialog = await screen.findByRole("dialog", {
      name: "Annulla duplicazione BB-42",
    });
    expect(issueApi.command).not.toHaveBeenCalled();
    await userEvent.click(
      within(dialog).getByRole("button", {
        name: "Annulla duplicazione",
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("region", { name: "Da fare: 1 issue" }),
      ).toBeInTheDocument(),
    );
    expect(issueApi.command).toHaveBeenCalledOnce();
  });

  it("asks for an assignee before moving an unassigned issue, then verifies the new version and permissions", async () => {
    server = {
      ...server,
      status: "TODO",
      assignee: null,
      permissions: { ...server.permissions, allowedStateTargets: [] },
    };
    vi.mocked(issueApi.command).mockImplementation(
      async (_id, command, body, version) => {
        if (command === "assignment") {
          expect(body).toEqual({ assigneeId: assignee.id });
          expect(version).toBe(3);
          server = {
            ...server,
            assignee,
            version: 4,
            permissions: {
              ...server.permissions,
              allowedStateTargets: ["IN_PROGRESS", "RESOLVED"],
            },
          };
        } else {
          expect(body).toEqual({ status: "RESOLVED" });
          expect(version).toBe(4);
          server = { ...server, status: "RESOLVED", version: 5 };
        }
        return structuredClone(server);
      },
    );
    mount();
    await ready();
    await startDrag();
    pointer(document, "pointerUp", 630);
    const dialog = await screen.findByRole("dialog", { name: "Assegna BB-42" });
    expect(issueApi.command).not.toHaveBeenCalled();
    await userEvent.click(
      await within(dialog).findByRole("radio", { name: /Giulia/ }),
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Conferma assegnazione" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("region", { name: "Risolta: 1 issue" }),
      ).toBeInTheDocument(),
    );
    expect(issueApi.command).toHaveBeenCalledTimes(2);
    expect(issueApi.detail).toHaveBeenCalledTimes(3);
  });

  it("honors reduced motion when jumping between mobile columns", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })),
    );
    mount();
    const board = await ready();
    const scrollTo = vi.fn();
    Object.defineProperty(board, "scrollTo", { value: scrollTo });
    await userEvent.click(
      within(
        screen.getByRole("navigation", { name: "Colonne bacheca" }),
      ).getByRole("button", { name: /Risolta/ }),
    );
    expect(scrollTo).toHaveBeenCalledWith({ left: 0, behavior: "auto" });
    expect(
      screen.getByRole("region", { name: "Risolta: 0 issue" }),
    ).toHaveFocus();
  });

  it("allows only one command if pointer and dialog submit concurrently while detail is loading", async () => {
    const loading = deferred<IssueDetail>();
    vi.mocked(issueApi.detail).mockReturnValueOnce(loading.promise);
    const cache = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { result } = renderHook(() => useIssueBoardMove(vi.fn()), {
      wrapper: ({ children }) => (
        <StrictMode>
          <QueryClientProvider client={cache}>{children}</QueryClientProvider>
        </StrictMode>
      ),
    });
    act(() => {
      void result.current.prepare(server, "drag");
    });
    let first!: Promise<void>, second!: Promise<void>;
    act(() => {
      first = result.current.move("RESOLVED");
      second = result.current.move("RESOLVED");
    });
    await act(async () => {
      loading.resolve(structuredClone(server));
      await Promise.all([first, second]);
    });
    expect(issueApi.command).toHaveBeenCalledOnce();
    expect(issueApi.command).toHaveBeenCalledWith(
      issue.id,
      "state",
      { status: "RESOLVED" },
      3,
    );
  });

  it.each(["success", "network-error"])(
    "invalidates server data when a pending command completes after unmount: %s",
    async (outcome) => {
      const saving = deferred<IssueDetail>();
      vi.mocked(issueApi.command).mockReturnValue(saving.promise);
      const cache = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      const invalidate = vi.spyOn(cache, "invalidateQueries");
      const restore = vi.fn();
      const { result, unmount } = renderHook(() => useIssueBoardMove(restore), {
        wrapper: ({ children }) => (
          <QueryClientProvider client={cache}>{children}</QueryClientProvider>
        ),
      });
      await act(async () => {
        await result.current.prepare(server, "drag");
      });
      let moving!: Promise<void>;
      act(() => {
        moving = result.current.move("RESOLVED");
      });
      await waitFor(() => expect(issueApi.command).toHaveBeenCalledOnce());
      unmount();
      server = { ...server, status: "RESOLVED", version: 4 };
      if (outcome === "success") saving.resolve(server);
      else saving.reject(new NetworkError(false));
      await moving;
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["issues"] });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["reporting"] });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["notifications"] });
      if (outcome === "success")
        expect(cache.getQueryData(["issues", "detail", issue.id])).toEqual(
          server,
        );
      expect(restore).not.toHaveBeenCalled();
    },
  );

  it("invalidates a resumed state command after unmount without restoring focus", async () => {
    server = {
      ...server,
      status: "TODO",
      assignee: null,
      permissions: { ...server.permissions, allowedStateTargets: [] },
    };
    const saving = deferred<IssueDetail>();
    vi.mocked(issueApi.command).mockReturnValue(saving.promise);
    const cache = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidate = vi.spyOn(cache, "invalidateQueries");
    const restore = vi.fn();
    const { result, unmount } = renderHook(() => useIssueBoardMove(restore), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={cache}>{children}</QueryClientProvider>
      ),
    });
    await act(async () => {
      await result.current.prepare(server, "drag");
    });
    await act(async () => {
      await result.current.move("RESOLVED");
    });
    expect(result.current.command?.command).toBe("assignment");
    server = {
      ...server,
      assignee,
      version: 4,
      permissions: {
        ...server.permissions,
        allowedStateTargets: ["IN_PROGRESS", "RESOLVED"],
      },
    };
    act(() => {
      result.current.commandSaved(server);
      result.current.commandClosed();
    });
    await waitFor(() =>
      expect(issueApi.command).toHaveBeenCalledWith(
        issue.id,
        "state",
        { status: "RESOLVED" },
        4,
      ),
    );
    invalidate.mockClear();
    unmount();
    server = { ...server, status: "RESOLVED", version: 5 };
    saving.resolve(server);
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["notifications"] }),
    );
    expect(cache.getQueryData(["issues", "detail", issue.id])).toEqual(server);
    expect(restore).not.toHaveBeenCalled();
  });

  it.each(["version", "permissions"])(
    "keeps the completed assignment but does not resume if %s changed again",
    async (change) => {
      server = {
        ...server,
        status: "TODO",
        assignee: null,
        permissions: { ...server.permissions, allowedStateTargets: [] },
      };
      const cache = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      const { result } = renderHook(() => useIssueBoardMove(vi.fn()), {
        wrapper: ({ children }) => (
          <QueryClientProvider client={cache}>{children}</QueryClientProvider>
        ),
      });
      await act(async () => {
        await result.current.prepare(server, "drag");
      });
      await act(async () => {
        await result.current.move("RESOLVED");
      });
      const assigned = { ...server, assignee, version: 4 };
      server =
        change === "version"
          ? {
              ...assigned,
              version: 5,
              permissions: {
                ...assigned.permissions,
                allowedStateTargets: ["RESOLVED"],
              },
            }
          : {
              ...assigned,
              permissions: {
                ...assigned.permissions,
                canChangeState: false,
                allowedStateTargets: [],
              },
            };
      act(() => {
        result.current.commandSaved(assigned);
        result.current.commandClosed();
      });
      await waitFor(() => expect(result.current.session).toBeNull());
      expect(issueApi.command).not.toHaveBeenCalled();
      expect(result.current.notice).toMatch(/Responsabile assegnato/);
      expect(server.assignee).toEqual(assignee);
      expect(server.status).toBe("TODO");
    },
  );

  it("opens the accessible alternative by keyboard and restores focus when cancelled", async () => {
    mount();
    await ready();
    const handle = screen.getByRole("button", { name: "Sposta BB-42" });
    handle.focus();
    await userEvent.keyboard("{Enter}");
    const dialog = await screen.findByRole("dialog", { name: "Sposta BB-42" });
    await screen.findByRole("button", { name: /^Destinazione/ });
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(handle).toHaveFocus());
    expect(issueApi.command).not.toHaveBeenCalled();
    expect(openIssue).not.toHaveBeenCalled();
  });

  it("clears an invalid initial drag immediately instead of leaving a preview behind", async () => {
    mount();
    await ready();
    server = { ...server, version: 4 };
    await startDrag();
    await waitFor(() =>
      expect(document.body).not.toHaveClass("issue-board-dragging"),
    );
    expect(
      document.querySelector(".board-drag-preview"),
    ).not.toBeInTheDocument();
    expect(
      screen
        .getByText(/è cambiata. Bacheca aggiornata:/, {
          selector: ".alert-content",
        })
        .closest(".alert"),
    ).toHaveClass("alert-warning");
    expect(issueApi.command).not.toHaveBeenCalled();
  });

  it("expires click suppression after a cancelled drag even without a later pointerdown", async () => {
    mount();
    await ready();
    await startDrag();
    fireEvent.keyDown(document, { key: "Escape" });
    const now = Date.now();
    const time = vi.spyOn(Date, "now").mockReturnValue(now + 600);
    try {
      fireEvent.click(screen.getByRole("link"));
      expect(openIssue).toHaveBeenCalledOnce();
      expect(issueApi.command).not.toHaveBeenCalled();
    } finally {
      time.mockRestore();
    }
  });
});
