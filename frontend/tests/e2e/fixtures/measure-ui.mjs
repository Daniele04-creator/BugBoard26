/* global document */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import process from "node:process";
import { performance } from "node:perf_hooks";
import { URL } from "node:url";
import { chromium, expect } from "@playwright/test";

const baseURL = process.env.NFR_BASE_URL ?? "http://localhost:18088";
const email = process.env.NFR_ADMIN_EMAIL ?? "perf-admin@bugboard.local";
const passwordFile = process.env.NFR_PASSWORD_FILE;
if (!passwordFile)
  throw new Error(
    "NFR_PASSWORD_FILE must identify the private credential file",
  );
const password = (await readFile(passwordFile, "utf8")).trimEnd();
const outputFile = resolve(
  process.env.NFR_UI_REPORT ?? "../output/reports/ui-performance.json",
);
const browser = await chromium.launch();
const runs = [];
try {
  for (let run = 1; run <= 5; run++) {
    const context = await browser.newContext({
      baseURL,
      viewport: { width: 1440, height: 900 },
    });
    try {
      const csrfResponse = await context.request.get("/api/v1/auth/csrf");
      if (!csrfResponse.ok())
        throw new Error(`CSRF request returned HTTP ${csrfResponse.status()}`);
      const csrf = await csrfResponse.json();
      const authenticated = await context.request.post("/api/v1/auth/login", {
        headers: { [csrf.headerName]: csrf.token },
        data: { email, password },
      });
      if (!authenticated.ok())
        throw new Error(`Login returned HTTP ${authenticated.status()}`);
      const page = await context.newPage();
      const consoleErrors = [];
      const scriptDownloads = [];
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });
      page.on("pageerror", (error) => consoleErrors.push(error.message));
      page.on("response", (response) => {
        if (new URL(response.url()).pathname.endsWith(".js")) {
          scriptDownloads.push(
            response.body().then((body) => ({
              url: response.url(),
              sha256: createHash("sha256").update(body).digest("hex"),
              contentEncoding:
                response.headers()["content-encoding"] ?? "identity",
              bytes: body.length,
              gzipBytes: gzipSync(body).length,
            })),
          );
        }
      });
      const start = performance.now();
      await page.goto("/issues");
      await expect(page.locator("main a[data-issue-id]").first()).toBeVisible({
        timeout: 30_000,
      });
      await expect(
        page.getByRole("button", { name: /^Filtri/ }),
      ).toBeEnabled({ timeout: 30_000 });
      await expect(
        page.getByRole("button", { name: "Esporta", exact: true }),
      ).toBeEnabled({ timeout: 30_000 });
      await expect(
        page.getByRole("link", { name: "Nuova issue", exact: true }),
      ).toBeEnabled({ timeout: 30_000 });
      await page.evaluate(() => document.fonts.ready);
      const systemTypographyReady = await page.evaluate(() =>
        document.fonts.status === "loaded" && /Segoe UI|system-ui|-apple-system/.test(document.defaultView.getComputedStyle(document.body).fontFamily),
      );
      const firstUsableListMs = performance.now() - start;
      const scripts = await Promise.all(scriptDownloads);
      runs.push({
        run,
        firstUsableListMs,
        systemTypographyReady,
        initialGzipBytes: scripts.reduce(
          (sum, item) => sum + item.gzipBytes,
          0,
        ),
        scripts,
        consoleErrors,
      });
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
const ordered = runs
  .map((run) => run.firstUsableListMs)
  .sort((left, right) => left - right);
const medianMs = ordered[2];
const pass =
  medianMs <= 2500 &&
  runs.every(
    (run) =>
      run.initialGzipBytes <= 350 * 1024 && run.consoleErrors.length === 0 && run.systemTypographyReady,
  );
const report = {
  criterion: "NFR-03",
  measuredAt: new Date().toISOString(),
  baseURL,
  browser: "Chromium",
  browserVersion: browser.version(),
  viewport: { width: 1440, height: 900 },
  method:
    "Five fresh BrowserContexts; real API login before timing; production /issues navigation until first issue and filter/export/create controls usable, including the system typography ready. Gzip calculated from actual initial JavaScript response bodies.",
  thresholds: {
    medianMs: 2500,
    initialGzipBytes: 350 * 1024,
    consoleErrors: 0,
  },
  medianMs,
  runs,
  pass,
  limitation:
    "Console checks here cover initial lists. Critical flows are checked separately by protocol E2E. This measures local automated runs, not human task time.",
};
await mkdir(dirname(outputFile), { recursive: true });
await writeFile(outputFile, JSON.stringify(report, null, 2) + "\n");
process.stdout.write(
  `NFR-03 ${pass ? "PASS" : "FAIL"}: median=${medianMs.toFixed(2)}ms; JS gzip=${Math.max(...runs.map((run) => run.initialGzipBytes))} bytes; report=${outputFile}\n`,
);
if (!pass) process.exitCode = 1;
