import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test, expect, chooseSelect } from "./fixtures/session";
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
  await chooseSelect(page, "Tipo", "Documentazione");
  await chooseSelect(page, "Priorità", "Critica");
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
  await page.getByLabel("Cerca issue").fill(title);
  await page.getByLabel("Cerca issue").press("Enter");
  await expect(page).toHaveURL(/q=/);
  await expect(
    page.getByRole("link", {
      name: `BB-${stored.number} · ${title}`,
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByLabel("Cerca issue"),
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
    page.getByLabel("Cerca issue"),
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

test("archive out of range pages recover without discarding filters, page size or sort", async ({
  admin,
}) => {
  const issue = await createIssue(admin.request, {
    title: `Pagina ${randomUUID().slice(0, 8)}`,
    priority: "HIGH",
  });
  await apiWrite(admin.request, `/issues/${issue.id}/archive`, "PUT", {
    archived: true,
    expectedVersion: issue.version,
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
  await page.goto(`/archive?${filters}`);
  await expect(
    page.getByRole("heading", { name: /Pagina fuori intervallo/ }),
  ).toBeVisible();
  await expect(
    page.getByText("Nessuna issue in questa vista", { exact: true }),
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


test("personal board preserves filters through detail navigation and exports only matching work", async ({ admin, member }) => {
  const token = `Bacheca ${randomUUID().slice(0, 8)}`;
  let assigned = await createIssue(admin.request, { title: `${token} assegnata`, priority: "HIGH" });
  const other = await createIssue(admin.request, { title: `${token} non assegnata`, priority: "HIGH" });
  assigned = await apiWrite<IssueDetail>(admin.request, `/issues/${assigned.id}/assignment`, "PUT", {
    assigneeId: member.user.id, expectedVersion: assigned.version,
  });
  const page = await member.context.newPage();
  const filters = new URLSearchParams({ q: token, priority: "HIGH", status: "TODO", sort: "title,asc" });
  await page.goto(`/issues?${filters}`);
  await expect(page.getByRole("region", { name: "Bacheca issue", exact: true }).locator("a[data-issue-id]")).toHaveCount(2);
  await page.getByRole("link", { name: "Assegnate a me", exact: true }).click();
  const personal = new URL(page.url()).searchParams;
  expect(personal.get("assignedTo")).toBe("me");
  for (const [key, value] of filters) expect(personal.get(key)).toBe(value);
  await expect(page.locator(".issue-results-footer").getByRole("status")).toHaveText("1 issue");
  const card = page.locator(`a[data-issue-id="${assigned.id}"]`);
  await card.click();
  await expect(page.getByRole("heading", { name: assigned.title, exact: true })).toBeVisible();
  await page.locator(".issue-context > a").click();
  expect(new URL(page.url()).searchParams.toString()).toBe(personal.toString());
  await expect(card).toBeFocused();
  await page.getByRole("button", { name: "Filtri", exact: true }).click();
  await chooseSelect(page, "Tipo", "Bug");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Filtri", exact: true })).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: "Rimuovi filtro Priorità: Alta", exact: true }).click();
  const remaining = new URL(page.url()).searchParams;
  expect(remaining.get("assignedTo")).toBe("me");
  expect(remaining.get("type")).toBe("BUG");
  expect(remaining.get("status")).toBe("TODO");
  expect(remaining.has("priority")).toBe(false);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Esporta", exact: true }).click();
  const csv = await download;
  expect(csv.suggestedFilename()).toMatch(/\.csv$/);
  const path = await csv.path();
  expect(path).not.toBeNull();
  const content = await readFile(path!, "utf8");
  expect(content).toContain(assigned.title);
  expect(content).not.toContain(other.title);
  const server = await apiRead<Page<IssueSummary>>(member.request, `/issues?${remaining}&archived=false`);
  expect(server.items.map(issue => issue.id)).toEqual([assigned.id]);
});
