import { randomUUID } from "node:crypto";
import { test, expect, chooseSelect } from "./fixtures/session";
import { apiRead, apiWrite, createIssue } from "./fixtures/api";
import type { IssueDetail, UserAdmin } from "../../src/api/types";

test("administrator creates an account, confirms access changes and resets its temporary password", async ({
  admin,
}) => {
  const page = await admin.context.newPage(),
    suffix = randomUUID().slice(0, 8),
    name = `Utente prova ${suffix}`,
    email = `ui-${suffix}@example.test`;
  await page.goto("/admin/users/new");
  await page.getByLabel("Nome", { exact: false }).fill(name);
  await page.getByLabel("Email", { exact: false }).fill(email);
  await page
    .getByLabel("Password temporanea", { exact: false })
    .and(page.locator("input"))
    .fill("UI temporary password 2026");
  await page.getByRole("button", { name: "Crea utente", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/users\/[0-9a-f-]+\/edit$/);
  await expect(
    page.getByRole("heading", { name, exact: true }),
  ).toBeVisible();
  await chooseSelect(page, "Ruolo", "Sola lettura");
  await page
    .getByRole("button", { name: "Salva modifiche", exact: true })
    .click();
  const access = page.getByRole("dialog", {
    name: "Conferma modifica dell'accesso",
  });
  await expect(access).toBeVisible();
  await access.getByRole("button", { name: "Conferma e salva" }).click();
  await expect(
    page.getByText("Modifiche salvate.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Imposta password temporanea", exact: true })
    .click();
  const reset = page.getByRole("dialog", {
    name: `Password temporanea per ${name}`,
  });
  await reset
    .getByLabel("Password temporanea", { exact: false })
    .and(reset.locator("input"))
    .fill("UI replacement password 2026");
  await reset
    .getByRole("button", { name: "Conferma password temporanea" })
    .click();
  await expect(reset).not.toBeVisible();
  await expect(
    page.getByText(
      "Password temporanea impostata. Il cambio è richiesto al prossimo accesso.",
      { exact: true },
    ),
  ).toBeVisible();
  const id = page.url().split("/").at(-2)!;
  const stored = await apiRead<UserAdmin>(admin.request, `/admin/users/${id}`);
  expect(stored.email).toBe(email);
  expect(stored.role).toBe("VIEWER");
  expect(stored.mustChangePassword).toBe(true);
});

test("open assignments explain a denied account deactivation without discarding the form", async ({
  admin,
  member,
}) => {
  const issue = await createIssue(admin.request);
  await apiWrite<IssueDetail>(
    admin.request,
    `/issues/${issue.id}/assignment`,
    "PUT",
    { assigneeId: member.user.id, expectedVersion: issue.version },
  );
  const page = await admin.context.newPage();
  await page.goto(`/admin/users/${member.user.id}/edit`);
  await page.getByLabel("Account attivo").uncheck();
  await page
    .getByRole("button", { name: "Salva modifiche", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Conferma modifica dell'accesso" })
    .getByRole("button", { name: "Conferma e salva" })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Riassegna prima le issue aperte",
  );
  await expect(page.getByLabel("Account attivo")).not.toBeChecked();
  await expect(
    page.getByRole("link", {
      name: "Apri le issue assegnate per riassegnarle",
    }),
  ).toHaveAttribute(
    "href",
    `/issues?assignedTo=${member.user.id}&status=TODO&status=IN_PROGRESS`,
  );
  expect(
    (await apiRead<UserAdmin>(admin.request, `/admin/users/${member.user.id}`))
      .active,
  ).toBe(true);
});

test("a real concurrent profile update preserves the draft and requires explicit version adoption", async ({
  admin,
  member,
}) => {
  const page = await admin.context.newPage();
  await page.goto(`/admin/users/${member.user.id}/edit`);
  await expect(
    page.getByRole("heading", { name: member.user.displayName, exact: true }),
  ).toBeVisible();
  const current = await apiRead<UserAdmin>(
    admin.request,
    `/admin/users/${member.user.id}`,
  );
  await page.getByLabel("Nome", { exact: false }).fill("Bozza preservata");
  await apiWrite<UserAdmin>(
    admin.request,
    `/admin/users/${member.user.id}`,
    "PATCH",
    {
      displayName: "Nome aggiornato altrove",
      role: current.role,
      active: current.active,
      expectedVersion: current.version,
    },
  );
  await page
    .getByRole("button", { name: "Salva modifiche", exact: true })
    .click();
  const conflict = page.getByRole("dialog", {
    name: "Account aggiornato da un altro utente",
  });
  await expect(conflict).toBeVisible();
  await expect(
    conflict.getByRole("cell", {
      name: "Nome aggiornato altrove",
      exact: true,
    }),
  ).toBeVisible();
  await conflict
    .getByRole("button", {
      name: "Mantieni la bozza e usa la versione corrente",
    })
    .click();
  await expect(page.getByLabel("Nome", { exact: false })).toHaveValue(
    "Bozza preservata",
  );
  await page
    .getByRole("button", { name: "Salva modifiche", exact: true })
    .click();
  await expect(
    page.getByText("Modifiche salvate.", { exact: true }),
  ).toBeVisible();
  expect(
    (await apiRead<UserAdmin>(admin.request, `/admin/users/${member.user.id}`))
      .displayName,
  ).toBe("Bozza preservata");
});
