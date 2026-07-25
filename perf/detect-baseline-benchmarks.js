import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const configuredDist = process.env.EXTRACT_CBD_SHAPE_DIST;
if (!configuredDist) {
  throw new Error("EXTRACT_CBD_SHAPE_DIST is required");
}

const distUrl = pathToFileURL(path.resolve(configuredDist) + path.sep);
const packageModule = await import(new URL("extract-cbd-shape.js", distUrl));

const suites = ["inband", "inband-percent", "page"];
const skipped = [];

if (typeof packageModule.createGraphIndexedRdfStore === "function") {
  suites.splice(1, 0, "inband-diskstore");
} else {
  skipped.push(
    "inband-diskstore: baseline release does not expose a store-agnostic factory",
  );
}

const appendEnv = (name, value) => {
  if (process.env.GITHUB_ENV) {
    fs.appendFileSync(process.env.GITHUB_ENV, `${name}=${value}\n`);
  }
};

const appendOutput = (name, value) => {
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  }
};

appendEnv("BENCHMARK_SUITES", suites.join(","));
appendEnv("BENCHMARK_SKIPPED_SUITES", skipped.join("; "));
appendOutput("suites", suites.join(","));
appendOutput("skipped", skipped.join("; "));

console.log(`Comparable benchmark suites: ${suites.join(", ")}`);
if (skipped.length > 0) {
  console.log(`Skipped benchmark suites: ${skipped.join("; ")}`);
}
