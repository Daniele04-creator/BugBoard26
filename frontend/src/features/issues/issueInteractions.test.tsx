import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { IssueDetail } from "../../api/types";
import { ApiError, NetworkError } from "../../api/ApiClient";
import { IssueEditor } from "./IssueEditor";
import { IssueCommandDialog } from "./IssueCommandDialog";
import { IssueDiscussion } from "./IssueDiscussion";
import { issueApi } from "./issueApi";
const draftStore = vi.hoisted(() => new Map<string, unknown>());
vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { id: "tester" },
    getDraft: (key: string) => draftStore.get(key),
    setDraft: (key: string, value: unknown) => draftStore.set(key, value),
    removeDraft: (key: string) => draftStore.delete(key),
  }),
}));
vi.mock("./issueApi", () => ({
  getLabels: vi.fn(async () => []),
  issueApi: {
    create: vi.fn(),
    update: vi.fn(),
    detail: vi.fn(),
    command: vi.fn(),
    comments: vi.fn(),
    comment: vi.fn(),
    history: vi.fn(),
    suggestions: vi.fn(),
    candidates: vi.fn(),
  },
}));
const issue: IssueDetail = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  number: 42,
  title: "Errore salvataggio",
  description: "Descrizione riproducibile del problema",
  type: "BUG",
  status: "IN_PROGRESS",
  priority: "HIGH",
  reporter: {
    id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    displayName: "Giulia",
    role: "MEMBER",
    active: true,
  },
  assignee: {
    id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    displayName: "Luca",
    role: "MEMBER",
    active: true,
  },
  labels: [],
  dueDate: null,
  archived: false,
  archivedAt: null,
  archivedBy: null,
  createdAt: "2026-10-06T10:00:00Z",
  updatedAt: "2026-10-06T10:00:00Z",
  lastActivityAt: "2026-10-06T10:00:00Z",
  resolvedAt: null,
  duplicateOf: null,
  hasImage: false,
  version: 3,
  cycleStartedAt: "2026-10-06T10:00:00Z",
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
    allowedStateTargets: ["TODO"],
  },
};
function mount(element: React.ReactNode) {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      { path: "/issues/new", element },
      { path: "/issues/:id", element: <h1>Issue creata</h1> },
      { path: "/issues", element: <h1>Elenco issue</h1> },
    ],
    { initialEntries: ["/issues/new"] },
  );
  return render(
    <QueryClientProvider client={cache}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  draftStore.clear();
  vi.mocked(issueApi.candidates).mockResolvedValue({
    items: [issue.assignee!],
    page: 0,
    size: 20,
    totalElements: 1,
    totalPages: 1,
  });
  vi.mocked(issueApi.comments).mockResolvedValue({
    items: [],
    page: 0,
    size: 20,
    totalElements: 0,
    totalPages: 0,
  });
  vi.mocked(issueApi.history).mockResolvedValue({
    items: [],
    page: 0,
    size: 20,
    totalElements: 0,
    totalPages: 0,
  });
});
describe("issue commands and drafts", () => {
  it("keeps the verified manual selection and current assignee visible across pages without workloads", async () => {
    vi.mocked(issueApi.suggestions).mockRejectedValue(new Error("Unavailable"));
    const first = {
      ...issue.assignee!,
      id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
      displayName: "Anna",
    };
    vi.mocked(issueApi.candidates).mockImplementation(async (_q, page) => ({
      items:
        page === 0
          ? Array.from({ length: 20 }, (_value, index) =>
              index === 0
                ? first
                : {
                    ...first,
                    id: `user-${index}`,
                    displayName: `Other ${index}`,
                  },
            )
          : [issue.assignee!],
      page,
      size: 20,
      totalElements: 21,
      totalPages: 2,
    }));
    vi.mocked(issueApi.command).mockResolvedValue({
      ...issue,
      assignee: first,
      version: 4,
    });
    mount(
      <IssueCommandDialog
        issue={issue}
        command="assignment"
        onClose={vi.fn()}
        onSaved={vi.fn()}
        onReload={vi.fn()}
      />,
    );
    const current = await screen.findByRole("radio", { name: /Luca · MEMBER/ });
    expect(current).toBeChecked();
    expect(
      screen.getByRole("radio", { name: "Nessuna assegnazione" }),
    ).not.toBeChecked();
    await userEvent.click(
      await screen.findByRole("radio", { name: /Anna · MEMBER · dddddddd/ }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Successiva" }));
    await waitFor(() =>
      expect(screen.getByText(/Pagina 2 di 2/)).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("radio", { name: /Anna · MEMBER · dddddddd/ }),
    ).toBeChecked();
    expect(
      screen.getByRole("button", { name: "Conferma assegnazione" }),
    ).toBeEnabled();
    await userEvent.click(
      screen.getByRole("button", { name: "Conferma assegnazione" }),
    );
    await waitFor(() =>
      expect(issueApi.command).toHaveBeenCalledWith(
        issue.id,
        "assignment",
        { assigneeId: first.id },
        issue.version,
      ),
    );
  });
  it("allows manual assignment when workload suggestions fail", async () => {
    vi.mocked(issueApi.suggestions).mockRejectedValue(new Error("Unavailable"));
    vi.mocked(issueApi.command).mockResolvedValue({ ...issue, version: 4 });
    mount(
      <IssueCommandDialog
        issue={{ ...issue, assignee: null }}
        command="assignment"
        onClose={vi.fn()}
        onSaved={vi.fn()}
        onReload={vi.fn()}
      />,
    );
    await screen.findByText(/Carico non disponibile\. Puoi scegliere/);
    await userEvent.click(
      await screen.findByRole("radio", { name: /Luca · MEMBER · cccccccc/ }),
    );
    const submit = screen.getByRole("button", {
      name: "Conferma assegnazione",
    });
    expect(submit).toBeEnabled();
    await userEvent.click(submit);
    await waitFor(() =>
      expect(issueApi.command).toHaveBeenCalledWith(
        issue.id,
        "assignment",
        { assigneeId: issue.assignee!.id },
        issue.version,
      ),
    );
    expect(
      screen.queryByText(/Non ci sono utenti assegnabili/),
    ).not.toBeInTheDocument();
  });
  it("searches eligible candidates independently of workload availability", async () => {
    vi.mocked(issueApi.suggestions).mockRejectedValue(new Error("Unavailable"));
    mount(
      <IssueCommandDialog
        issue={issue}
        command="assignment"
        onClose={vi.fn()}
        onSaved={vi.fn()}
        onReload={vi.fn()}
      />,
    );
    await userEvent.type(
      screen.getByLabelText("Cerca utenti per nome"),
      "Luca",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /^Cerca utenti$/ }),
    );
    await waitFor(() =>
      expect(issueApi.candidates).toHaveBeenCalledWith(
        "Luca",
        0,
        expect.any(AbortSignal),
      ),
    );
  });
  it("reports an unchanged assignment without inventing a new mutation", async () => {
    vi.mocked(issueApi.suggestions).mockRejectedValue(new Error("Unavailable"));
    vi.mocked(issueApi.command).mockResolvedValue(issue);
    const saved = vi.fn();
    mount(
      <IssueCommandDialog
        issue={issue}
        command="assignment"
        onClose={vi.fn()}
        onSaved={saved}
        onReload={vi.fn()}
      />,
    );
    await screen.findByRole("radio", { name: /Luca · MEMBER/ });
    await userEvent.click(
      screen.getByRole("button", { name: "Conferma assegnazione" }),
    );
    await waitFor(() =>
      expect(saved).toHaveBeenCalledWith(issue, "Assegnazione già presente."),
    );
  });
  it("disables a selected resolution when refreshed server capabilities remove that target", async () => {
    let refresh: ((next: IssueDetail) => void) | undefined;
    function Harness() {
      const [current, setCurrent] = useState<IssueDetail>({
        ...issue,
        permissions: {
          ...issue.permissions,
          allowedStateTargets: ["TODO", "RESOLVED"],
        },
      });
      refresh = setCurrent;
      return (
        <IssueCommandDialog
          issue={current}
          command="state"
          onClose={vi.fn()}
          onSaved={vi.fn()}
          onReload={vi.fn()}
        />
      );
    }
    mount(<Harness />);
    await userEvent.click(screen.getByRole("radio", { name: "Risolta" }));
    expect(
      screen.getByRole("button", { name: "Segna come risolta" }),
    ).toBeEnabled();
    act(() => refresh?.(issue));
    await screen.findByText(
      "Lo stato scelto non è più disponibile. Scegli un’opzione corrente.",
    );
    expect(
      screen.getByRole("button", { name: "Segna come risolta" }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("radio", { name: "Risolta" }),
    ).not.toBeInTheDocument();
    expect(issueApi.command).not.toHaveBeenCalled();
  });
  it("keeps a now read-only comment draft available to copy", async () => {
    draftStore.set(`comment:${issue.id}`, {
      body: "La bozza precedente",
      key: "a-key",
      submitted: "",
      uncertain: false,
      retryUsed: false,
    });
    mount(
      <IssueDiscussion
        issue={{
          ...issue,
          archived: true,
          permissions: { ...issue.permissions, canComment: false },
        }}
      />,
    );
    expect(screen.getByLabelText("Bozza commento conservata")).toHaveValue(
      "La bozza precedente",
    );
    expect(screen.getByLabelText("Bozza commento conservata")).toHaveAttribute(
      "readonly",
    );
    expect(
      screen.queryByRole("button", { name: "Invia commento" }),
    ).not.toBeInTheDocument();
  });
  it("prevents an expired idempotency key from creating an ambiguous duplicate", async () => {
    draftStore.set("issue:new", {
      fields: {
        title: "Creazione incerta",
        description: "Descrizione completa del problema",
        type: "BUG",
        priority: "MEDIUM",
        labelIds: [],
      },
      file: null,
      version: 0,
      key: "expired-key",
      submitted: {
        fields: {
          title: "Creazione incerta",
          description: "Descrizione completa del problema",
          type: "BUG",
          priority: "MEDIUM",
          labelIds: [],
        },
        file: null,
      },
      uncertain: true,
      retryUsed: false,
      submittedAt: Date.now() - 86_400_001,
    });
    mount(<IssueEditor />);
    expect(
      screen.getByRole("button", { name: "Riprova creazione" }),
    ).toBeDisabled();
    expect(issueApi.create).not.toHaveBeenCalled();
  });
  it("focuses an invalid form summary and lets its field link correct text without stealing focus", async () => {
    mount(<IssueEditor />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Crea issue" })).toBeEnabled(),
    );
    await userEvent.click(screen.getByRole("button", { name: "Crea issue" }));
    await waitFor(() =>
      expect(
        screen
          .getByText("Controlla i campi indicati.")
          .closest('[tabindex="-1"]'),
      ).toHaveFocus(),
    );
    await userEvent.click(
      screen.getByRole("link", {
        name: "Il titolo deve contenere da 3 a 160 caratteri.",
      }),
    );
    expect(screen.getByLabelText("Titolo *")).toHaveFocus();
    await userEvent.type(
      screen.getByLabelText("Titolo *"),
      "Titolo corretto completo",
    );
    expect(screen.getByLabelText("Titolo *")).toHaveValue(
      "Titolo corretto completo",
    );
    expect(issueApi.create).not.toHaveBeenCalled();
  });
  it("restores a draft from memory after the editor remounts", async () => {
    const first = mount(<IssueEditor />);
    await userEvent.type(
      screen.getByLabelText("Titolo *"),
      "Bozza da riprendere",
    );
    await waitFor(() =>
      expect(draftStore.get("issue:new")).toEqual(
        expect.objectContaining({
          fields: expect.objectContaining({ title: "Bozza da riprendere" }),
        }),
      ),
    );
    first.unmount();
    mount(<IssueEditor />);
    expect(screen.getByLabelText("Titolo *")).toHaveValue(
      "Bozza da riprendere",
    );
  });
  it("clears a draft only after explicit discard confirmation", async () => {
    mount(<IssueEditor />);
    await userEvent.type(
      screen.getByLabelText("Titolo *"),
      "Bozza da scartare",
    );
    await userEvent.click(screen.getByRole("link", { name: "Annulla" }));
    expect(
      screen.getByRole("dialog", { name: "Lasciare la bozza?" }),
    ).toBeInTheDocument();
    expect(draftStore.has("issue:new")).toBe(true);
    await userEvent.click(
      screen.getByRole("button", { name: "Esci senza salvare" }),
    );
    await screen.findByRole("heading", { name: "Elenco issue" });
    expect(draftStore.has("issue:new")).toBe(false);
  });
  it("offers only backend allowed transitions despite an active member assignee", async () => {
    mount(
      <IssueCommandDialog
        issue={issue}
        command="state"
        onClose={vi.fn()}
        onSaved={vi.fn()}
        onReload={vi.fn()}
      />,
    );
    expect(screen.getByRole("radio", { name: "Da fare" })).toBeInTheDocument();
    expect(
      screen.queryByRole("radio", { name: "Risolta" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salva stato" })).toBeDisabled();
    await userEvent.click(screen.getByRole("radio", { name: "Da fare" }));
    vi.mocked(issueApi.command).mockResolvedValue({ ...issue, status: "TODO" });
    await userEvent.click(screen.getByRole("button", { name: "Salva stato" }));
    expect(issueApi.command).toHaveBeenCalledWith(
      issue.id,
      "state",
      { status: "TODO" },
      3,
    );
  });
  it("preserves the exact create request and idempotency key on one explicit retry", async () => {
    vi.mocked(issueApi.create)
      .mockRejectedValueOnce(new NetworkError(true))
      .mockResolvedValueOnce(issue);
    mount(<IssueEditor />);
    await userEvent.type(
      screen.getByLabelText("Titolo *"),
      "Nuova segnalazione",
    );
    await userEvent.type(
      screen.getByLabelText("Descrizione *"),
      "Una descrizione completa del problema",
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Crea issue" })).toBeEnabled(),
    );
    await userEvent.click(screen.getByRole("button", { name: "Crea issue" }));
    await screen.findByRole("button", { name: "Riprova creazione" });
    expect(issueApi.create).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Titolo *")).toBeDisabled();
    await userEvent.click(
      screen.getByRole("button", { name: "Riprova creazione" }),
    );
    await screen.findByRole("heading", { name: "Issue creata" });
    const calls = vi.mocked(issueApi.create).mock.calls;
    expect(calls[1]).toEqual(calls[0]);
  });
  it("keeps a conflicting edit and requires comparison before another save", async () => {
    const problem = {
      type: "urn:bugboard:problem:VERSION_CONFLICT",
      title: "Conflitto",
      status: 409,
      detail: "Versione cambiata",
      instance: "/issues",
      code: "VERSION_CONFLICT",
      requestId: "",
      fieldErrors: [],
    };
    vi.mocked(issueApi.update).mockRejectedValueOnce(new ApiError(problem));
    vi.mocked(issueApi.detail).mockResolvedValue({
      ...issue,
      title: "Titolo concorrente",
      version: 4,
    });
    mount(<IssueEditor issue={issue} />);
    await userEvent.clear(screen.getByLabelText("Titolo *"));
    await userEvent.type(screen.getByLabelText("Titolo *"), "La mia bozza");
    await userEvent.click(
      screen.getByRole("button", { name: "Salva modifiche" }),
    );
    await screen.findByText("Titolo concorrente");
    expect(screen.getByLabelText("Titolo *")).toHaveValue("La mia bozza");
    expect(
      screen.getByRole("button", { name: "Salva modifiche" }),
    ).toBeDisabled();
    await userEvent.click(
      screen.getByRole("button", {
        name: "Usa la versione corrente mantenendo la bozza",
      }),
    );
    vi.mocked(issueApi.update).mockResolvedValue({ ...issue, version: 5 });
    await userEvent.click(
      screen.getByRole("button", { name: "Salva modifiche" }),
    );
    expect(issueApi.update).toHaveBeenLastCalledWith(
      issue.id,
      expect.objectContaining({ title: "La mia bozza" }),
      4,
    );
  });
  it("uses per-issue page totals after a comment with a global sequence", async () => {
    vi.mocked(issueApi.comment).mockResolvedValue({
      id: "new-comment",
      issueId: issue.id,
      author: issue.reporter,
      body: "Il mio commento",
      createdAt: issue.createdAt,
      sequence: 10001,
    });
    mount(<IssueDiscussion issue={issue} />);
    await userEvent.type(
      await screen.findByLabelText("Commento"),
      "Il mio commento",
    );
    vi.mocked(issueApi.comments).mockResolvedValue({
      items: [],
      page: 0,
      size: 20,
      totalElements: 21,
      totalPages: 2,
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Invia commento" }),
    );
    await screen.findByText("Commento inviato.");
    await waitFor(() =>
      expect(issueApi.comments).toHaveBeenCalledWith(
        issue.id,
        1,
        expect.anything(),
      ),
    );
    expect(
      vi.mocked(issueApi.comments).mock.calls.some((call) => call[1] === 500),
    ).toBe(false);
  });
});
