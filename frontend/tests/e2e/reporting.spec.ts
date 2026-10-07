import { test, expect } from "./fixtures/session";
import { apiRead } from "./fixtures/api";
import type {
  Dashboard,
  MonthlyReport,
} from "../../src/features/reporting/reportingApi";
import {
  currentRomeMonth,
  resolutionTime,
} from "../../src/features/reporting/reportPresentation";
const formatted = (value: number) =>
  new Intl.NumberFormat("it-IT").format(value);
test("dashboard uses server totals and navigates from workload to the exact open-issue filters", async ({
  admin,
}) => {
  const expected = await apiRead<Dashboard>(admin.request, "/admin/dashboard"),
    page = await admin.context.newPage();
  await page.goto("/admin/dashboard");
  await expect(
    page.getByRole("heading", { name: "Dashboard", exact: true }),
  ).toBeVisible();
  const cards = page.locator(".reporting-metric");
  await expect(
    cards
      .filter({
        has: page.locator("dt", { hasText: /^Issue non archiviate$/ }),
      })
      .locator("dd"),
  ).toHaveText(formatted(expected.activeIssueCount));
  await expect(
    cards
      .filter({
        has: page.locator("dt", { hasText: /^Tempo medio del ciclo$/ }),
      })
      .locator("dd"),
  ).toHaveText(resolutionTime(expected.averageResolutionSeconds));
  const open = page.getByRole("table", {
    name: "Carico corrente",
    exact: true,
  });
  await expect(open.getByRole("row")).toHaveCount(
    expected.openByAssignee.length + 1,
  );
  const row = expected.openByAssignee[0],
    target = row.user?.id ?? "unassigned";
  await open
    .getByRole("link", {
      name: `Apri elenco di ${row.user?.displayName ?? "issue senza responsabile"}`,
      exact: true,
    })
    .click();
  const query = new URL(page.url()).searchParams;
  expect(query.get("assignedTo")).toBe(target);
  expect(query.getAll("status")).toEqual(["TODO", "IN_PROGRESS"]);
});
test("monthly report matches historical server values, identifies partial data and survives refresh", async ({
  admin,
}) => {
  const month = currentRomeMonth(),
    expected = await apiRead<MonthlyReport>(
      admin.request,
      `/admin/reports/monthly?month=${month}`,
    ),
    page = await admin.context.newPage();
  await page.goto(`/admin/reports?month=${month}`);
  const cards = page.locator(".reporting-metric");
  await expect(
    cards
      .filter({ has: page.locator("dt", { hasText: /^Gestite$/ }) })
      .locator("dd"),
  ).toHaveText(formatted(expected.totals.handledIssueCount));
  await expect(
    cards
      .filter({
        has: page.locator("dt", { hasText: /^Tempo medio del ciclo$/ }),
      })
      .locator("dd"),
  ).toHaveText(resolutionTime(expected.totals.averageResolutionSeconds));
  expect(expected.partial).toBe(true);
  await expect(
    page.getByText(
      "Mese corrente: dati parziali fino al momento della rilevazione.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page
      .getByRole("table", { name: "Attività per utente", exact: true })
      .getByRole("row"),
  ).toHaveCount(expected.perUser.length + 1);
  await page.reload();
  await expect(
    page.getByLabel("Mese del report", { exact: false }),
  ).toHaveValue(month);
  await page.getByLabel("Mese del report", { exact: false }).fill("2026-03");
  await page
    .getByRole("button", { name: "Mostra report", exact: true })
    .click();
  await expect(page).toHaveURL(/month=2026-03/);
  const march = await apiRead<MonthlyReport>(
    admin.request,
    "/admin/reports/monthly?month=2026-03",
  );
  expect(
    (Date.parse(march.periodEnd) - Date.parse(march.periodStart)) / 3600000,
  ).toBe(743);
  await expect(
    page.getByRole("heading", { name: "marzo 2026", exact: true }),
  ).toBeVisible();
});
