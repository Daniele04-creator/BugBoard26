import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DashboardPage } from "./DashboardPage";
import { ReportsPage } from "./ReportsPage";
import { reportingApi } from "./reportingApi";
import type { Dashboard, MonthlyReport } from "./reportingApi";
import {
  currentRomeMonth,
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
beforeEach(() => vi.restoreAllMocks());
describe("report presentation", () => {
  it("formats weighted server means once and distinguishes null from zero", () => {
    expect(resolutionTime(115200)).toBe("32,0 ore");
    expect(resolutionTime(0)).toBe("0,0 ore");
    expect(resolutionTime(null)).toBe("Nessuna risoluzione");
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
  it("shows all current counters, zero categories and operational load filters", async () => {
    vi.spyOn(reportingApi, "dashboard").mockResolvedValue(dashboard);
    show(<DashboardPage />);
    await screen.findByText("32,0 ore");
    const card = screen.getByText("Issue non archiviate").closest("div");
    expect(within(card!).getByText("5")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Apri elenco di B" }),
    ).toHaveAttribute(
      "href",
      "/issues?assignedTo=b&status=TODO&status=IN_PROGRESS",
    );
    const types = screen.getByRole("table", { name: "Aperte per tipo" });
    expect(
      within(types).getByText("Documentazione").closest("tr"),
    ).toHaveTextContent("0");
    expect(screen.getByText("C · Inattivo")).toBeInTheDocument();
    expect(screen.getByText("36,0 ore")).toBeInTheDocument();
  });
  it("keeps the global handled union and shows partial historical data with null samples", async () => {
    vi.spyOn(reportingApi, "monthly").mockResolvedValue(monthly);
    show(<ReportsPage />, "/admin/reports?month=2026-02");
    await screen.findByText("32,0 ore");
    expect(
      screen.getByText(
        "Mese corrente: dati parziali fino al momento della rilevazione.",
      ),
    ).toBeInTheDocument();
    const handled = screen
      .getAllByText("Gestite")
      .find((element) => element.tagName === "DT")
      ?.closest("div");
    expect(within(handled!).getByText("5")).toBeInTheDocument();
    expect(screen.getByText("Nessuna risoluzione")).toBeInTheDocument();
    expect(screen.getByText("Aperte alla rilevazione")).toBeInTheDocument();
    expect(reportingApi.monthly).toHaveBeenCalledWith(
      "2026-02",
      expect.any(AbortSignal),
    );
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
      screen.getByRole("heading", { name: "Report mensili" }),
    ).toBeInTheDocument();
  });
});
