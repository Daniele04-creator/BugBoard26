import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { URL } from "node:url";
import { chromium, expect } from "@playwright/test";

const frontend = process.env.CROSS_ORIGIN_FRONTEND ?? "http://localhost:5173";
const apiOrigin = process.env.CROSS_ORIGIN_API ?? "http://localhost:8080";
const output = resolve(
  process.env.CROSS_ORIGIN_REPORT ??
    "../output/reports/api-origin-browser.json",
);
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();
const apiResponses = [];
const errorsAfterLogin = [];
let authenticated = false;
page.on("response", (response) => {
  const url = new URL(response.url());
  if (url.pathname.startsWith("/api/v1/"))
    apiResponses.push({
      origin: url.origin,
      path: url.pathname,
      status: response.status(),
    });
});
page.on("console", (message) => {
  if (authenticated && message.type() === "error")
    errorsAfterLogin.push(message.text());
});
page.on("pageerror", (error) => errorsAfterLogin.push(error.message));
try {
  const navigation = await page.goto(frontend + "/login");
  const csp = navigation.headers()["content-security-policy"] ?? "";
  expect(csp).toContain(`connect-src 'self' ${apiOrigin};`);
  await page
    .getByLabel("Email", { exact: false })
    .fill(process.env.E2E_ADMIN_EMAIL ?? "admin@bugboard.local");
  await page
    .getByLabel("Password *", { exact: true })
    .fill(process.env.E2E_ADMIN_PASSWORD ?? "E2E-Admin-Ready-2026!");
  await page.getByRole("button", { name: "Accedi", exact: true }).click();
  await expect(page).toHaveURL(frontend + "/issues");
  authenticated = true;
  await expect(page.locator("main a[data-issue-id]").first()).toBeVisible();
  await page.reload();
  await expect(page.locator("main a[data-issue-id]").first()).toBeVisible();
  expect(apiResponses.length).toBeGreaterThan(3);
  expect(apiResponses.every((response) => response.origin === apiOrigin)).toBe(
    true,
  );
  expect(
    apiResponses.some(
      (response) =>
        response.path === "/api/v1/auth/login" && response.status === 200,
    ),
  ).toBe(true);
  expect(
    apiResponses.some(
      (response) =>
        response.path === "/api/v1/issues" && response.status === 200,
    ),
  ).toBe(true);
  expect(
    apiResponses.filter(
      (response) =>
        response.status >= 400 &&
        !(response.path === "/api/v1/auth/me" && response.status === 401),
    ),
  ).toEqual([]);
  expect(errorsAfterLogin).toEqual([]);
  const report = {
    criterion: "ARC-02",
    measuredAt: new Date().toISOString(),
    frontend,
    apiOrigin,
    browserVersion: browser.version(),
    csp,
    apiResponses,
    errorsAfterLogin,
    pass: true,
    scope:
      "Production frontend configured to a different API origin; real browser login, cookies, CSRF, CORS, listing and reload. Anonymous auth/me 401 before login is expected. No credentials or cookies are included in this report.",
  };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  process.stdout.write(
    `ARC-02 PASS: ${apiResponses.length} real API responses from ${apiOrigin}; report=${output}\n`,
  );
} finally {
  await context.close();
  await browser.close();
}
