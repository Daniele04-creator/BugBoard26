import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test, expect } from "./fixtures/session";
import { apiRead, apiWrite, createIssue } from "./fixtures/api";
import type { IssueDetail, Page, IssueSummary } from "../../src/api/types";
test("validates an oversized image locally and persists, displays and removes a valid attachment", async ({
  admin,
}) => {
  const page = await admin.context.newPage();
  const title = `Immagine UI ${randomUUID().slice(0, 8)}`;
  await page.goto("/issues/new");
  await page.getByLabel("Titolo *").fill(title);
  await page
    .getByLabel("Descrizione *")
    .fill("Passaggi con uno screenshot allegato e validato.");
  await page.getByLabel("Immagine opzionale").setInputFiles({
    name: "troppo-grande.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
  });
  await expect(page.getByRole("alert")).toContainText(
    "supera il limite di 5 MiB",
  );
  const buffer = await readFile(
    new URL("./fixtures/issue-image.png", import.meta.url),
  );
  await page
    .getByLabel("Immagine opzionale")
    .setInputFiles({ name: "screenshot.png", mimeType: "image/png", buffer });
  await expect(
    page.getByRole("img", { name: "Anteprima di screenshot.png" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Crea issue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  const id = page.url().split("/issues/")[1];
  const stored = await apiRead<IssueDetail>(admin.request, `/issues/${id}`);
  expect(stored.image).toMatchObject({
    originalName: "screenshot.png",
    width: 2,
    height: 2,
    contentType: "image/png",
  });
  await page
    .getByRole("button", { name: "Apri immagine · screenshot.png" })
    .click();
  await expect(page.getByRole("dialog").getByRole("img")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Chiudi screenshot.png" })
    .click();
  await page.getByRole("button", { name: "Gestisci immagine" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Rimuovi immagine" }).click();
  await dialog.getByRole("button", { name: "Conferma rimozione" }).click();
  await expect(dialog).toContainText("Immagine aggiornata");
  expect(
    (await apiRead<IssueDetail>(admin.request, `/issues/${id}`)).image,
  ).toBeNull();
});
test("creates a persisted issue and finds literal wildcard text through the URL", async ({
  member,
}) => {
  const page = await member.context.newPage();
  const title = `UI ${randomUUID().slice(0, 8)} %_ 😃`;
  await page.goto("/issues/new");
  await page.getByLabel("Titolo *").fill(title);
  await page
    .getByLabel("Descrizione *")
    .fill("Passaggi precisi per riprodurre il problema di salvataggio.");
  await page.getByLabel("Tipo *").selectOption("DOCUMENTATION");
  await page.getByLabel("Priorità").selectOption("CRITICAL");
  await page.getByRole("button", { name: "Crea issue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  const id = page.url().split("/issues/")[1];
  const stored = await apiRead<IssueDetail>(member.request, `/issues/${id}`);
  expect(stored).toMatchObject({
    title,
    type: "DOCUMENTATION",
    priority: "CRITICAL",
    status: "TODO",
    assignee: null,
    reporter: { id: member.user.id },
  });
  await page.goto("/issues");
  await page.getByLabel("Cerca nel titolo o nella descrizione").fill(title);
  await page.getByRole("button", { name: "Cerca", exact: true }).click();
  await expect(page).toHaveURL(/q=/);
  await expect(
    page.getByRole("link", {
      name: `BB-${stored.number} · ${title}`,
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByLabel("Cerca nel titolo o nella descrizione"),
  ).toHaveValue(title);
  const resultLink = page.getByRole("link", {
    name: `BB-${stored.number} · ${title}`,
    exact: true,
  });
  await resultLink.click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByLabel("Cerca nel titolo o nella descrizione"),
  ).toHaveValue(title);
  await expect(resultLink).toBeFocused();
  const result = await apiRead<Page<IssueSummary>>(
    member.request,
    `/issues?q=${encodeURIComponent(title)}`,
  );
  expect(result.items.map((item) => item.id)).toContain(id);
});
test("invalid filter URL offers an explicit reset", async ({ viewer }) => {
  const page = await viewer.context.newPage();
  await page.goto("/issues?status=WRONG");
  await expect(page.getByRole("alert")).toContainText(
    "Filtro status non valido",
  );
  await page.getByRole("button", { name: "Ripristina vista" }).click();
  await expect(page).toHaveURL(/\/issues$/);
});

test("out of range pages recover without discarding filters, page size or sort", async ({
  admin,
}) => {
  const issue = await createIssue(admin.request, {
    title: `Pagina ${randomUUID().slice(0, 8)}`,
    priority: "HIGH",
  });
  const filters = new URLSearchParams({
    q: issue.title,
    priority: "HIGH",
    type: "BUG",
    page: "999",
    size: "50",
    sort: "priority,desc",
  });
  const page = await admin.context.newPage();
  await page.goto(`/issues?${filters}`);
  await expect(
    page.getByRole("heading", { name: /Pagina fuori intervallo/ }),
  ).toBeVisible();
  await expect(
    page.getByText("Nessuna issue corrisponde ai filtri.", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Prima pagina", exact: true }).click();
  await expect(
    page.getByRole("link", {
      name: `BB-${issue.number} · ${issue.title}`,
      exact: true,
    }),
  ).toBeVisible();
  const recovered = new URL(page.url()).searchParams;
  filters.set("page", "0");
  expect([...recovered.entries()].sort()).toEqual(
    [...filters.entries()].sort(),
  );
});
test("concurrent edits preserve the draft and use a freshly confirmed version", async ({
  admin,
}) => {
  const issue = await createIssue(admin.request);
  const page = await admin.context.newPage();
  await page.goto(`/issues/${issue.id}/edit`);
  await page.getByLabel("Titolo *").fill("Bozza UI da conservare");
  const remote = await apiWrite<IssueDetail>(
    admin.request,
    `/issues/${issue.id}`,
    "PATCH",
    {
      title: "Modifica concorrente",
      description: issue.description,
      type: issue.type,
      priority: issue.priority,
      labelIds: [],
      expectedVersion: issue.version,
    },
  );
  await page.getByRole("button", { name: "Salva modifiche" }).click();
  await expect(page.getByLabel("Titolo *")).toHaveValue(
    "Bozza UI da conservare",
  );
  await expect(
    page.getByRole("button", { name: "Salva modifiche" }),
  ).toBeDisabled();
  await expect(
    page.getByText("Modifica concorrente", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Usa la versione corrente mantenendo la bozza",
    })
    .click();
  await page.getByRole("button", { name: "Salva modifiche" }).click();
  await expect(
    page.getByRole("heading", { name: "Bozza UI da conservare" }),
  ).toBeVisible();
  expect(
    await apiRead<IssueDetail>(admin.request, `/issues/${issue.id}`),
  ).toMatchObject({
    title: "Bozza UI da conservare",
    version: remote.version + 1,
  });
});
