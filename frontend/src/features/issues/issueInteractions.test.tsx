import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import {
  focusManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import type { IssueDetail } from "../../api/types";
import { ApiError, NetworkError } from "../../api/ApiClient";
import { IssueEditor } from "./IssueEditor";
import { IssueDetailPage } from "./IssueDetailPage";
import { IssueEditPage } from "./IssueEditPage";
import { IssueListPage } from "./IssueListPage";
import { IssueCommandDialog } from "./IssueCommandDialog";
import { IssueDiscussion } from "./IssueDiscussion";
import { ImagePicker } from "./ImagePicker";
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
  getDirectory: vi.fn(async () => []),
  issueApi: {
    list: vi.fn(),
    export: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    detail: vi.fn(),
    command: vi.fn(),
    comments: vi.fn(),
    comment: vi.fn(),
    history: vi.fn(),
    suggestions: vi.fn(),
    candidates: vi.fn(),
    image: vi.fn(),
    putImage: vi.fn(),
    deleteImage: vi.fn(),
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
describe("image selection", () => {
  function ImageForm() {
    const [file, setFile] = useState<File | null>(null);
    return <ImagePicker file={file} onChange={setFile} />;
  }
  it("allows selecting the same file again immediately after removal", async () => {
    const bitmap = vi.fn(async () => ({ width: 800, height: 600, close: vi.fn() }));
    vi.stubGlobal("createImageBitmap", bitmap);
    const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview");
    const revokeUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    try {
      render(<ImageForm />);
      const user = userEvent.setup();
      const input = screen.getByLabelText("Immagine opzionale") as HTMLInputElement;
      const file = new File(["image"], "schermata.png", { type: "image/png" });
      await user.upload(input, file);
      await screen.findByAltText("Anteprima di schermata.png");
      await user.click(screen.getByRole("button", { name: "Rimuovi selezione" }));
      expect(input.files).toHaveLength(0);
      expect(screen.queryByAltText("Anteprima di schermata.png")).not.toBeInTheDocument();
      await user.upload(input, file);
      await screen.findByAltText("Anteprima di schermata.png");
      expect(bitmap).toHaveBeenCalledTimes(2);
      expect(revokeUrl).toHaveBeenCalledWith("blob:preview");
    } finally {
      createUrl.mockRestore();
      revokeUrl.mockRestore();
      vi.unstubAllGlobals();
    }
  });
  it.each([false, true])("ignores an obsolete image validation result (invalid: %s)", async (invalid) => {
    let resolveFirst!: (bitmap: ImageBitmap) => void;
    const firstBitmap = new Promise<ImageBitmap>((resolve) => { resolveFirst = resolve; });
    vi.stubGlobal("createImageBitmap", vi.fn()
      .mockReturnValueOnce(firstBitmap)
      .mockResolvedValueOnce({ width: 800, height: 600, close: vi.fn() }));
    const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview");
    const revokeUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    try {
      render(<ImageForm />);
      const user = userEvent.setup();
      const input = screen.getByLabelText("Immagine opzionale") as HTMLInputElement;
      const first = new File(["first"], "prima.png", { type: "image/png" });
      const second = new File(["second"], "seconda.png", { type: "image/png" });
      await user.upload(input, first);
      await user.upload(input, second);
      await screen.findByAltText("Anteprima di seconda.png");
      const close = vi.fn();
      await act(async () => resolveFirst({ width: invalid ? 5000 : 800, height: 600, close } as unknown as ImageBitmap));
      expect(screen.getByAltText("Anteprima di seconda.png")).toBeInTheDocument();
      expect(screen.queryByAltText("Anteprima di prima.png")).not.toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(input.files?.[0]).toBe(second);
      expect(close).toHaveBeenCalledOnce();
    } finally {
      createUrl.mockRestore();
      revokeUrl.mockRestore();
      vi.unstubAllGlobals();
    }
  });
  it("does not restore a pending replacement after the selection is removed", async () => {
    let resolveReplacement!: (bitmap: ImageBitmap) => void;
    const pending = new Promise<ImageBitmap>((resolve) => { resolveReplacement = resolve; });
    vi.stubGlobal("createImageBitmap", vi.fn()
      .mockResolvedValueOnce({ width: 800, height: 600, close: vi.fn() })
      .mockReturnValueOnce(pending));
    const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview");
    const revokeUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    try {
      render(<ImageForm />);
      const user = userEvent.setup();
      const input = screen.getByLabelText("Immagine opzionale") as HTMLInputElement;
      await user.upload(input, new File(["image"], "prima.png", { type: "image/png" }));
      await screen.findByAltText("Anteprima di prima.png");
      await user.upload(input, new File(["image"], "seconda.png", { type: "image/png" }));
      await user.click(screen.getByRole("button", { name: "Rimuovi selezione" }));
      await act(async () => resolveReplacement({ width: 800, height: 600, close: vi.fn() } as unknown as ImageBitmap));
      expect(screen.queryByRole("img")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Rimuovi selezione" })).not.toBeInTheDocument();
      expect(input.files).toHaveLength(0);
    } finally {
      createUrl.mockRestore();
      revokeUrl.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});
describe("issue commands and drafts", () => {
  it("shows each priority label once in the editor and selects the exact critical option", async () => {
    mount(<IssueEditor />);
    const priority = screen.getByRole("button", { name: "Priorità: Media" });
    expect(priority).toHaveTextContent(/^Media$/);
    await userEvent.click(priority);
    for (const name of ["Bassa", "Media", "Alta", "Critica"]) {
      expect(screen.getByRole("option", { name })).toHaveTextContent(name);
    }
    await userEvent.click(screen.getByRole("option", { name: "Critica" }));
    expect(screen.getByRole("button", { name: "Priorità: Critica" })).toHaveTextContent(/^Critica$/);
  });
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
    const current = await screen.findByRole("radio", {
      name: /Luca · Membro/,
    });
    expect(current).toBeChecked();
    expect(
      screen.getByRole("radio", { name: "Nessuna assegnazione" }),
    ).not.toBeChecked();
    await userEvent.click(
      await screen.findByRole("radio", {
        name: /Anna · Membro · dddddddd/,
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Successiva" }));
    await waitFor(() =>
      expect(screen.getByText(/Pagina 2 di 2/)).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("radio", { name: /Anna · Membro · dddddddd/ }),
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
      await screen.findByRole("radio", {
        name: /Luca · Membro · cccccccc/,
      }),
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
  it("refreshes workload automatically while focused, preserves selection and stops after closing", async () => {
    vi.useFakeTimers();
    focusManager.setFocused(true);
    const anna = {
      ...issue.assignee!,
      id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
      displayName: "Anna",
    };
    let fetches = 0;
    vi.mocked(issueApi.suggestions).mockImplementation(async () => {
      fetches++;
      return {
        asOf: fetches === 1 ? "2026-10-06T10:00:00Z" : "2026-10-06T10:01:00Z",
        candidates:
          fetches === 1
            ? [
                {
                  user: anna,
                  rank: 1,
                  openIssueCount: 1,
                  reason: "Carico minore",
                },
                {
                  user: issue.assignee!,
                  rank: 2,
                  openIssueCount: 4,
                  reason: "Disponibile",
                },
              ]
            : [
                {
                  user: issue.assignee!,
                  rank: 1,
                  openIssueCount: 2,
                  reason: "Carico aggiornato",
                },
              ],
      };
    });
    let dispose = () => {};
    try {
      const rendered = mount(
        <IssueCommandDialog
          issue={issue}
          command="assignment"
          onClose={vi.fn()}
          onSaved={vi.fn()}
          onReload={vi.fn()}
        />,
      );
      dispose = rendered.unmount;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(issueApi.suggestions).toHaveBeenCalledOnce();
      expect(
        screen.queryByRole("button", { name: "Aggiorna carichi" }),
      ).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("radio", { name: /Anna/ }));
      const originalTimestamp = screen.getByText(/Rilevato alle/).textContent;

      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_001);
      });
      expect(issueApi.suggestions).toHaveBeenCalledTimes(2);
      expect(screen.getByRole("radio", { name: /Anna/ })).toBeChecked();
      expect(screen.getByText(/Rilevato alle/).textContent).not.toBe(
        originalTimestamp,
      );

      act(() => focusManager.setFocused(false));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_001);
      });
      expect(issueApi.suggestions).toHaveBeenCalledTimes(2);
      await act(async () => {
        focusManager.setFocused(true);
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(issueApi.suggestions).toHaveBeenCalledTimes(3);
      expect(screen.getByRole("radio", { name: /Anna/ })).toBeChecked();
      expect(
        screen.getByRole("button", { name: "Conferma assegnazione" }),
      ).toBeEnabled();

      dispose();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_001);
      });
      expect(issueApi.suggestions).toHaveBeenCalledTimes(3);
    } finally {
      dispose();
      focusManager.setFocused(undefined);
      vi.useRealTimers();
    }
  });
  it("returns to a valid candidate page after automatic refresh removes the last page, preserving selection", async () => {
    vi.useFakeTimers();
    focusManager.setFocused(true);
    const people = Array.from({ length: 21 }, (_value, index) => ({
      ...issue.assignee!,
      id: `candidate-${index}`,
      displayName: `Persona ${index}`,
    }));
    let fetches = 0;
    vi.mocked(issueApi.suggestions).mockImplementation(async () => ({
      asOf: "2026-10-06T10:00:00Z",
      candidates: people
        .slice(0, ++fetches === 1 ? 21 : 20)
        .map((person, index) => ({
          user: person,
          rank: index + 1,
          openIssueCount: index,
          reason: "Disponibile",
        })),
    }));
    let dispose = () => {};
    try {
      dispose = mount(
        <IssueCommandDialog
          issue={{ ...issue, assignee: null }}
          command="assignment"
          onClose={vi.fn()}
          onSaved={vi.fn()}
          onReload={vi.fn()}
        />,
      ).unmount;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      fireEvent.click(screen.getByRole("button", { name: "Successiva" }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(vi.mocked(issueApi.candidates).mock.calls.at(-1)?.[1]).toBe(1);
      fireEvent.click(screen.getByRole("radio", { name: /^Persona 20 ·/ }));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_001);
      });
      expect(issueApi.suggestions).toHaveBeenCalledTimes(2);
      expect(
        screen.getByRole("radio", { name: /^Persona 1 ·/ }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("radio", { name: /^Persona 20 ·/ }),
      ).toBeChecked();
      expect(
        screen.getByRole("button", { name: "Conferma assegnazione" }),
      ).toBeEnabled();
      expect(
        screen.queryByRole("button", { name: "Successiva" }),
      ).not.toBeInTheDocument();
      expect(vi.mocked(issueApi.candidates).mock.calls.at(-1)?.[1]).toBe(0);
    } finally {
      dispose();
      focusManager.setFocused(undefined);
      vi.useRealTimers();
    }
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
    await screen.findByRole("radio", { name: /Luca · Membro/ });
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
  it("saves an edited image with the field update version and preserves the file when the image fails", async () => {
    const bitmap = vi.fn(async () => ({
      width: 800,
      height: 600,
      close: vi.fn(),
    }));
    vi.stubGlobal("createImageBitmap", bitmap);
    const createUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:preview");
    const revokeUrl = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    const updated = { ...issue, title: "Titolo aggiornato", version: 4 };
    vi.mocked(issueApi.update).mockResolvedValue(updated);
    vi.mocked(issueApi.putImage).mockRejectedValueOnce(
      new Error("Immagine non salvata"),
    );
    mount(<IssueEditor issue={issue} />);
    await userEvent.clear(screen.getByLabelText("Titolo *"));
    await userEvent.type(
      screen.getByLabelText("Titolo *"),
      "Titolo aggiornato",
    );
    const file = new File(["image"], "schermata.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("Immagine opzionale"), file);
    await screen.findByAltText("Anteprima di schermata.png");
    await userEvent.click(
      screen.getByRole("button", { name: "Salva modifiche" }),
    );
    await screen.findByText(/I campi sono stati salvati/);
    expect(issueApi.putImage).toHaveBeenLastCalledWith(issue.id, file, 4);
    expect(screen.getByLabelText("Titolo *")).toHaveValue("Titolo aggiornato");
    expect(draftStore.get(`issue:${issue.id}`)).toMatchObject({
      file,
      version: 4,
    });
    vi.mocked(issueApi.putImage).mockResolvedValueOnce({
      ...updated,
      version: 5,
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Salva modifiche" }),
    );
    await screen.findByRole("heading", { name: "Issue creata" });
    expect(issueApi.update).toHaveBeenCalledTimes(1);
    expect(issueApi.putImage).toHaveBeenLastCalledWith(issue.id, file, 4);
    createUrl.mockRestore();
    revokeUrl.mockRestore();
    vi.unstubAllGlobals();
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

describe("issue navigation context", () => {
  function mountWorkflow() {
    const cache = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const router = createMemoryRouter(
      [
        { path: "/issues", element: <IssueListPage /> },
        { path: "/issues/new", element: <IssueEditor /> },
        { path: "/issues/:issueId", element: <IssueDetailPage /> },
        { path: "/issues/:issueId/edit", element: <IssueEditPage /> },
      ],
      { initialEntries: ["/issues?assignedTo=me&priority=HIGH"] },
    );
    render(
      <QueryClientProvider client={cache}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    return router;
  }
  beforeEach(() => {
    vi.mocked(issueApi.list).mockResolvedValue({
      items: [issue],
      page: 0,
      size: 100,
      totalElements: 1,
      totalPages: 1,
    });
    vi.mocked(issueApi.detail).mockResolvedValue(issue);
  });
  it("selects the exact priority filter label and preserves its query value", async () => {
    const router = mountWorkflow();
    await screen.findByRole("region", { name: "Bacheca issue" });
    await userEvent.click(screen.getByRole("button", { name: "Filtri" }));
    const priority = screen.getByRole("button", { name: "Priorità: Alta" });
    expect(priority).toHaveTextContent(/^Alta$/);
    await userEvent.click(priority);
    await userEvent.click(screen.getByRole("option", { name: "Critica" }));
    expect(router.state.location.search).toContain("priority=CRITICAL");
    expect(screen.getByRole("button", { name: "Priorità: Critica" })).toHaveTextContent(/^Critica$/);
  });
  it("preserves filters, actual scroll and card focus through detail, editor cancel and save", async () => {
    const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const scrollY = vi.spyOn(window, "scrollY", "get").mockReturnValue(444);
    const router = mountWorkflow();
    const board = await screen.findByRole("region", { name: "Bacheca issue" });
    board.scrollLeft = 150;
    await userEvent.click(
      screen.getByRole("link", { name: `BB-42 · ${issue.title}` }),
    );
    await screen.findByRole("heading", { name: issue.title });
    await userEvent.click(screen.getByRole("link", { name: "Modifica" }));
    await screen.findByRole("heading", { name: "Modifica issue BB-42" });
    expect(router.state.location.state).toMatchObject({
      returnTo: "/issues?assignedTo=me&priority=HIGH",
      scrollY: 444,
      focusIssueId: issue.id,
      boardScrollLeft: 150,
    });
    await userEvent.click(screen.getByRole("link", { name: "Annulla" }));
    await screen.findByRole("heading", { name: issue.title });
    await userEvent.click(screen.getByRole("link", { name: "Modifica" }));
    await screen.findByRole("heading", { name: "Modifica issue BB-42" });
    await userEvent.clear(screen.getByLabelText("Titolo *"));
    await userEvent.type(screen.getByLabelText("Titolo *"), "Titolo salvato");
    const updated = { ...issue, title: "Titolo salvato", version: 4 };
    vi.mocked(issueApi.update).mockResolvedValue(updated);
    vi.mocked(issueApi.detail).mockResolvedValue(updated);
    await userEvent.click(
      screen.getByRole("button", { name: "Salva modifiche" }),
    );
    await screen.findByRole("heading", { name: "Titolo salvato" });
    await userEvent.click(screen.getByRole("link", { name: "Issue" }));
    await screen.findByRole("region", { name: "Bacheca issue" });
    expect(router.state.location.search).toBe("?assignedTo=me&priority=HIGH");
    await waitFor(() =>
      expect(
        screen.getByRole("link", { name: `BB-42 · ${issue.title}` }),
      ).toHaveFocus(),
    );
    expect(
      screen.getByRole("region", { name: "Bacheca issue" }).scrollLeft,
    ).toBe(150);
    expect(scroll).toHaveBeenLastCalledWith({ top: 444, behavior: "instant" });
    scroll.mockRestore();
    scrollY.mockRestore();
  });
  it("retains the original board context through discussion tabs and comment/history pagination", async () => {
    vi.mocked(issueApi.comments).mockImplementation(async (_id, page) => ({
      items: [],
      page,
      size: 20,
      totalElements: 21,
      totalPages: 2,
    }));
    vi.mocked(issueApi.history).mockImplementation(async (_id, page) => ({
      items: [],
      page,
      size: 20,
      totalElements: 21,
      totalPages: 2,
    }));
    const router = mountWorkflow();
    await screen.findByRole("region", { name: "Bacheca issue" });
    await userEvent.click(
      screen.getByRole("link", { name: `BB-42 · ${issue.title}` }),
    );
    await screen.findByRole("heading", { name: issue.title });
    const context = router.state.location.state;
    await userEvent.click(screen.getByRole("tab", { name: "Cronologia" }));
    await userEvent.click(
      await within(screen.getByRole("tabpanel")).findByRole("button", {
        name: "Successiva",
      }),
    );
    expect(router.state.location.search).toContain("historyPage=1");
    expect(router.state.location.state).toEqual(context);
    expect(screen.getByRole("link", { name: "Issue" })).toHaveAttribute(
      "href",
      "/issues?assignedTo=me&priority=HIGH",
    );
    await userEvent.click(screen.getByRole("tab", { name: /Discussione/ }));
    const previous = await within(screen.getByRole("tabpanel")).findByRole(
      "button",
      { name: "Precedente" },
    );
    await waitFor(() => expect(previous).toBeEnabled());
    await userEvent.click(previous);
    expect(router.state.location.search).toContain("commentsPage=0");
    expect(router.state.location.state).toEqual(context);
    await userEvent.click(screen.getByRole("link", { name: "Modifica" }));
    await screen.findByRole("heading", { name: "Modifica issue BB-42" });
    await userEvent.click(screen.getByRole("link", { name: "Annulla" }));
    await screen.findByRole("heading", { name: issue.title });
    expect(router.state.location.state).toEqual(context);
    expect(screen.getByRole("link", { name: "Issue" })).toHaveAttribute(
      "href",
      "/issues?assignedTo=me&priority=HIGH",
    );
  });
  it("returns a new issue flow to its original filtered board after cancel and creation", async () => {
    const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const router = mountWorkflow();
    await screen.findByRole("region", { name: "Bacheca issue" });
    await userEvent.click(screen.getByRole("link", { name: "Nuova issue" }));
    await screen.findByRole("heading", { name: "Nuova issue" });
    await userEvent.click(
      screen.getByRole("link", { name: "Torna all’elenco" }),
    );
    await screen.findByRole("region", { name: "Bacheca issue" });
    expect(router.state.location.search).toBe("?assignedTo=me&priority=HIGH");
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Nuova issue" })).toHaveFocus(),
    );
    await userEvent.click(screen.getByRole("link", { name: "Nuova issue" }));
    await userEvent.type(
      screen.getByLabelText("Titolo *"),
      "Nuova segnalazione",
    );
    await userEvent.type(
      screen.getByLabelText("Descrizione *"),
      "Descrizione della nuova segnalazione",
    );
    vi.mocked(issueApi.create).mockResolvedValue(issue);
    await userEvent.click(screen.getByRole("button", { name: "Crea issue" }));
    await screen.findByRole("heading", { name: issue.title });
    expect(router.state.location.state).toMatchObject({
      returnTo: "/issues?assignedTo=me&priority=HIGH",
      focusNewIssue: true,
    });
    await userEvent.click(screen.getByRole("link", { name: "Issue" }));
    await screen.findByRole("region", { name: "Bacheca issue" });
    expect(router.state.location.search).toBe("?assignedTo=me&priority=HIGH");
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Nuova issue" })).toHaveFocus(),
    );
    scroll.mockRestore();
  });
});
