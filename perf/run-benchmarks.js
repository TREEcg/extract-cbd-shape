import { spawnSync } from "node:child_process";

const benchmarks = new Map([
  ["inband", "./perf/perftest-inband.js"],
  ["inband-diskstore", "./perf/perftest-inband-diskstore.js"],
  ["inband-percent", "./perf/perftest-inband-percent.js"],
  ["page", "./perf/perftest-page.js"],
]);

const configuredSuites = process.env.BENCHMARK_SUITES;
const suites = configuredSuites
  ? configuredSuites.split(",").map((suite) => suite.trim()).filter(Boolean)
  : [...benchmarks.keys()];

for (const suite of suites) {
  const file = benchmarks.get(suite);
  if (!file) {
    throw new Error(`Unknown benchmark suite: ${suite}`);
  }

  const result = spawnSync(process.execPath, [file], {
    stdio: "inherit",
    env: process.env,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
