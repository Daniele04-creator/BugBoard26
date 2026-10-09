import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { test, expect } from "./fixtures/session";
import { apiWrite, createIssue, createUser, login } from "./fixtures/api";
import type { Locator, Page, TestInfo } from "@playwright/test";
import type { IssueDetail } from "../../src/api/types";

async function verifyAccessible(page: Page, label: string, testInfo: TestInfo) {
  await expect(page.locator("h1")).toBeVisible();
  await page.waitForFunction(
    () => !document.querySelector('[aria-busy="true"]'),
  );
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  await testInfo.attach(`axe-${label}`, {
    body: Buffer.from(JSON.stringify(results, null, 2)),
    contentType: "application/json",
  });
  expect
    .soft(
      results.violations.filter(
        (item) => item.impact === "critical" || item.impact === "serious",
      ),
      `Violazioni accessibilità ${label}`,
    )
    .toEqual([]);
  await expect.soft(page.locator("h1")).toHaveCount(1);
  expect(await page.locator("html").getAttribute("lang")).toBe("it");
}
test("tutte le route autenticate nominate hanno struttura e accessibilità verificabili", async ({
  admin,
}, testInfo) => {
  const issue = await createIssue(admin.request);
  const user = await createUser(admin.request);
  const page = await admin.context.newPage();
  const routes = [
    ["issues", "/issues"],
    ["issue-new", "/issues/new"],
    ["issue-detail", `/issues/${issue.id}`],
    ["issue-edit", `/issues/${issue.id}/edit`],
    ["archive", "/archive"],
    ["notifications", "/notifications"],
    ["profile", "/profile"],
    ["dashboard", "/admin/dashboard"],
    ["users", "/admin/users"],
    ["users-new", "/admin/users/new"],
    ["users-edit", `/admin/users/${user.user.id}/edit`],
    ["labels", "/admin/labels"],
    ["reports", "/admin/reports"],
  ];
  for (const [label, route] of routes) {
    await test.step(label!, async () => {
      await page.goto(route!);
      await verifyAccessible(page, label!, testInfo);
    });
  }
});

