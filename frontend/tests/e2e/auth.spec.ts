import { randomUUID } from "node:crypto";
import { test, expect } from "./fixtures/session";
import { apiRead, apiWrite, createUser, csrf, login } from "./fixtures/api";
import type { Me } from "../../src/api/types";

test("login UI, cambio iniziale obbligatorio, profilo e logout reali", async ({
  admin,
  page,
}) => {
  const account = await createUser(admin.request, "MEMBER");
  await page.goto("/login");
  expect(
    (
      await page
        .getByRole("button", { name: "Mostra password", exact: true })
        .boundingBox()
    )?.height,
  ).toBeGreaterThanOrEqual(44);
  await page.getByLabel("Email", { exact: false }).fill(account.email);
  await page
    .getByLabel("Password *", { exact: true })
    .fill(account.temporaryPassword);
  await page.getByRole("button", { name: "Accedi", exact: true }).click();
  await expect(page).toHaveURL(/\/change-password$/);
  await expect(
    page.getByRole("heading", { name: "Cambia la password iniziale" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Navigazione principale" }),
  ).toHaveCount(0);
  await page
    .getByLabel("Password corrente *", { exact: true })
    .fill(account.temporaryPassword);
  await page
    .getByLabel("Nuova password *", { exact: true })
    .fill(account.password);
  await page
    .getByLabel("Conferma nuova password *", { exact: true })
    .fill(account.password);
  await page
    .getByRole("button", { name: "Salva password", exact: true })
    .click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("status")).toContainText("Password modificata");
  await page.getByLabel("Email", { exact: false }).fill(account.email);
  await page.getByLabel("Password *", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Accedi", exact: true }).click();
  await expect(page).toHaveURL(/\/issues$/);
  await page.goto("/profile");
  const name = `Nome aggiornato ${randomUUID().slice(0, 8)}`;
  await page.getByLabel("Nome", { exact: false }).fill(name);
  await page.getByRole("button", { name: "Salva nome" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Modifiche salvate" })).toBeVisible();
  expect((await apiRead<Me>(page.request, "/auth/me")).displayName).toBe(name);
  await expect(page.getByRole("link", { name: "Il tuo profilo", exact: true })).toContainText(name);
  await page.getByRole("button", { name: "Esci", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await page.request.get("/api/v1/auth/me")).status()).toBe(401);
});
test("un account VIEWER non vede comandi e viene respinto su URL/API admin", async ({
  viewer,
}) => {
  const page = await viewer.context.newPage();
  await page.goto("/issues");
  await expect(page.getByText("Sola lettura:", { exact: false })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Nuova issue", exact: true }),
  ).toHaveCount(0);
  await page.goto("/admin/users");
  await expect(
    page.getByRole("heading", { name: "Accesso non consentito" }),
  ).toBeVisible();
  expect((await viewer.request.get("/api/v1/admin/users")).status()).toBe(403);
  const response = await viewer.request.post("/api/v1/admin/labels", {
    headers: await csrf(viewer.request),
    data: { name: `forbidden-${randomUUID()}`, color: "blue" },
  });
  expect(response.status()).toBe(403);
});
test("il cambio password invalida anche una seconda sessione reale", async ({
  member,
  browser,
  baseURL,
}) => {
  const second = await browser.newContext({ baseURL });
  try {
    await login(second.request, member.email, member.password);
    const changed = `E2E-Second-${randomUUID()}!`;
    await apiWrite<void>(member.request, "/auth/password", "PUT", {
      currentPassword: member.password,
      newPassword: changed,
    });
    expect((await second.request.get("/api/v1/auth/me")).status()).toBe(401);
    expect((await member.request.get("/api/v1/auth/me")).status()).toBe(401);
    await login(member.request, member.email, changed);
  } finally {
    await second.close();
  }
});
