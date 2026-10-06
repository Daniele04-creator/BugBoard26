import { randomUUID } from "node:crypto";
import { test, expect } from "./fixtures/session";
import { apiRead, apiWrite, createIssue } from "./fixtures/api";
import type { IssueDetail, Comment, Page } from "../../src/api/types";
test("member resolves assigned work, keeps comment text plain, and starts a new cycle on reopen", async ({
  admin,
  member,
}) => {
  let issue = await createIssue(member.request);
  issue = await apiWrite<IssueDetail>(
    admin.request,
    `/issues/${issue.id}/assignment`,
    "PUT",
    { assigneeId: member.user.id, expectedVersion: issue.version },
  );
  const page = await member.context.newPage();
  await page.goto(`/issues/${issue.id}`);
  const comment = "<script>alert(1)</script> Testo semplice";
  await page.getByLabel("Commento", { exact: true }).fill(comment);
  await page.getByRole("button", { name: "Invia commento" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Commento inviato." }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("listitem")
      .filter({ has: page.getByText(comment, { exact: true }) }),
  ).toBeVisible();
  const comments = await apiRead<Page<Comment>>(
    member.request,
    `/issues/${issue.id}/comments`,
  );
  expect(comments.items.some((item) => item.body === comment)).toBe(true);
  await page.getByRole("button", { name: "Cambia stato" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: "Risolta", exact: true }).check();
  await dialog.getByRole("button", { name: "Segna come risolta" }).click();
  await expect(
    page.getByRole("button", { name: "Riapri", exact: true }),
  ).toBeVisible();
  const resolved = await apiRead<IssueDetail>(
    member.request,
    `/issues/${issue.id}`,
  );
  expect(resolved.status).toBe("RESOLVED");
  expect(resolved.resolvedAt).not.toBeNull();
  await page.getByRole("button", { name: "Riapri", exact: true }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("nuovo ciclo");
  await dialog.getByRole("radio", { name: "Da fare" }).check();
  await dialog.getByRole("button", { name: "Riapri issue" }).click();
  await expect(dialog).not.toBeVisible();
  const reopened = await apiRead<IssueDetail>(
    member.request,
    `/issues/${issue.id}`,
  );
  expect(reopened.status).toBe("TODO");
  expect(reopened.resolvedAt).toBeNull();
  expect(reopened.cycleStartedAt).not.toBe(resolved.cycleStartedAt);
});
test("admin sets a deadline and marks duplicate through a searched canonical issue", async ({
  admin,
}) => {
  const token = randomUUID().slice(0, 8);
  const target = await createIssue(admin.request, {
    title: `Canonica ${token}`,
  });
  const source = await createIssue(admin.request, {
    title: `Duplicata ${token}`,
  });
  const page = await admin.context.newPage();
  await page.goto(`/issues/${source.id}`);
  await page.getByRole("button", { name: "Scadenza", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Data", { exact: true }).fill("2100-12-31");
  await dialog.getByRole("button", { name: "Salva scadenza" }).click();
  await expect(page.getByText("31/12/2100", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Segna duplicato", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Cerca issue canonica nel titolo o nella descrizione")
    .fill(target.title);
  await dialog.getByRole("button", { name: "Cerca canonica" }).click();
  await dialog
    .getByRole("radio", { name: new RegExp(`BB-${target.number}`) })
    .check();
  await dialog
    .getByRole("button", { name: "Segna duplicato", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Annulla duplicazione" }),
  ).toBeVisible();
  await expect(page.getByLabel("Commento", { exact: true })).toHaveCount(0);
  const stored = await apiRead<IssueDetail>(
    admin.request,
    `/issues/${source.id}`,
  );
  expect(stored).toMatchObject({
    status: "DUPLICATE",
    duplicateOf: { id: target.id },
    dueDate: "2100-12-31",
  });
});
