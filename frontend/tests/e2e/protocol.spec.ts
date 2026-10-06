import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test, expect } from "./fixtures/session";
import { apiRead, apiWrite } from "./fixtures/api";
import type {
  IssueDetail,
  IssueSummary,
  Label,
  Notification,
  Page as ApiPage,
  Comment,
  UserRef,
} from "../../src/api/types";
import type { AssignmentSuggestions } from "../../src/features/issues/issueApi";

test("VER08 U01→U02→U03 creates login evidence, assigns a verified minimum and completes the work", async ({
  admin,
  member,
}, testInfo) => {
  test.setTimeout(180_000);
  const consoleErrors: string[] = [];
  const timings: { task: string; seconds: number; outcome: string }[] = [];
  const memberPage = await member.context.newPage();
  const adminPage = await admin.context.newPage();
  for (const page of [memberPage, adminPage]) {
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));
  }
  const suffix = randomUUID().slice(0, 8);
  const label = await apiWrite<Label>(admin.request, "/admin/labels", "POST", {
    name: `Autenticazione ${suffix}`,
    color: "blue",
  });
  const title = `Errore login ${suffix}`;
  let started = performance.now();
  await memberPage.goto("/issues/new");
  await memberPage.getByLabel("Titolo *").fill(title);
  await memberPage
    .getByLabel("Descrizione *")
    .fill(
      "Il login fallisce dopo l’invio delle credenziali. Screenshot della risposta allegato.",
    );
  await memberPage.getByLabel("Tipo *").selectOption("BUG");
  await memberPage.getByLabel("Priorità").selectOption("HIGH");
  await memberPage
    .getByRole("checkbox", { name: label.name, exact: true })
    .check();
  const image = await readFile(
    new URL("./fixtures/issue-image.png", import.meta.url),
  );
  await memberPage
    .getByLabel("Immagine opzionale")
    .setInputFiles({ name: "login.png", mimeType: "image/png", buffer: image });
  await expect(
    memberPage.getByRole("img", { name: "Anteprima di login.png" }),
  ).toBeVisible();
  await memberPage
    .getByRole("button", { name: "Crea issue", exact: true })
    .click();
  await expect(
    memberPage.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  const id = new URL(memberPage.url()).pathname.split("/").at(-1)!;
  let stored = await apiRead<IssueDetail>(member.request, `/issues/${id}`);
  expect(stored).toMatchObject({
    type: "BUG",
    priority: "HIGH",
    status: "TODO",
    assignee: null,
    reporter: { id: member.user.id },
    image: { originalName: "login.png", width: 2, height: 2 },
  });
  expect(stored.labels.map((value) => value.id)).toContain(label.id);
  timings.push({
    task: "U-01",
    seconds: (performance.now() - started) / 1000,
    outcome: "PASS",
  });
  await testInfo.attach("U-01", {
    body: await memberPage.screenshot({ fullPage: true }),
    contentType: "image/png",
  });

  started = performance.now();
  await adminPage.goto(`/issues?q=${encodeURIComponent(title)}`);
  await adminPage
    .getByRole("link", { name: `BB-${stored.number} · ${title}`, exact: true })
    .click();
  const suggestions = await apiRead<AssignmentSuggestions>(
    admin.request,
    `/issues/${id}/assignment-suggestions`,
  );
  const eligible: UserRef[] = [];
  for (let page = 0; ; page++) {
    const result = await apiRead<ApiPage<UserRef>>(
      admin.request,
      `/admin/assignment-candidates?page=${page}&size=100`,
    );
    eligible.push(...result.items);
    if (page + 1 >= result.totalPages) break;
  }
  expect(suggestions.candidates.map((value) => value.user.id).sort()).toEqual(
    eligible.map((value) => value.id).sort(),
  );
  const verifiedCounts = await Promise.all(
    suggestions.candidates.map(async (candidate) => {
      const query = new URLSearchParams({
        archived: "false",
        assignedTo: candidate.user.id,
        size: "1",
      });
      query.append("status", "TODO");
      query.append("status", "IN_PROGRESS");
      const result = await apiRead<ApiPage<IssueSummary>>(
        admin.request,
        `/issues?${query}`,
      );
      expect(candidate.openIssueCount).toBe(result.totalElements);
      return {
        id: candidate.user.id,
        count: result.totalElements,
        rank: candidate.rank,
      };
    }),
  );
  const chosen = verifiedCounts.find((value) => value.id === member.user.id)!;
  expect(chosen).toBeDefined();
  expect(chosen.count).toBe(
    Math.min(...verifiedCounts.map((value) => value.count)),
  );
  await adminPage.getByRole("button", { name: "Assegna", exact: true }).click();
  let dialog = adminPage.getByRole("dialog");
  await dialog
    .getByLabel("Cerca utenti per nome")
    .fill(member.user.displayName);
  await dialog
    .getByRole("button", { name: "Cerca utenti", exact: true })
    .click();
  const option = dialog.getByRole("radio", {
    name: new RegExp(member.user.id.slice(0, 8)),
  });
  await expect(option.locator("..")).toContainText(
    `${chosen.count} issue aperte`,
  );
  await option.check();
  await dialog.getByRole("button", { name: "Conferma assegnazione" }).click();
  await expect(dialog).not.toBeVisible();
  stored = await apiRead<IssueDetail>(admin.request, `/issues/${id}`);
  expect(stored.assignee?.id).toBe(member.user.id);
  const inbox = await apiRead<ApiPage<Notification>>(
    member.request,
    "/notifications?size=100",
  );
  expect(
    inbox.items.some(
      (value) => value.type === "ASSIGNED" && value.issue.id === id,
    ),
  ).toBe(true);
  timings.push({
    task: "U-02",
    seconds: (performance.now() - started) / 1000,
    outcome: "PASS",
  });
  await testInfo.attach("candidate-counts", {
    body: JSON.stringify(
      { asOf: suggestions.asOf, chosen, verifiedCounts },
      null,
      2,
    ),
    contentType: "application/json",
  });
  await testInfo.attach("U-02", {
    body: await adminPage.screenshot({ fullPage: true }),
    contentType: "image/png",
  });

  started = performance.now();
  await memberPage.goto("/issues?assignedTo=me");
  await memberPage
    .getByLabel("Cerca nel titolo o nella descrizione")
    .fill(title);
  await memberPage.getByRole("button", { name: "Cerca", exact: true }).click();
  await memberPage
    .getByRole("link", { name: `BB-${stored.number} · ${title}`, exact: true })
    .click();
  const comment =
    "Causa: controllo del token login. Correzione verificata con credenziali valide.";
  await memberPage.getByLabel("Commento", { exact: true }).fill(comment);
  await memberPage.getByRole("button", { name: "Invia commento" }).click();
  await expect(
    memberPage.getByRole("status").filter({ hasText: "Commento inviato." }),
  ).toBeVisible();
  for (const [name, button, target] of [
    ["In corso", "Salva stato", "IN_PROGRESS"],
    ["Risolta", "Segna come risolta", "RESOLVED"],
  ]) {
    await memberPage
      .getByRole("button", { name: "Cambia stato", exact: true })
      .click();
    dialog = memberPage.getByRole("dialog");
    await dialog.getByRole("radio", { name, exact: true }).check();
    await dialog.getByRole("button", { name: button, exact: true }).click();
    await expect(dialog).not.toBeVisible();
    stored = await apiRead<IssueDetail>(member.request, `/issues/${id}`);
    expect(stored.status).toBe(target);
  }
  const comments = await apiRead<ApiPage<Comment>>(
    member.request,
    `/issues/${id}/comments`,
  );
  expect(comments.items.some((value) => value.body === comment)).toBe(true);
  const reporterInbox = await apiRead<ApiPage<Notification>>(
    member.request,
    "/notifications?size=100",
  );
  expect(
    reporterInbox.items.some(
      (value) => value.issue.id === id && value.type === "RESOLVED",
    ),
  ).toBe(true);
  expect(stored.resolvedAt).not.toBeNull();
  timings.push({
    task: "U-03",
    seconds: (performance.now() - started) / 1000,
    outcome: "PASS",
  });
  await testInfo.attach("U-03", {
    body: await memberPage.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
  await testInfo.attach("automation-timings", {
    body: JSON.stringify(
      {
        timings,
        consoleErrors,
        scope:
          "Automazione tecnica su dati sintetici; nessuna prova con persone.",
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
  expect(timings[0].seconds).toBeLessThanOrEqual(240);
  expect(timings[1].seconds).toBeLessThanOrEqual(180);
  expect(timings[2].seconds).toBeLessThanOrEqual(240);
  expect(consoleErrors).toEqual([]);
});
