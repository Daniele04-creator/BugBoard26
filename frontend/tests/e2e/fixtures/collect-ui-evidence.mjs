import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Buffer } from "node:buffer";
import process from "node:process";
import { createHash } from "node:crypto";

const inputPaths = process.env.UI_E2E_REPORTS
  ? JSON.parse(process.env.UI_E2E_REPORTS)
  : [process.env.UI_E2E_REPORT ?? "../output/reports/playwright-results.json"];
if (!Array.isArray(inputPaths) || !inputPaths.length)
  throw new Error("UI_E2E_REPORTS must contain a nonempty JSON array of paths");
const destination = resolve(
  process.env.UI_ACCEPTANCE_REPORT ?? "../output/reports/ui-acceptance.json",
);
const manifest = [];
const selected = new Map();
function visit(suites, tests, source) {
  for (const suite of suites ?? []) {
    for (const spec of suite.specs ?? [])
      for (const test of spec.tests ?? []) {
        const result = test.results.at(-1);
        tests.push({
          testId: spec.id,
          title: spec.title,
          file: spec.file,
          project: test.projectName,
          status: result.status,
          classification: test.status,
          durationMs: result.duration,
          attachments: result.attachments ?? [],
          source,
        });
      }
    visit(suite.suites, tests, source);
  }
}
for (const [index, input] of inputPaths.entries()) {
  const source = resolve(input);
  const raw = await readFile(source);
  const report = JSON.parse(raw.toString("utf8"));
  const current = [];
  visit(report.suites, current, source);
  if (index === 0 && current.length !== 67)
    throw new Error("The baseline report must cover all 67 required scenarios (61 existing and 6 redesign checks)");
  if (
    index > 0 &&
    Date.parse(report.stats.startTime) <
      Date.parse(manifest.at(-1).stats.startTime)
  )
    throw new Error("Reports must be supplied in chronological order");
  const seen = new Set();
  for (const test of current) {
    const identity = JSON.stringify([test.file, test.title, test.project]);
    if (seen.has(identity)) throw new Error("Duplicate scenario identity");
    seen.add(identity);
    const previous = selected.get(identity);
    if (index > 0 && !previous)
      throw new Error("Focused rerun contains a scenario absent from baseline");
    if (previous && previous.testId !== test.testId)
      throw new Error("Focused rerun changed the Playwright scenario ID");
    selected.set(identity, {
      ...test,
      history: [
        ...(previous?.history ?? []),
        { source, testId: test.testId, status: test.status },
      ],
    });
  }
  manifest.push({
    source,
    sha256: createHash("sha256").update(raw).digest("hex"),
    bytes: raw.length,
    stats: report.stats,
    scenarioCount: current.length,
  });
}
const tests = [...selected.values()];
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
const pass = tests.every(
  (test) => test.status === "passed" && test.classification === "expected",
);
const summary = {
  manifest,
  evidenceMode: manifest.length === 1 ? "single-run" : "composite",
  aggregation:
    "Latest result per identical Playwright ID and file/title/project identity. Raw source reports are unmodified and SHA256-addressed; focused runs must be chronological subsets of the 67-scenario baseline (61 existing plus 6 redesign checks). Earlier failures remain visible in each history and source stats.",
  startedAt: manifest[0].stats.startTime,
  durationMs: manifest.reduce((sum, item) => sum + item.stats.duration, 0),
  stats: {
    covered: tests.length,
    passed: tests.filter((test) => test.status === "passed").length,
    failed: tests.filter(
      (test) => test.status !== "passed" && test.status !== "skipped",
    ).length,
    skipped: tests.filter((test) => test.status === "skipped").length,
    flaky: tests.filter((test) => test.classification === "flaky").length,
  },
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
