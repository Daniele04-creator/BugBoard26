import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Buffer } from "node:buffer";
import process from "node:process";

const source = resolve(
  process.env.UI_E2E_REPORT ?? "../output/reports/playwright-results.json",
);
const destination = resolve(
  process.env.UI_ACCEPTANCE_REPORT ?? "../output/reports/ui-acceptance.json",
);
const report = JSON.parse(await readFile(source, "utf8"));
const tests = [];
function visit(suites) {
  for (const suite of suites ?? []) {
    for (const spec of suite.specs ?? [])
      for (const test of spec.tests ?? []) {
        const result = test.results.at(-1);
        tests.push({
          title: spec.title,
          file: spec.file,
          project: test.projectName,
          status: result.status,
          durationMs: result.duration,
          attachments: result.attachments ?? [],
        });
      }
    visit(suite.suites);
  }
}
visit(report.suites);
const axe = [];
const tasks = [];
for (const test of tests)
  for (const attachment of test.attachments) {
    if (!attachment.body || attachment.contentType !== "application/json")
      continue;
    const value = JSON.parse(
      Buffer.from(attachment.body, "base64").toString("utf8"),
    );
    if (attachment.name.startsWith("axe-"))
      axe.push({
        name: attachment.name,
        project: test.project,
        url: value.url,
        engine: value.testEngine,
        environment: value.testEnvironment,
        violations: value.violations,
        incomplete: value.incomplete.length,
      });
    if (attachment.name === "automation-timings")
      tasks.push({ project: test.project, ...value });
    if (
      attachment.name === "U-04-results" ||
      attachment.name === "U-05-results"
    )
      tasks.push({
        project: test.project,
        task: attachment.name.slice(0, 4),
        ...value,
      });
  }
const pass =
  report.stats.unexpected === 0 &&
  report.stats.skipped === 0 &&
  report.stats.flaky === 0;
const summary = {
  source,
  startedAt: report.stats.startTime,
  durationMs: report.stats.duration,
  stats: report.stats,
  pass,
  projects: [...new Set(tests.map((test) => test.project))],
  tests: tests.map(({ attachments, ...test }) => ({
    ...test,
    evidence: attachments.map(({ name, path, contentType }) => ({
      name,
      path,
      contentType,
    })),
  })),
  axe,
  tasks,
  verifiedScope:
    "Browser workflows on synthetic accounts and real services; keyboard, focus, responsive layouts, zoom/text spacing and axe are assertions in the listed tests. A single assignment resilience test injects a synthetic 503 only for workload suggestions; candidate reads and saved assignment use real services.",
  limitations:
    "No human participants, survey, satisfaction score or inferred human task times. Automated timings establish technical completion only. Visual inspection is separate from axe; aesthetics are not measured objectively.",
};
await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, JSON.stringify(summary, null, 2) + "\n");
process.stdout.write(
  `UI ${pass ? "PASS" : "FAIL"}: ${tests.length} tests; ${axe.length} attached axe runs; report=${destination}\n`,
);
if (!pass) process.exitCode = 1;
