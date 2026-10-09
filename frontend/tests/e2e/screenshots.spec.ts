import { test, expect, chooseSelect } from "./fixtures/session";
import { apiRead, login } from "./fixtures/api";
import type { IssueDetail } from "../../src/api/types";

test("mockup ad alta risoluzione dei tre casi significativi da flussi e dati reali", async ({
  admin,
  member,
  browser,
  baseURL,
}, testInfo) => {
  const memberContext = await browser.newContext({
    baseURL,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const adminContext = await browser.newContext({
    baseURL,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  try {
    await login(memberContext.request, member.email, member.password);
    await login(adminContext.request, admin.email, admin.password);
    const memberPage = await memberContext.newPage();
    const adminPage = await adminContext.newPage();
    await memberPage.goto("/issues/new");
    const title = `Errore nel salvataggio della configurazione ${Date.now()}`;
    await memberPage.getByLabel("Titolo", { exact: false }).fill(title);
    await memberPage
      .getByLabel("Descrizione", { exact: false })
      .fill(
        "Quando confermo le nuove impostazioni il sistema mostra un errore. Il problema si riproduce dopo aver modificato il nome del progetto e selezionato Salva.",
      );
    await chooseSelect(memberPage, "Priorità", "Alta");
    await expect(
      memberPage.getByRole("button", { name: "Crea issue", exact: true }),
    ).toBeEnabled();
    const creationPath = "../output/reports/mockups/01-creazione-issue.png";
    await memberPage.screenshot({ path: creationPath, fullPage: true });
    await testInfo.attach("UC-02 creazione", {
      path: creationPath,
      contentType: "image/png",
    });
    await memberPage
      .getByRole("button", { name: "Crea issue", exact: true })
      .click();
    await expect(memberPage).toHaveURL(/\/issues\/[0-9a-f-]+$/);
    const id = new URL(memberPage.url()).pathname.split("/").at(-1)!;
    await adminPage.goto(`/issues/${id}`);
    await adminPage
      .getByRole("button", { name: /^Responsabile:/ })
      .click();
    const assignment = adminPage.getByRole("dialog");
    await expect(assignment).toBeVisible();
    await assignment
      .getByLabel("Cerca utenti per nome", { exact: true })
      .fill(member.user.displayName);
    await assignment
      .getByRole("button", { name: "Cerca utenti", exact: true })
      .click();
    await assignment
      .getByRole("radio", { name: new RegExp(member.user.displayName) })
      .check();
    const assignmentPath =
      "../output/reports/mockups/02-assegnazione-issue.png";
    await adminPage.screenshot({ path: assignmentPath, fullPage: false });
    await testInfo.attach("UC-04 assegnazione", {
      path: assignmentPath,
      contentType: "image/png",
    });
    await assignment
      .getByRole("button", { name: "Conferma assegnazione", exact: true })
      .click();
    await expect(assignment).toHaveCount(0);
    await memberPage.goto(`/issues/${id}`);
    await memberPage
      .getByRole("button", { name: /^Stato:/ })
      .click();
    const resolution = memberPage.getByRole("dialog");
    await resolution
      .getByRole("radio", { name: "Risolta", exact: true })
      .check();
    const resolutionPath = "../output/reports/mockups/03-risoluzione-issue.png";
    await memberPage.screenshot({ path: resolutionPath, fullPage: false });
    await testInfo.attach("UC-06 risoluzione", {
      path: resolutionPath,
      contentType: "image/png",
    });
    await resolution
      .getByRole("button", { name: "Segna come risolta", exact: true })
      .click();
    await expect(resolution).toHaveCount(0);
    expect(
      (await apiRead<IssueDetail>(memberContext.request, `/issues/${id}`))
        .status,
    ).toBe("RESOLVED");
  } finally {
    await memberContext.close();
    await adminContext.close();
  }
});
