import { test, expect } from "./fixtures/session";
import {
  apiRead,
  apiWrite,
  createIssue,
  createUser,
  login,
} from "./fixtures/api";
import type {
  IssueDetail,
  Notification,
  Page,
  UserRef,
} from "../../src/api/types";
test("assigns an eligible user in the load dialog and atomically notifies that user", async ({
  admin,
  member,
}) => {
  const issue = await createIssue(admin.request);
  const page = await admin.context.newPage();
  await page.goto(`/issues/${issue.id}`);
  await page.getByRole("button", { name: "Assegna", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText("Un solo responsabile.", { exact: false }),
  ).toBeVisible();
  await dialog
    .getByLabel("Cerca utenti per nome")
    .fill(member.user.displayName);
  await dialog
    .getByRole("button", { name: "Cerca utenti", exact: true })
    .click();
  await dialog
    .getByRole("radio", { name: new RegExp(member.user.displayName) })
    .check();
  await dialog.getByRole("button", { name: "Conferma assegnazione" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Riassegna" })).toBeVisible();
  const stored = await apiRead<IssueDetail>(
    admin.request,
    `/issues/${issue.id}`,
  );
  expect(stored.assignee?.id).toBe(member.user.id);
  const inbox = await apiRead<Page<Notification>>(
    member.request,
    "/notifications?unreadOnly=true",
  );
  expect(
    inbox.items.some(
      (notification) =>
        notification.type === "ASSIGNED" && notification.issue.id === issue.id,
    ),
  ).toBe(true);
});

test("manual assignment survives pagination when workload service is unavailable", async ({
  admin,
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);
  let eligible = await apiRead<Page<UserRef>>(
    admin.request,
    "/admin/assignment-candidates?page=0&size=100",
  );
  for (let index = eligible.totalElements; index < 21; index++) {
    const account = await createUser(admin.request, "MEMBER");
    const context = await browser.newContext({ baseURL });
    try {
      await login(context.request, account.email, account.temporaryPassword);
      await apiWrite(context.request, "/auth/password", "PUT", {
        currentPassword: account.temporaryPassword,
        newPassword: account.password,
      });
    } finally {
      await context.close();
    }
  }
  eligible = await apiRead<Page<UserRef>>(
    admin.request,
    "/admin/assignment-candidates?page=0&size=100",
  );
  expect(eligible.totalElements).toBeGreaterThanOrEqual(21);
  const firstPage = await apiRead<Page<UserRef>>(
    admin.request,
    "/admin/assignment-candidates?page=0&size=20",
  );
  const secondPage = await apiRead<Page<UserRef>>(
    admin.request,
    "/admin/assignment-candidates?page=1&size=20",
  );
  const chosen = firstPage.items[0];
  const current = secondPage.items[0];
  let issue = await createIssue(admin.request);
  issue = await apiWrite<IssueDetail>(
    admin.request,
    `/issues/${issue.id}/assignment`,
    "PUT",
    { assigneeId: current.id, expectedVersion: issue.version },
  );
  const page = await admin.context.newPage();
  await page.route(
    `**/api/v1/issues/${issue.id}/assignment-suggestions`,
    (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/problem+json",
        body: JSON.stringify({
          status: 503,
          code: "SERVICE_UNAVAILABLE",
          detail: "Carichi indisponibili per la prova di resilienza",
          fieldErrors: [],
        }),
      }),
  );
  await page.goto(`/issues/${issue.id}`);
  await page.getByRole("button", { name: "Riassegna", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText(/Carico non disponibile\. Puoi scegliere/),
  ).toBeVisible();
  await expect(
    dialog.getByRole("radio", { name: new RegExp(current.id.slice(0, 8)) }),
  ).toBeChecked();
  await expect(
    dialog.getByRole("radio", { name: "Nessuna assegnazione", exact: true }),
  ).not.toBeChecked();
  await dialog
    .getByRole("radio", { name: new RegExp(chosen.id.slice(0, 8)) })
    .check();
  await dialog.getByRole("button", { name: "Successiva", exact: true }).click();
  await expect(dialog.getByText(/Pagina 2 di/)).toBeVisible();
  await expect(
    dialog.getByRole("radio", { name: new RegExp(chosen.id.slice(0, 8)) }),
  ).toBeChecked();
  await expect(
    dialog.getByRole("button", { name: "Conferma assegnazione" }),
  ).toBeEnabled();
  await dialog.getByRole("button", { name: "Conferma assegnazione" }).click();
  await expect(dialog).not.toBeVisible();
  expect(
    (await apiRead<IssueDetail>(admin.request, `/issues/${issue.id}`)).assignee
      ?.id,
  ).toBe(chosen.id);
});
