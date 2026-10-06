import { test, expect } from "./fixtures/session";
import { apiRead, apiWrite, createIssue } from "./fixtures/api";
import type { IssueDetail, UserAdmin } from "../../src/api/types";
test("archive is read-only and restoring removes a now ineligible assignee", async ({
  admin,
  member,
}) => {
  let issue = await createIssue(admin.request);
  issue = await apiWrite<IssueDetail>(
    admin.request,
    `/issues/${issue.id}/assignment`,
    "PUT",
    { assigneeId: member.user.id, expectedVersion: issue.version },
  );
  issue = await apiWrite<IssueDetail>(
    admin.request,
    `/issues/${issue.id}/state`,
    "PUT",
    { status: "IN_PROGRESS", expectedVersion: issue.version },
  );
  const page = await admin.context.newPage();
  await page.goto(`/issues/${issue.id}`);
  await page.getByRole("button", { name: "Archivia", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Archivia", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "Ripristina" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Modifica", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Commento", { exact: true })).toHaveCount(0);
  const account = await apiRead<UserAdmin>(
    admin.request,
    `/admin/users/${member.user.id}`,
  );
  await apiWrite(admin.request, `/admin/users/${member.user.id}`, "PATCH", {
    displayName: account.displayName,
    role: "VIEWER",
    active: true,
    expectedVersion: account.version,
  });
  await page.getByRole("button", { name: "Ripristina", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("verrà rimosso");
  await dialog.getByRole("button", { name: "Ripristina", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Assegna", exact: true }),
  ).toBeVisible();
  expect(
    await apiRead<IssueDetail>(admin.request, `/issues/${issue.id}`),
  ).toMatchObject({ archived: false, status: "TODO", assignee: null });
});

test("VER08 U05 archives a completed issue, finds it in archive and restores the same record", async ({
  admin,
}, testInfo) => {
  let issue = await createIssue(admin.request, {
    title: `Conclusa archivio ${Date.now()}`,
  });
  issue = await apiWrite<IssueDetail>(
    admin.request,
    `/issues/${issue.id}/assignment`,
    "PUT",
    {
      assigneeId: admin.user.id,
      expectedVersion: issue.version,
    },
  );
  issue = await apiWrite<IssueDetail>(
    admin.request,
    `/issues/${issue.id}/state`,
    "PUT",
    { status: "RESOLVED", expectedVersion: issue.version },
  );
  const page = await admin.context.newPage();
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  const started = performance.now();
  await page.goto(`/issues/${issue.id}`);
  await page.getByRole("button", { name: "Archivia", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Archivia", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Ripristina", exact: true }),
  ).toBeVisible();
  await page.goto(`/issues?q=${encodeURIComponent(issue.title)}`);
  await expect(
    page.getByText("Nessuna issue corrisponde ai filtri.", { exact: true }),
  ).toBeVisible();
  await page.goto(`/archive?q=${encodeURIComponent(issue.title)}`);
  await page
    .getByRole("link", {
      name: `BB-${issue.number} · ${issue.title}`,
      exact: true,
    })
    .click();
  expect(new URL(page.url()).pathname).toBe(`/issues/${issue.id}`);
  await page.getByRole("button", { name: "Ripristina", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Ripristina", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Archivia", exact: true }),
  ).toBeVisible();
  await page.goto(`/issues?q=${encodeURIComponent(issue.title)}`);
  await expect(
    page.getByRole("link", {
      name: `BB-${issue.number} · ${issue.title}`,
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await apiRead<IssueDetail>(admin.request, `/issues/${issue.id}`),
  ).toMatchObject({
    id: issue.id,
    number: issue.number,
    status: "RESOLVED",
    archived: false,
  });
  const seconds = (performance.now() - started) / 1000;
  await testInfo.attach("U-05", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
  await testInfo.attach("U-05-results", {
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
