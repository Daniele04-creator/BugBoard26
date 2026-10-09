import { test, expect } from "./fixtures/session";
import { apiRead } from "./fixtures/api";
import type { Dashboard, MonthlyReport } from "../../src/features/reporting/reportingApi";
import { currentRomeMonth, resolutionTime } from "../../src/features/reporting/reportPresentation";
import type { Locator } from "@playwright/test";
const formatted = (value: number) => new Intl.NumberFormat("it-IT").format(value);
const metric = (table: Locator, name: string) => table
  .getByRole("rowheader", { name, exact: true }).locator("..").getByRole("cell");
const workloadHref = (id: string | undefined) =>
  `/issues?assignedTo=${encodeURIComponent(id ?? "unassigned")}&status=TODO&status=IN_PROGRESS`;

test("dashboard uses server totals and navigates from workload to the exact open-issue filters", async ({ admin }) => {
  const expected = await apiRead<Dashboard>(admin.request, "/admin/dashboard");
  const page = await admin.context.newPage();
  await page.goto("/admin/dashboard");
  await expect(page.getByRole("heading", { name: "Analisi", exact: true })).toBeVisible();
  const states = page.getByRole("region", { name: "Issue per stato", exact: true });
  await expect(states).toContainText(`${formatted(expected.activeIssueCount)} issue non archiviate`);
  for (const [label, count] of [
    ["Da fare", expected.openCount - expected.inProgressCount],
    ["In corso", expected.inProgressCount],
    ["Risolte", expected.resolvedCount],
    ["Duplicate", expected.duplicateCount],
  ] as const) {
    const percent = expected.activeIssueCount ? Math.round(count / expected.activeIssueCount * 100) : 0;
    await expect(states.getByRole("button", { name: `${label}: ${formatted(count)} issue, ${percent}%`, exact: true })).toBeVisible();
  }
  const times = page.getByRole("table", { name: "Tempi di risoluzione complessivi", exact: true });
  await expect(metric(times, "Tempo medio complessivo")).toHaveText(resolutionTime(expected.averageResolutionSeconds));
  await expect(metric(times, "Risoluzioni concluse")).toHaveText(formatted(expected.resolutionCount));
  const open = page.getByRole("region", { name: "Issue aperte per responsabile", exact: true });
  await expect(open.getByRole("listitem")).toHaveCount(expected.openByAssignee.length);
  for (const row of expected.openByAssignee) {
    const label = row.user?.displayName ?? "Non assegnate";
    const percent = expected.openCount ? Math.round(row.openCount / expected.openCount * 100) : 0;
    const item = open.getByRole("listitem").filter({
      has: page.locator(`a[href="${workloadHref(row.user?.id)}"]`),
    });
    await expect(item).toHaveCount(1);
    await expect(item.getByRole("link", { name: label, exact: true })).toBeVisible();
    await expect(item.getByRole("button", { name: `${label}: ${formatted(row.openCount)} issue, ${percent}%`, exact: true })).toBeVisible();
  }
  const row = expected.openByAssignee[0];
  expect(row, "The seeded dashboard has at least one workload link").toBeDefined();
  const target = row.user?.id ?? "unassigned";
  await open.locator(`a[href="${workloadHref(row.user?.id)}"]`).click();
  const query = new URL(page.url()).searchParams;
  expect(query.get("assignedTo")).toBe(target);
  expect(query.getAll("status")).toEqual(["TODO", "IN_PROGRESS"]);
});

test("monthly report matches historical server values, identifies partial data and survives refresh", async ({ admin }) => {
  const month = currentRomeMonth();
  const expected = await apiRead<MonthlyReport>(admin.request, `/admin/reports/monthly?month=${month}`);
  const page = await admin.context.newPage();
  await page.goto(`/admin/reports?month=${month}`);
  const summary = page.getByRole("table", { name: "Metriche del periodo selezionato", exact: true });
  for (const [label, count] of [
    ["Create", expected.totals.createdCount], ["Gestite", expected.totals.handledIssueCount],
    ["Risolte", expected.totals.resolvedIssueCount], ["Aperte a fine periodo", expected.totals.openAtPeriodEnd],
  ] as const) await expect(metric(summary, label)).toHaveText(formatted(count));
  await expect(metric(summary, "Tempo medio")).toHaveText(resolutionTime(expected.totals.averageResolutionSeconds));
  expect(expected.partial).toBe(true);
  await expect(page.getByRole("status").filter({ hasText: "Il mese è ancora in corso." })).toBeVisible();
  const people = page.getByRole("table", { name: "Attività mensile per persona", exact: true });
  await expect(people.getByRole("row")).toHaveCount(expected.perUser.length + 1);
  // The table preserves API order and exposes no user ID in its markup.
  const personRows = people.locator("tbody tr");
  for (const [index, person] of expected.perUser.entries()) {
    const name = person.user.displayName + (!person.user.active ? " · Inattivo" : "");
    const row = personRows.nth(index);
    await expect(row.getByRole("rowheader"), `Person ${person.user.id} at API position ${index}`).toHaveAccessibleName(name);
    await expect(row.getByRole("cell")).toHaveText([
      formatted(person.createdCount), formatted(person.handledIssueCount), formatted(person.resolvedIssueCount), resolutionTime(person.averageResolutionSeconds),
    ]);
  }
  await page.getByText("Dettagli sulle attività e sui cicli", { exact: true }).click();
  const secondary = page.getByRole("table", { name: "Metriche aggiuntive del periodo", exact: true });
  await expect(metric(secondary, "Cicli risolti")).toHaveText(formatted(expected.totals.resolvedCycleCount));
  await expect(metric(secondary, "Senza responsabile a fine periodo")).toHaveText(formatted(expected.unassignedOpenAtPeriodEnd));
  await page.reload();
  await expect(page.getByLabel("Mese del report", { exact: false })).toHaveValue(month);
  await page.getByLabel("Mese del report", { exact: false }).fill("2026-03");
  await page.getByRole("button", { name: "Mostra report", exact: true }).click();
  await expect(page).toHaveURL(/month=2026-03/);
  const march = await apiRead<MonthlyReport>(admin.request, "/admin/reports/monthly?month=2026-03");
  expect((Date.parse(march.periodEnd) - Date.parse(march.periodStart)) / 3600000).toBe(743);
  await expect(page.getByRole("heading", { name: "marzo 2026", exact: true })).toBeVisible();
  await expect(metric(summary, "Gestite")).toHaveText(formatted(march.totals.handledIssueCount));
});