async function tabTo(page: Page, target: Locator) {
  await expect(target).toBeVisible();
  for (let step = 0; step < 200; step++) {
    if (await target.evaluate((element) => document.activeElement === element))
      return;
    await page.keyboard.press("Tab");
  }
  throw new Error("Keyboard target could not be reached using Tab");
}
async function activate(page: Page, target: Locator) {
  await tabTo(page, target);
  await page.keyboard.press("Enter");
}
async function chooseRadio(page: Page, dialog: Locator, target: Locator) {
  await tabTo(page, dialog.getByRole("radio").first());
  await page.keyboard.press("Space");
  for (let step = 0; step < 10 && !(await target.isChecked()); step++)
    await page.keyboard.press("ArrowDown");
  await expect(target).toBeChecked();
}
test("login, creazione, assegnazione, risoluzione, ricerca ed export sono operabili solo da tastiera", async ({
  admin,
  member,
  browser,
  baseURL,
}) => {
  test.setTimeout(90_000);
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 1440, height: 900 },
  });
  try {
    const page = await context.newPage();
    await page.goto("/login");
    await expect(page.locator("h1")).toBeFocused();
    await tabTo(page, page.getByLabel("Email", { exact: false }));
    await page.keyboard.insertText(member.email);
    await tabTo(page, page.getByLabel("Password *", { exact: true }));
    await page.keyboard.insertText(member.password);
    await activate(
      page,
      page.getByRole("button", { name: "Accedi", exact: true }),
    );
    await expect(page).toHaveURL(/\/issues$/);
    await page.goto("/issues/new");
    await expect(page.locator("h1")).toBeFocused();
    const title = `Tastiera ${randomUUID()}`;
    await tabTo(page, page.getByLabel("Titolo *", { exact: true }));
    await page.keyboard.insertText(title);
    await tabTo(page, page.getByLabel("Descrizione *", { exact: true }));
    await page.keyboard.insertText(
      "Verifica completa dei comandi usando Tab, Invio, spazio e frecce.",
    );
    await activate(
      page,
      page.getByRole("button", { name: "Crea issue", exact: true }),
    );
    await expect(page).toHaveURL(/\/issues\/[0-9a-f-]+$/);
    const id = new URL(page.url()).pathname.split("/").at(-1)!;
    const adminPage = await admin.context.newPage();
    await adminPage.goto(`/issues/${id}`);
    await activate(
      adminPage,
      adminPage.getByRole("button", { name: /^Responsabile:/ }),
    );
    let dialog = adminPage.getByRole("dialog");
    await tabTo(
      adminPage,
      dialog.getByLabel("Cerca utenti per nome", { exact: true }),
    );
    await adminPage.keyboard.insertText(member.user.displayName);
    await activate(
      adminPage,
      dialog.getByRole("button", { name: "Cerca utenti", exact: true }),
    );
    await chooseRadio(
      adminPage,
      dialog,
      dialog.getByRole("radio", { name: new RegExp(member.user.displayName) }),
    );
    await activate(
      adminPage,
      dialog.getByRole("button", {
        name: "Conferma assegnazione",
        exact: true,
      }),
    );
    await expect(dialog).toHaveCount(0);
    await page.reload();
    await activate(
      page,
      page.getByRole("button", { name: /^Stato:/ }),
    );
    dialog = page.getByRole("dialog");
    await chooseRadio(
      page,
      dialog,
      dialog.getByRole("radio", { name: "Risolta", exact: true }),
    );
    await activate(
      page,
      dialog.getByRole("button", { name: "Segna come risolta", exact: true }),
    );
    await expect(dialog).toHaveCount(0);
    const stored = await context.request.get(`/api/v1/issues/${id}`);
    expect(((await stored.json()) as IssueDetail).status).toBe("RESOLVED");
    await page.goto("/issues");
    await tabTo(
      page,
      page.getByLabel("Cerca issue", { exact: true }),
    );
    await page.keyboard.insertText(title);
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("link", { name: new RegExp(title) }),
    ).toBeVisible();
    const downloaded = page.waitForEvent("download");
    await activate(
      page,
      page.getByRole("button", { name: "Esporta", exact: true }),
    );
    expect((await downloaded).suggestedFilename()).toMatch(/\.csv$/);
  } finally {
    await context.close();
  }
});
test("login e cambio obbligatorio accessibili senza esporre il progetto", async ({
  admin,
  browser,
  baseURL,
}, testInfo) => {
  const context = await browser.newContext({ baseURL });
  try {
    const page = await context.newPage();
    await page.goto("/login");
    await verifyAccessible(page, "login", testInfo);
    const account = await createUser(admin.request);
    await login(context.request, account.email, account.temporaryPassword);
    await page.goto("/change-password");
    await verifyAccessible(page, "change-password", testInfo);
    await expect(page.getByRole("navigation")).toHaveCount(0);
  } finally {
    await context.close();
  }
});
test("drawer da tastiera mantiene il focus e lo restituisce al comando", async ({
  admin,
}) => {
  const page = await admin.context.newPage();
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/issues");
  const trigger = page.getByRole("button", { name: "Menu", exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Navigazione" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Chiudi Navigazione" }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  expect(
    await page.evaluate(() =>
      Boolean(document.activeElement?.closest("dialog")),
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("errori recuperabili, ricerca vuota e dialoghi di assegnazione e stato restano accessibili", async ({
  admin,
  member,
}, testInfo) => {
  const page = await admin.context.newPage();
  await page.goto("/issues/new");
  await page.getByRole("button", { name: "Crea issue", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await verifyAccessible(page, "issue-validation", testInfo);
  await page.goto(`/issues?q=${randomUUID()}`);
  await expect(page.locator(".issue-results-footer").getByRole("status")).toHaveText("0 issue");
  const emptyBoard = page.getByRole("region", { name: "Bacheca issue", exact: true });
  await expect(emptyBoard.locator("a[data-issue-id]")).toHaveCount(0);
  await expect(emptyBoard.getByText("Nessuna issue", { exact: true })).toHaveCount(4);
  await verifyAccessible(page, "issue-empty", testInfo);
  const issue = await createIssue(admin.request);
  await page.goto(`/issues/${issue.id}`);
  await page.getByRole("button", { name: /^Responsabile:/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await verifyAccessible(page, "assignment-dialog", testInfo);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: /^Responsabile:/ }),
  ).toBeFocused();
  await apiWrite(admin.request, `/issues/${issue.id}/assignment`, "PUT", {
    assigneeId: member.user.id,
    expectedVersion: issue.version,
  });
  await page.reload();
  await page.getByRole("button", { name: /^Stato:/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await verifyAccessible(page, "state-dialog", testInfo);
});
