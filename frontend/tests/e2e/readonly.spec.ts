import { test, expect } from "./fixtures/session";
import { csrf, createIssue } from "./fixtures/api";
test("viewer can read and export but sees no issue mutation controls", async ({
  admin,
  viewer,
}, testInfo) => {
  const issue = await createIssue(admin.request, {
    title: `Errore login VIEWER ${Date.now()}`,
    priority: "HIGH",
  });
  const other = await createIssue(admin.request, {
    title: `Errore login escluso ${Date.now()}`,
    priority: "LOW",
  });
  const errors: string[] = [];
  const page = await viewer.context.newPage();
  await page.goto(`/issues/${issue.id}`);
  await expect(
    page.getByRole("heading", { name: issue.title, exact: true }),
  ).toBeVisible();
  for (const name of [
    "Assegna",
    "Scadenza",
    "Cambia stato",
    "Segna duplicato",
    "Archivia",
    "Gestisci immagine",
  ])
    await expect(page.getByRole("button", { name, exact: true })).toHaveCount(
      0,
    );
  await expect(page.getByLabel("Commento", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Modifica", exact: true }),
  ).toHaveCount(0);
  const denied = await viewer.request.put(`/api/v1/issues/${issue.id}/state`, {
    headers: await csrf(viewer.request),
    data: { status: "RESOLVED", expectedVersion: issue.version },
  });
  expect(denied.status()).toBe(403);
  const started = performance.now();
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`/issues?q=login&priority=HIGH`);
  await expect(
    page.getByRole("link", {
      name: `BB-${issue.number} · ${issue.title}`,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: `BB-${other.number} · ${other.title}`,
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Nuova issue", exact: true }),
  ).toHaveCount(0);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Esporta CSV" }).click();
  expect((await download).suggestedFilename()).toMatch(
    /^bugboard26-issue-.*\.csv$/,
  );
  const csv = await viewer.request.get(
    `/api/v1/issues/export?q=login&priority=HIGH&archived=false`,
  );
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain(issue.title);
  expect(await csv.text()).not.toContain(other.title);
  const seconds = (performance.now() - started) / 1000;
  await testInfo.attach("U-04", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
  await testInfo.attach("U-04-results", {
    body: JSON.stringify({
      seconds,
      errors,
      outcome: "PASS",
      scope: "Automazione tecnica su dati sintetici",
    }),
    contentType: "application/json",
  });
  expect(seconds).toBeLessThanOrEqual(180);
  expect(errors).toEqual([]);
});
