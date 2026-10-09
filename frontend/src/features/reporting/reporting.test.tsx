import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { IssueSummary } from "../../api/types";
import { DashboardPage } from "./DashboardPage";
import { ReportsPage } from "./ReportsPage";
import { issueApi } from "../issues/issueApi";
import { reportingApi } from "./reportingApi";
import type { Dashboard, MonthlyReport } from "./reportingApi";
import {
  currentRomeMonth,
  Distribution,
  resolutionTime,
  validMonth,
} from "./reportPresentation";

const users = [
  { id: "a", displayName: "A", role: "ADMIN" as const, active: true },
  { id: "b", displayName: "B", role: "MEMBER" as const, active: true },
  { id: "c", displayName: "C", role: "MEMBER" as const, active: false },
];
const dashboard: Dashboard = {
  asOf: "2026-02-10T12:00:00Z",
  timezone: "Europe/Rome",
  activeIssueCount: 5,
  openCount: 2,
  inProgressCount: 1,
  resolvedCount: 2,
  duplicateCount: 1,
  unassignedOpenCount: 1,
  overdueOpenCount: 1,
  resolutionCount: 3,
  averageResolutionSeconds: 115200,
  openByType: { QUESTION: 0, BUG: 1, DOCUMENTATION: 0, FEATURE: 1 },
  openByPriority: { LOW: 0, MEDIUM: 1, HIGH: 1, CRITICAL: 0 },
  openByAssignee: [
    { user: users[0], openCount: 0 },
    { user: users[1], openCount: 1 },
    { user: null, openCount: 1 },
  ],
  resolutionByAssignee: [
    { user: users[1], resolutionCount: 1, averageResolutionSeconds: 86400 },
    { user: users[2], resolutionCount: 2, averageResolutionSeconds: 129600 },
  ],
};
const monthly: MonthlyReport = {
  month: "2026-02",
  timezone: "Europe/Rome",
  periodStart: "2026-01-31T23:00:00Z",
  periodEnd: "2026-02-28T23:00:00Z",
  asOf: "2026-02-10T12:00:00Z",
  partial: true,
  totals: {
    createdCount: 6,
    resolvedCycleCount: 3,
    resolvedIssueCount: 2,
    handledIssueCount: 5,
    duplicatedCount: 1,
    reopenedCount: 1,
    duplicateUndoneCount: 0,
    averageResolutionSeconds: 115200,
    openAtPeriodEnd: 2,
  },
  perUser: [
    {
      user: users[0],
      createdCount: 6,
      handledIssueCount: 5,
      resolvedCycleCount: 0,
      resolvedIssueCount: 0,
      averageResolutionSeconds: null,
      openAssignedAtPeriodEnd: 0,
    },
    {
      user: users[1],
      createdCount: 0,
      handledIssueCount: 2,
      resolvedCycleCount: 1,
      resolvedIssueCount: 1,
      averageResolutionSeconds: 86400,
      openAssignedAtPeriodEnd: 1,
    },
    {
      user: users[2],
      createdCount: 0,
      handledIssueCount: 1,
      resolvedCycleCount: 2,
      resolvedIssueCount: 1,
      averageResolutionSeconds: 129600,
      openAssignedAtPeriodEnd: 0,
    },
  ],
  unassignedOpenAtPeriodEnd: 1,
};
function show(element: React.ReactNode, path = "/admin/dashboard") {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={[path]}>{element}</MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(issueApi, "list").mockResolvedValue({ items: [], page: 0, size: 5, totalElements: 0, totalPages: 0 });
});
describe("report presentation", () => {
  it("keeps chart tooltip state with the same person when equal names change order", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const rows = [
      { label: "Anna", value: 1, to: "/issues?assignedTo=a" },
      { label: "Anna", value: 2, to: "/issues?assignedTo=b" },
    ];
    const { container, rerender } = render(
      <MemoryRouter><Distribution rows={rows} total={3} /></MemoryRouter>,
    );
    const person = (id: string) => container.querySelector(`a[href="/issues?assignedTo=${id}"]`)!.closest('[role="listitem"]') as HTMLElement;
    await userEvent.setup().click(within(person("a")).getByRole("button"));
    expect(person("a").querySelector(".distribution-bar")).toHaveAttribute("data-tooltip-open", "true");
    rerender(<MemoryRouter><Distribution rows={[...rows].reverse()} total={3} /></MemoryRouter>);
    expect(person("a").querySelector(".distribution-bar")).toHaveAttribute("data-tooltip-open", "true");
    expect(person("b").querySelector(".distribution-bar")).not.toHaveAttribute("data-tooltip-open");
    expect(consoleError).not.toHaveBeenCalled();
  });
  it("formats weighted server means once and distinguishes null from zero", () => {
    expect(resolutionTime(115200)).toBe("1,3 giorni");
    expect(resolutionTime(0)).toBe("0 giorni");
    expect(resolutionTime(null)).toBe("—");
  });
  it("selects the current month in Rome at a UTC boundary and refuses invalid months", () => {
    expect(currentRomeMonth(new Date("2026-01-31T23:30:00Z"))).toBe("2026-02");
    expect(validMonth("2000-01", "2026-10")).toBe(true);
    for (const value of [
      "1999-12",
      "2026-11",
      "2026-00",
      "2026-13",
      "2026-1",
      "evil",
    ])
      expect(validMonth(value, "2026-10")).toBe(false);
  });
  it("shows server status distributions, operational links and weighted resolution times", async () => {
    vi.spyOn(reportingApi, "dashboard").mockResolvedValue(dashboard);
    show(<DashboardPage />);
    await screen.findByText("1,3 giorni");
    expect(screen.getByRole("heading", { name: "Analisi" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Aggiorna/ })).not.toBeInTheDocument();
    const status = screen.getByRole("region", { name: "Issue per stato" });
    expect(within(status).getByRole("button", { name: "Da fare: 1 issue, 20%" })).toBeInTheDocument();
    expect(within(status).getByRole("button", { name: "In corso: 1 issue, 20%" })).toBeInTheDocument();
    expect(within(status).getByRole("button", { name: "Risolte: 2 issue, 40%" })).toBeInTheDocument();
    expect(within(status).getByRole("link", { name: "In corso" })).toHaveAttribute("href", "/issues?status=IN_PROGRESS");
    expect(screen.getByRole("link", { name: "B" })).toHaveAttribute("href", "/issues?assignedTo=b&status=TODO&status=IN_PROGRESS");
    expect(screen.getByRole("link", { name: "1 scadute" })).toHaveAttribute("href", "/issues?overdue=true&status=TODO&status=IN_PROGRESS");
    expect(screen.getByRole("link", { name: "1 senza responsabile" })).toHaveAttribute("href", "/issues?assignedTo=unassigned&status=TODO&status=IN_PROGRESS");
    expect(screen.getByText("C · Inattivo")).toBeInTheDocument();
    expect(screen.getByText("1,5 giorni")).toBeInTheDocument();
    expect(issueApi.list).toHaveBeenCalledWith("status=TODO&status=IN_PROGRESS&overdue=true&size=5", expect.any(AbortSignal));
    expect(issueApi.list).toHaveBeenCalledWith("status=TODO&status=IN_PROGRESS&assignedTo=unassigned&size=5", expect.any(AbortSignal));
    await userEvent.setup().click(screen.getByText("Distribuzione per tipo e priorità"));
    expect(screen.getByRole("button", { name: "Documentazione: 0 issue, 0%" })).toBeInTheDocument();
  });
  it("renders real attention issues once when overdue and unassigned filters overlap", async () => {
    vi.spyOn(reportingApi, "dashboard").mockResolvedValue(dashboard);
    const issue: IssueSummary = {
      id: "issue-id", number: 42, title: "Ricerca bloccata", type: "BUG", status: "TODO", priority: "HIGH",
      reporter: users[0], assignee: null, labels: [], dueDate: "2026-02-01", archived: false,
      archivedAt: null, archivedBy: null, createdAt: dashboard.asOf, updatedAt: dashboard.asOf,
      lastActivityAt: dashboard.asOf, resolvedAt: null, duplicateOf: null, hasImage: false, version: 1,
    };
    vi.mocked(issueApi.list).mockResolvedValue({ items: [issue], page: 0, size: 5, totalElements: 1, totalPages: 1 });
    show(<DashboardPage />);
    const row = (await screen.findByText("Ricerca bloccata")).closest("a");
    expect(row).toHaveAttribute("href", "/issues/issue-id");
    expect(screen.getAllByText("Ricerca bloccata")).toHaveLength(1);
  });
  it("opens the accessible chart tooltip on tap and dismisses it with Escape", async () => {
    vi.spyOn(reportingApi, "dashboard").mockResolvedValue(dashboard);
    show(<DashboardPage />);
    const user = userEvent.setup(), bar = await screen.findByRole("button", { name: "Da fare: 1 issue, 20%" });
    expect(bar).toHaveAccessibleDescription("1 issue · 20%");
    await user.click(bar);
    expect(bar.parentElement).toHaveAttribute("data-tooltip-open", "true");
    await user.keyboard("{Escape}");
    expect(bar.parentElement).toHaveAttribute("data-tooltip-dismissed", "true");
    expect(bar.parentElement).not.toHaveAttribute("data-tooltip-open");
  });
  it("keeps zero status percentages and an empty historical register without inventing a duration", async () => {
    vi.spyOn(reportingApi, "dashboard").mockResolvedValue({
      ...dashboard, activeIssueCount: 0, openCount: 0, inProgressCount: 0, resolvedCount: 0,
      duplicateCount: 0, unassignedOpenCount: 0, overdueOpenCount: 0, resolutionCount: 0,
      averageResolutionSeconds: null, openByAssignee: [], resolutionByAssignee: [],
      openByType: { QUESTION: 0, BUG: 0, DOCUMENTATION: 0, FEATURE: 0 },
      openByPriority: { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 },
    });
    show(<DashboardPage />);
    await screen.findByText("Nessuna risoluzione.");
    expect(screen.getByRole("button", { name: "Da fare: 0 issue, 0%" })).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("0 giorni")).not.toBeInTheDocument();
    await screen.findByText("Nessuna issue richiede attenzione.");
  });
  it("keeps the global handled union and historical person data in primary and disclosed tables", async () => {
    vi.spyOn(reportingApi, "monthly").mockResolvedValue(monthly);
    show(<ReportsPage />, "/admin/reports?month=2026-02");
    await screen.findByText("1,3 giorni");
    expect(screen.getByText("Il mese è ancora in corso.")).toBeInTheDocument();
    expect(screen.queryByText("Europe/Rome")).not.toBeInTheDocument();
    const summary = screen.getByRole("table", { name: "Metriche del periodo selezionato" });
    expect(within(summary).getByRole("row", { name: "Gestite 5" })).toBeInTheDocument();
    expect(within(summary).getByRole("row", { name: "Risolte 2" })).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    const region = screen.getByRole("region", { name: "Attività mensile per utente" });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region).toHaveAccessibleDescription("Scorri in orizzontale per vedere tutte le metriche.");
    expect(within(region).getAllByRole("columnheader")).toHaveLength(5);
    expect(within(region).getByRole("columnheader", { name: "Risolte" })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByText("Dettagli sulle attività e sui cicli"));
    expect(screen.getByRole("columnheader", { name: "Aperte alla rilevazione" })).toBeInTheDocument();
    const details = screen.getByRole("table", { name: "Metriche aggiuntive del periodo" });
    expect(within(details).getByRole("row", { name: "Cicli risolti 3" })).toBeInTheDocument();
    expect(screen.queryByText(/Definizioni e criteri/)).not.toBeInTheDocument();
    expect(reportingApi.monthly).toHaveBeenCalledWith("2026-02", expect.any(AbortSignal));
  });
  it("keeps report totals and empty historical periods", async () => {
    vi.spyOn(reportingApi, "monthly").mockResolvedValue({ ...monthly, partial: false, perUser: [], totals: { ...monthly.totals, averageResolutionSeconds: null } });
    show(<ReportsPage />, "/admin/reports?month=2026-02");
    await screen.findByText("Nessun account era presente in questo periodo.");
    expect(screen.getByText("Il periodo selezionato è concluso.")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByRole("row", { name: "Gestite 5" })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByText("Dettagli sulle attività e sui cicli"));
    expect(screen.getByRole("columnheader", { name: "Aperte al termine" })).toBeInTheDocument();
  });
  it("identifies previous-month data until the next monthly request has completed", async () => {
    let finish: ((report: MonthlyReport) => void) | undefined;
    vi.spyOn(reportingApi, "monthly")
      .mockResolvedValueOnce(monthly)
      .mockImplementationOnce(() => new Promise<MonthlyReport>((resolve) => { finish = resolve; }));
    show(<ReportsPage />, "/admin/reports?month=2026-02");
    await screen.findByRole("heading", { name: "febbraio 2026" });
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText("Mese del report", { exact: false }));
    await user.type(screen.getByLabelText("Mese del report", { exact: false }), "2026-01");
    await user.click(screen.getByRole("button", { name: "Mostra report" }));
    await screen.findByText(/Sono ancora visibili i dati del mese precedente/);
    expect(screen.getByRole("heading", { name: "febbraio 2026" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "gennaio 2026" })).not.toBeInTheDocument();
    finish?.({ ...monthly, month: "2026-01", partial: false });
    await screen.findByRole("heading", { name: "gennaio 2026" });
    expect(screen.queryByText(/Sono ancora visibili i dati del mese precedente/)).not.toBeInTheDocument();
  });
  it("reports invalid URL state without making a report request", async () => {
    const request = vi.spyOn(reportingApi, "monthly");
    show(<ReportsPage />, "/admin/reports?month=2100-01");
    expect(screen.getByRole("alert")).toHaveTextContent("Mese non valido");
    expect(request).not.toHaveBeenCalled();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Ripristina vista" }));
    expect(
      screen.getByRole("heading", { name: "Analisi" }),
    ).toBeInTheDocument();
  });
});
