import { test as base, expect } from "@playwright/test";
import type { APIRequestContext, BrowserContext, Locator, Page } from "@playwright/test";
import type { Me, UserRole } from "../../../src/api/types";
import { adminEmail, adminPassword, apiWrite, createUser, login } from "./api";

export interface SessionAccount {
  context: BrowserContext;
  request: APIRequestContext;
  user: Me;
  email: string;
  password: string;
}
interface Accounts {
  admin: SessionAccount;
  member: SessionAccount;
  viewer: SessionAccount;
}
export const test = base.extend<Accounts>({
  admin: async ({ browser, baseURL, viewport }, use) => {
    const context = await browser.newContext({ baseURL, viewport });
    const user = await login(context.request, adminEmail, adminPassword);
    try {
      await use({
        context,
        request: context.request,
        user,
        email: adminEmail,
        password: adminPassword,
      });
    } finally {
      await context.close();
    }
  },
  member: async ({ browser, baseURL, viewport, admin }, use) => {
    const account = await createUser(admin.request, "MEMBER");
    const context = await browser.newContext({ baseURL, viewport });
    const user = await authenticateCreated(context, account);
    try {
      await use({
        context,
        request: context.request,
        user,
        email: account.email,
        password: account.password,
      });
    } finally {
      await context.close();
    }
  },
  viewer: async ({ browser, baseURL, viewport, admin }, use) => {
    const account = await createUser(admin.request, "VIEWER");
    const context = await browser.newContext({ baseURL, viewport });
    const user = await authenticateCreated(context, account);
    try {
      await use({
        context,
        request: context.request,
        user,
        email: account.email,
        password: account.password,
      });
    } finally {
      await context.close();
    }
  },
});
async function authenticateCreated(
  context: BrowserContext,
  account: {
    email: string;
    temporaryPassword: string;
    password: string;
    user: { role: UserRole };
  },
) {
  await login(context.request, account.email, account.temporaryPassword);
  await apiWrite<void>(context.request, "/auth/password", "PUT", {
    currentPassword: account.temporaryPassword,
    newPassword: account.password,
  });
  const user = await login(context.request, account.email, account.password);
  expect(user.mustChangePassword).toBe(false);
  return user;
}
export { expect };

/** Select through the visible control and its accessible option panel. */
export async function chooseSelect(page: Page, label: string, option: string, scope: Locator = page.locator("body")) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const trigger = scope.getByRole("button", { name: new RegExp(`^${escaped}(?:\\s|:|$)`) });
  await trigger.click();
  await page.getByRole("listbox").getByRole("option", { name: option, exact: true }).click();
  await expect(trigger).toContainText(option);
  await expect(page.getByRole("listbox")).toHaveCount(0);
}

/** Reveal contextual commands before testing or activating them. */
export async function issueAction(page: Page, name: string) {
  const actions = page.locator(".issue-actions-menu");
  if (!(await actions.evaluate(element => element.hasAttribute("open"))))
    await actions.locator('summary[aria-label="Altre azioni sulla issue"]').click();
  await expect(actions).toHaveAttribute("open", "");
  return actions.getByRole("button", { name, exact: true });
}
