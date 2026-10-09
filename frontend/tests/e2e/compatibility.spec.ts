import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./fixtures/session";
import { apiWrite, createIssue, createUser, login } from "./fixtures/api";
import type { Page } from "@playwright/test";
async function noHorizontalOverflow(page: Page) {
  // The local mark is shared by authentication, desktop and mobile navigation.
  const brand = page.locator(".brand-mark:visible").first();
  await expect(brand).toBeAttached();
  await expect.poll(() => brand.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
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
    loginPage.getByRole("heading", { name: "Accedi", exact: true }),
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
  await page.getByRole("button", { name: /^Responsabile:/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/Rilevato alle/)).toBeAttached();
  await expect(dialog.locator('[aria-busy="true"]')).toHaveCount(0);
  // Read both rectangles together: arriving candidates can recenter the dialog.
  const controlsGap = await dialog.evaluate((element) => {
    const buttons = [...element.querySelectorAll("button")];
    const search = buttons.find(
      (button) => button.textContent?.trim().startsWith("Cerca utenti"),
    );
    const candidates = element.querySelector(".assignment-list");
    if (!search || !candidates) throw new Error("Assignment controls are missing");
    return (
      candidates.getBoundingClientRect().top -
      search.getBoundingClientRect().bottom
    );
  });
  expect(controlsGap).toBeGreaterThanOrEqual(8);
  await expect(dialog.getByRole("button", { name: "Aggiorna carichi" })).toHaveCount(0);
  const assignmentLayout = await dialog.evaluate((element) => {
    const rows = [...element.querySelectorAll<HTMLElement>(".assignment-option")];
    const footer = element.querySelector<HTMLElement>(".dialog-footer")!;
    const footerBounds = footer.getBoundingClientRect();
    return {
      containedRows: rows.every((row) => {
        const bounds = row.getBoundingClientRect();
        const content = row.lastElementChild!.getBoundingClientRect();
        const style = getComputedStyle(row);
        const requiredHeight = content.height + parseFloat(style.paddingTop) +
          parseFloat(style.paddingBottom) + parseFloat(style.borderTopWidth) +
          parseFloat(style.borderBottomWidth);
        return bounds.height + 1 >= requiredHeight;
      }),
      footerVisible: footerBounds.top >= 0 && footerBounds.bottom <= innerHeight + 1,
    };
  });
  expect(assignmentLayout.containedRows).toBe(true);
  expect(assignmentLayout.footerVisible).toBe(true);
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
    expect(box!.height).toBeGreaterThanOrEqual(24);
    expect(box!.width).toBeGreaterThanOrEqual(24);
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
    ["dashboard", "/admin/dashboard", "Analisi"],
    ["report", "/admin/reports", "Analisi"],
    ["utenti", "/admin/users", "Team"],
  ];
  for (const [name, route, heading] of views) {
    await page.goto(route!);
    await expect(
      page.getByRole("heading", { name: heading!, exact: true }),
    ).toBeVisible();
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
    if (name === "report") {
      const submit = await page.getByRole("button", { name: "Mostra report", exact: true }).boundingBox();
      const controls = await page.locator('.reporting-filter input[type="month"], .reporting-month-fallback .select-control').all();
      const boxes = await Promise.all(controls.map(control => control.boundingBox()));
      expect(submit).not.toBeNull();
      expect(boxes.length).toBeGreaterThan(0);
      for (const box of boxes) {
        expect(box).not.toBeNull();
        if (box!.y < submit!.y + submit!.height && submit!.y < box!.y + box!.height) {
          expect(Math.abs(box!.y + box!.height / 2 - submit!.y - submit!.height / 2)).toBeLessThanOrEqual(1);
        } else {
          expect(submit!.y).toBeGreaterThanOrEqual(box!.y + box!.height);
        }
      }
      if (boxes.every(box => submit!.y >= box!.y + box!.height)) {
        expect(Math.abs(submit!.x - Math.min(...boxes.map(box => box!.x)))).toBeLessThanOrEqual(1);
      }
      await expect(page.getByText("Europe/Rome", { exact: true })).toHaveCount(0);
    }
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

test("redesign: tutte le 17 schermate conservano contenuti, tipografia di sistema e layout accessibile", async ({
  admin, viewer, browser, baseURL, viewport,
}, testInfo) => {
  test.setTimeout(180_000);
  const labelName = `Design-${Date.now()}-${testInfo.project.name.slice(0, 2)}`;
  const label = await apiWrite<{ id: string }>(admin.request, "/admin/labels", "POST", { name: labelName, color: "green" });
  const issue = await createIssue(admin.request, {
    title: `Redesign ${testInfo.project.name} ${Date.now()}`,
    description: "Una descrizione lunga verifica la leggibilità e conserva i dati del prodotto.",
    labelIds: [label.id],
  });
  const account = await createUser(admin.request);
  const page = await admin.context.newPage();
  const screens = [
    ["S03", `/issues?q=${encodeURIComponent(issue.title)}`],
    ["S04", `/issues/${issue.id}`],
    ["S05", "/issues/new"],
    ["S06", `/issues/${issue.id}/edit`],
    ["S07", "/archive"],
    ["S08", "/notifications"],
    ["S09", "/profile"],
    ["S10", "/admin/dashboard"],
    ["S11", "/admin/users"],
    ["S12", "/admin/users/new"],
    ["S13", `/admin/users/${account.user.id}/edit`],
    ["S14", `/admin/labels?q=${encodeURIComponent(labelName)}`],
    ["S15", "/admin/reports"],
    ["S17", "/missing-redesign-route"],
  ];
  async function inspect(current: Page, id: string) {
    await expect(current.locator("h1")).toBeVisible();
    await expect(current.locator('[aria-busy="true"]')).toHaveCount(0);
    await current.evaluate(() => document.fonts.ready);
    expect(await current.evaluate(() => ({
      ready: document.fonts.status === "loaded",
      body: getComputedStyle(document.body).fontFamily,
    }))).toMatchObject({ ready: true, body: expect.stringMatching(/Segoe UI|system-ui|-apple-system/) });
    await noHorizontalOverflow(current);
    await current.screenshot({
      path: `../output/reports/redesign/${testInfo.project.name}-${id}.png`,
      fullPage: true,
    });
    const audit = await new AxeBuilder({ page: current })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    await testInfo.attach(`axe-redesign-${id}`, {
      body: Buffer.from(JSON.stringify({
        testEngine: audit.testEngine, testEnvironment: audit.testEnvironment,
        url: audit.url, violations: audit.violations, incomplete: audit.incomplete,
      })), contentType: "application/json",
    });
    expect.soft(audit.violations.filter((v) => v.impact === "critical" || v.impact === "serious"), id).toEqual([]);
  }
  for (const [id, route] of screens) {
    await page.goto(route!);
    await inspect(page, id!);
    if (id === "S03") {
      await expect(page.getByRole("button", { name: /^Filtri/ })).toHaveAttribute("aria-expanded", "false");
      await expect(page.locator(`a[data-issue-id="${issue.id}"]`).filter({ visible: true })).toContainText(issue.title);
      if ((viewport?.width ?? 1440) >= 1200) expect((await page.getByRole("region", { name: "Bacheca issue", exact: true }).boundingBox())!.y).toBeLessThanOrEqual(298);
      for (const control of [page.getByRole("button", { name: /^Filtri/ }), page.getByRole("button", { name: "Esporta", exact: true }), page.getByRole("link", { name: "Nuova issue", exact: true })]) {
        const box = await control.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(24);
        expect(box!.height).toBeLessThanOrEqual(46);
        expect(box!.width).toBeGreaterThanOrEqual(24);
      }
      for (const badge of await page.locator(".issue-badge:visible").all()) {
        expect((await badge.boundingBox())!.height).toBeLessThanOrEqual(32);
      }
      const exportButton = page.locator(".issue-export");
      const before = await exportButton.boundingBox();
      let release!: () => void;
      const held = new Promise<void>((resolve) => { release = resolve; });
      await page.route("**/api/v1/issues/export?*", async (route) => {
        await held;
        await route.continue();
      });
      const downloaded = page.waitForEvent("download");
      try {
        await exportButton.click();
        await expect(exportButton).toHaveAttribute("aria-busy", "true");
        const during = await exportButton.boundingBox();
        expect(during).toEqual(before);
        await expect(exportButton).toContainText("Esporta");
      } finally { release(); }
      expect((await downloaded).suggestedFilename()).toMatch(/\.csv$/);
      await page.unroute("**/api/v1/issues/export?*");
    }
    if (id === "S06") await expect(page.getByLabel("Titolo", { exact: false })).toHaveValue(issue.title);
    if (id === "S14") {
      await expect(page.getByLabel("Nome nuova etichetta", { exact: false })).toBeVisible();
      await expect(page.locator(".label-live-preview")).toContainText("Etichetta");
      const edit = page.getByRole("button", { name: `Modifica etichetta ${labelName}`, exact: true });
      await expect(edit).toBeVisible();
      const top = await edit.evaluate((element) => element.closest("tr,article")!.getBoundingClientRect().top);
      const creation = await page.locator(".label-create-disclosure").boundingBox();
      expect(top).toBeGreaterThanOrEqual(creation!.y + creation!.height);
    }
    if (id === "S15") {
      await expect(page.getByRole("table", { name: "Attività mensile per persona", exact: true }).getByRole("columnheader")).toHaveCount(5);
      await page.getByText("Dettagli sulle attività e sui cicli", { exact: true }).click();
      await expect(page.getByRole("table", { name: "Cicli e issue aperte per persona", exact: true }).getByRole("columnheader")).toHaveCount(3);
    }
  }
  const denied = await viewer.context.newPage();
  await denied.goto("/admin/users");
  await expect(denied.getByRole("heading", { name: "Accesso non consentito" })).toBeVisible();
  await inspect(denied, "S16");
  if ((viewport?.width ?? 1440) < 640) {
    await page.setViewportSize({ width: 320, height: 800 });
    for (const route of ["/issues", "/issues/new", "/admin/users", "/admin/labels", "/admin/reports"]) {
      await page.goto(route);
      await expect(page.locator("h1")).toBeVisible();
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
      await noHorizontalOverflow(page);
    }
    await page.setViewportSize(viewport!);
  }
  const anonymous = await browser.newContext({ baseURL, viewport });
  const temporary = await browser.newContext({ baseURL, viewport });
  try {
    const authPage = await anonymous.newPage();
    await authPage.goto("/login");
    await inspect(authPage, "S01");
    await expect(authPage.getByRole("navigation")).toHaveCount(0);
    await login(temporary.request, account.email, account.temporaryPassword);
    const passwordPage = await temporary.newPage();
    await passwordPage.goto("/change-password");
    await inspect(passwordPage, "S02");
    await expect(passwordPage.getByRole("heading", { name: "Cambia la password iniziale", exact: true })).toBeVisible();
  } finally {
    await anonymous.close();
    await temporary.close();
  }
});
