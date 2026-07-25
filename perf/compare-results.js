import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const previousDir =
  process.env.PREVIOUS_RESULTS_DIR || "./perf/comparison/previous";
const currentDir =
  process.env.CURRENT_RESULTS_DIR || "./perf/comparison/current";
const outputFile =
  process.env.PERFORMANCE_REPORT || "./perf/results/performance-comparison.md";
const threshold = Number(process.env.PERFORMANCE_REGRESSION_RATIO || "1.25");

const suites = [
  ["inband", "In-memory extraction"],
  ["inband-diskstore", "Disk-store extraction"],
  ["inband-percent", "Dataset selectivity"],
  ["page", "1,000-member pages"],
];

const readResults = (directory, suite) => {
  const file = path.join(directory, `${suite}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`Missing benchmark results: ${file}`);
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
};

const formatOps = (value) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
const formatPercent = (ratio) => {
  const value = (ratio - 1) * 100;
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
};
const escapeCell = (value) => String(value).replaceAll("|", "\\|");

const rows = [];
const missing = [];
for (const [suite, label] of suites) {
  const previous = new Map(
    readResults(previousDir, suite).map((result) => [result.name, result]),
  );
  const current = readResults(currentDir, suite);

  for (const result of current) {
    const baseline = previous.get(result.name);
    if (!baseline) {
      missing.push(`${label}: ${result.name}`);
      continue;
    }

    const currentRatio = result.opsPerSecond / baseline.opsPerSecond;
    const previousRatio = baseline.opsPerSecond / result.opsPerSecond;
    const regressed = previousRatio >= threshold;
    rows.push({
      suite: label,
      name: result.name,
      previous: baseline.opsPerSecond,
      current: result.opsPerSecond,
      currentRatio,
      regressed,
    });
  }
}

const regressions = rows.filter((row) => row.regressed);
const status =
  regressions.length === 0 && missing.length === 0
    ? "✅ Passed"
    : "❌ Failed";
const cpu = os.cpus()[0]?.model || "Unknown CPU";
const baselineTag = process.env.BASELINE_TAG || "previous tag";
const currentRevision = process.env.CURRENT_REVISION || "current revision";

const lines = [
  "# Performance comparison",
  "",
  `${status} — ${rows.length} benchmark cases compared on the same runner.`,
  "",
  `The job fails when **${baselineTag} is at least ${(
    (threshold - 1) *
    100
  ).toFixed(0)}% faster** than ${currentRevision} for any benchmark case.`,
  "",
  `- Runner CPU: \`${cpu}\``,
  `- Node.js: \`${process.version}\``,
  `- Baseline: \`${baselineTag}\``,
  `- Current: \`${currentRevision}\``,
  "",
  "| Suite | Benchmark | Previous tag | Current | Current vs previous | Result |",
  "| --- | --- | ---: | ---: | ---: | :---: |",
  ...rows.map((row) =>
    [
      escapeCell(row.suite),
      `\`${escapeCell(row.name)}\``,
      `${formatOps(row.previous)} ops/s`,
      `${formatOps(row.current)} ops/s`,
      formatPercent(row.currentRatio),
      row.regressed ? "❌" : "✅",
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"),
  ),
];

if (missing.length > 0) {
  lines.push(
    "",
    "## Missing baseline cases",
    "",
    ...missing.map((entry) => `- ${entry}`),
  );
}

lines.push(
  "",
  regressions.length > 0
    ? `**${regressions.length} performance regression${
        regressions.length === 1 ? "" : "s"
      } exceeded the threshold.**`
    : "**No performance regression exceeded the threshold.**",
  "",
);

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, lines.join("\n"));
console.log(lines.join("\n"));

if (regressions.length > 0 || missing.length > 0) {
  process.exitCode = 1;
}
