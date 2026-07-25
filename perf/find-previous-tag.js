import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8" }).trim();

const releaseTagPattern =
  /^v(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)(?:-(?<prerelease>[0-9A-Za-z.-]+))?$/;

const parseReleaseTag = (tag) => {
  const match = releaseTagPattern.exec(tag);
  if (!match?.groups) {
    return undefined;
  }

  return {
    major: Number(match.groups.major),
    minor: Number(match.groups.minor),
    patch: Number(match.groups.patch),
    prerelease: match.groups.prerelease,
  };
};

const comparePrerelease = (left, right) => {
  if (left === right) {
    return 0;
  }

  if (!left) {
    return 1;
  }

  if (!right) {
    return -1;
  }

  const leftParts = left.split(".");
  const rightParts = right.split(".");
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index];
    const rightPart = rightParts[index];

    if (leftPart === undefined) {
      return -1;
    }

    if (rightPart === undefined) {
      return 1;
    }

    if (leftPart === rightPart) {
      continue;
    }

    const leftNumber = /^\d+$/.test(leftPart) ? Number(leftPart) : undefined;
    const rightNumber = /^\d+$/.test(rightPart) ? Number(rightPart) : undefined;

    if (leftNumber !== undefined && rightNumber !== undefined) {
      return leftNumber - rightNumber;
    }

    if (leftNumber !== undefined) {
      return -1;
    }

    if (rightNumber !== undefined) {
      return 1;
    }

    return leftPart.localeCompare(rightPart);
  }

  return 0;
};

const compareReleaseTags = (left, right) => {
  for (const key of ["major", "minor", "patch"]) {
    const difference = left.version[key] - right.version[key];
    if (difference !== 0) {
      return difference;
    }
  }

  return comparePrerelease(left.version.prerelease, right.version.prerelease);
};

export const selectPreviousTag = (tags, head) =>
  tags
    .map((tag) => ({ ...tag, version: parseReleaseTag(tag.tag) }))
    .filter((tag) => tag.version && tag.object !== head)
    .sort((left, right) => compareReleaseTags(right, left))[0];

const main = () => {
  const head = git("rev-parse", "HEAD");
  const tags = git(
    "for-each-ref",
    "--merged=HEAD",
    "--format=%(refname:short)",
    "refs/tags",
  )
    .split("\n")
    .filter(Boolean)
    .map((tag) => ({ tag, object: git("rev-list", "-n", "1", tag) }));

  const previous = selectPreviousTag(tags, head);
  if (!previous) {
    throw new Error("No previous canonical release tag is reachable from HEAD");
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
