import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8" }).trim();

export const selectPreviousTag = (tags, head) =>
  tags.find(({ object }) => object !== head);

const main = () => {
  const head = git("rev-parse", "HEAD");
  const tags = git(
    "for-each-ref",
    "--merged=HEAD",
    "--sort=-creatordate",
    "--format=%(refname:short)",
    "refs/tags",
  )
    .split("\n")
    .filter(Boolean)
    .map((tag) => ({ tag, object: git("rev-list", "-n", "1", tag) }));

  const previous = selectPreviousTag(tags, head);
  if (!previous) {
    throw new Error("No previous tag is reachable from HEAD");
  }

  console.log(`Previous tag: ${previous.tag} (${previous.object})`);

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `tag=${previous.tag}\n`);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `sha=${previous.object}\n`);
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
