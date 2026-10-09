import { randomUUID } from "node:crypto";
import { test, expect, chooseSelect } from "./fixtures/session";
import { apiRead, createIssue } from "./fixtures/api";
import type { IssueDetail, Label, Page } from "../../src/api/types";
test("label creation, rename and deactivation retain the existing issue association", async ({
  admin,
}) => {
  const page = await admin.context.newPage(),
    name = `UI-${randomUUID().slice(0, 8)}`;
  await page.goto("/admin/labels");
  await page.getByLabel("Nome nuova etichetta", { exact: false }).fill(name);
  await chooseSelect(page, "Colore", "Viola");
  await expect(page.locator(".label-live-preview .badge-purple")).toHaveText(name);
  await page
    .getByRole("button", { name: "Crea etichetta", exact: true })
    .click();
  await expect(
    page.getByText("Etichetta creata.", { exact: true }),
  ).toBeVisible();
  const labels = await apiRead<Page<Label>>(
      admin.request,
      `/labels?active=all&q=${name}`,
    ),
    label = labels.items.find((value) => value.name === name)!;
  expect(label).toBeTruthy();
  const issue = await createIssue(admin.request, { labelIds: [label.id] });
  await chooseSelect(page, "Stato etichetta", "Tutte");
  await page.getByLabel("Cerca etichetta", { exact: true }).fill(name);
  await page
    .getByRole("button", { name: `Modifica etichetta ${name}`, exact: true })
    .click();
  const renamed = `${name}-nuova`;
  await page.getByLabel("Nome etichetta", { exact: false }).fill(renamed);
  await page
    .getByRole("button", { name: "Salva etichetta", exact: true })
    .click();
  await expect(
    page.getByText("Etichetta aggiornata.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: `Disattiva etichetta ${renamed}`,
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Disattiva etichetta",
    exact: true,
  });
  await expect(dialog).toContainText("Le associazioni");
  await dialog.getByRole("button", { name: "Conferma disattivazione" }).click();
  await expect(
    page.getByText(
      "Etichetta disattivata. Le associazioni esistenti restano.",
      { exact: true },
    ),
  ).toBeVisible();
  const current = await apiRead<IssueDetail>(
    admin.request,
    `/issues/${issue.id}`,
  );
  expect(current.labels.find((value) => value.id === label.id)).toMatchObject({
    name: renamed,
    color: "purple",
    active: false,
  });
  await page
    .getByRole("button", { name: `Riattiva etichetta ${renamed}`, exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Riattiva etichetta", exact: true })
    .getByRole("button", { name: "Conferma riattivazione" })
    .click();
  await expect(
    page.getByText("Etichetta riattivata.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", {
      name: `Disattiva etichetta ${renamed}`,
      exact: true,
    }),
  ).toBeVisible();
});
