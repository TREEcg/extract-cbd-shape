import { describe, expect, it } from "vitest";

import { selectPreviousTag } from "../../perf/find-previous-tag.js";

describe("selectPreviousTag", () => {
  it("ignores mixed historical tags and selects the latest canonical release tag", () => {
    const head = "current";
    const previous = selectPreviousTag(
      [
        { tag: "0.3.0b", object: "experimental-beta" },
        { tag: "0.3.0-alpha", object: "experimental-alpha" },
        { tag: "0.1.13", object: "legacy-unprefixed" },
        { tag: "v0.1.15", object: "release-15" },
        { tag: "v0.1.14", object: "release-14" },
      ],
      head,
    );

    expect(previous).toMatchObject({
      tag: "v0.1.15",
      object: "release-15",
    });
  });

  it("skips a release tag that points at HEAD", () => {
    const previous = selectPreviousTag(
      [
        { tag: "v0.1.16", object: "current" },
        { tag: "v0.1.15", object: "release-15" },
        { tag: "v0.1.14", object: "release-14" },
      ],
      "current",
    );

    expect(previous).toMatchObject({
      tag: "v0.1.15",
      object: "release-15",
    });
  });

  it("treats stable releases as newer than prereleases with the same version", () => {
    const previous = selectPreviousTag(
      [
        { tag: "v0.3.0-alpha", object: "prerelease" },
        { tag: "v0.3.0", object: "stable" },
        { tag: "v0.2.9", object: "older" },
      ],
      "current",
    );

    expect(previous).toMatchObject({
      tag: "v0.3.0",
      object: "stable",
    });
  });
});
