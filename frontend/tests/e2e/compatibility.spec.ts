import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./fixtures/session";
import { apiWrite, createIssue } from "./fixtures/api";
import type { Page } from "@playwright/test";
async function noHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    })),
  ).toEqual(expect.objectContaining({ document: expect.any(Number) }));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
}
test("elenco, dettaglio, form e dialog funzionano al viewport del progetto e al refresh", async ({
  admin,
  member,
  page: loginPage,
}, testInfo) => {
  const consoleErrors: string[] = [];
  loginPage.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("401"))
      consoleErrors.push(message.text());
  });
  loginPage.on("pageerror", (error) => consoleErrors.push(error.message));
  await loginPage.goto("/login");
  await expect(
    loginPage.getByRole("heading", { name: "Accedi al progetto", exact: true }),
  ).toBeVisible();
  await noHorizontalOverflow(loginPage);
  await loginPage.screenshot({
    path: `../output/reports/responsive/${testInfo.project.name}-login.png`,
    fullPage: true,
  });
  const title = `Compatibilità ${testInfo.project.name} ${Date.now()}`;
  const issue = await createIssue(admin.request, { title });
  await apiWrite(admin.request, `/issues/${issue.id}/assignment`, "PUT", {
    assigneeId: member.user.id,
    expectedVersion: issue.version,
  });
  const page = await admin.context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await page.goto(`/issues?q=${encodeURIComponent(title)}`);
  await expect(
    page
      .getByRole("link", {
        name: new RegExp(`BB-${issue.number}.*Compatibilità`),
      })
      .first(),
  ).toBeVisible();
  await noHorizontalOverflow(page);
  await page.reload();
  await expect(
    page
      .getByRole("link", {
        name: new RegExp(`BB-${issue.number}.*Compatibilità`),
      })
      .first(),
  ).toBeVisible();
  await page.goto(`/issues/${issue.id}`);
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await noHorizontalOverflow(page);
  await page.getByRole("button", { name: /Assegna|Riassegna/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const searchBox = await dialog
    .getByRole("button", { name: "Cerca utenti", exact: true })
    .boundingBox();
  const refreshBox = await dialog
    .getByRole("button", { name: "Aggiorna carichi", exact: true })
    .boundingBox();
  expect(searchBox).not.toBeNull();
  expect(
    refreshBox!.y - (searchBox!.y + searchBox!.height),
  ).toBeGreaterThanOrEqual(8);
  await noHorizontalOverflow(page);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.goto("/issues/new");
  await expect(
    page.getByRole("heading", { name: "Nuova issue", exact: true }),
  ).toBeVisible();
  await noHorizontalOverflow(page);
  for (const control of [
    page.getByRole("button", { name: "Crea issue", exact: true }),
    page.getByRole("link", { name: "Annulla", exact: true }),
  ]) {
    const box = await control.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({
    path: `../output/reports/viewport-${testInfo.project.name}.png`,
    fullPage: true,
  });
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  await testInfo.attach(`axe-${testInfo.project.name}-creation`, {
    body: Buffer.from(
      JSON.stringify({
        testEngine: results.testEngine,
        testEnvironment: results.testEnvironment,
        url: results.url,
        violations: results.violations,
        incomplete: results.incomplete,
      }),
    ),
    contentType: "application/json",
  });
  expect(
    results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    ),
  ).toEqual([]);
  const views = [
    ["lista", `/issues?q=${encodeURIComponent(title)}`, "Issue"],
    ["dettaglio", `/issues/${issue.id}`, title],
    ["creazione", "/issues/new", "Nuova issue"],
    ["archivio", "/archive", "Archivio"],
    ["dashboard", "/admin/dashboard", "Dashboard"],
    ["report", "/admin/reports", "Report mensili"],
    ["utenti", "/admin/users", "Utenti"],
  ];
  for (const [name, route, heading] of views) {
    await page.goto(route!);
    await expect(
      page.getByRole("heading", { name: heading!, exact: true }),
    ).toBeVisible();
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
    await noHorizontalOverflow(page);
    await page.screenshot({
      path: `../output/reports/responsive/${testInfo.project.name}-${name}.png`,
      fullPage: true,
    });
    const viewResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    await testInfo.attach(`axe-${testInfo.project.name}-${name}`, {
      body: Buffer.from(
        JSON.stringify({
          testEngine: viewResults.testEngine,
          testEnvironment: viewResults.testEnvironment,
          url: viewResults.url,
          violations: viewResults.violations,
          incomplete: viewResults.incomplete,
        }),
      ),
      contentType: "application/json",
    });
    expect
      .soft(
        viewResults.violations.filter(
          (violation) =>
            violation.impact === "critical" || violation.impact === "serious",
        ),
        `${testInfo.project.name}: ${name}`,
      )
      .toEqual([]);
  }
  expect(consoleErrors).toEqual([]);
});
test("testo al 200 per cento e spaziatura aumentata conservano campi e azioni", async ({
  admin,
}) => {
  const page = await admin.context.newPage();
  await page.goto("/issues/new");
  await page.evaluate(() => {
    // Simulate user text preferences through the existing same-origin stylesheet.
    // This keeps the production CSP active; no inline style or CSP bypass is used.
    const sheet = document.styleSheets[0];
    if (!sheet) throw new Error("Application stylesheet is missing");
    for (const rule of [
      "html{font-size:200%}",
      "body{font-size:32px;line-height:1.5;letter-spacing:.12em;word-spacing:.16em}",
      "button,input,select,textarea{font-size:inherit}",
      "p{margin-bottom:2em}",
    ])
      sheet.insertRule(rule, sheet.cssRules.length);
  });
  await expect(
    page.getByRole("button", { name: "Crea issue", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Titolo", { exact: false })).toBeVisible();
  await noHorizontalOverflow(page);
});
