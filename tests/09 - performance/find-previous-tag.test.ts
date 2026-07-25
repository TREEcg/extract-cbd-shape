import { describe, expect, it } from "vitest";

import { selectPreviousTag } from "../../perf/find-previous-tag.js";

describe("selectPreviousTag", () => {
  it("selects the newest reachable tag in git order, including mixed tag formats", () => {
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
      tag: "0.3.0b",
      object: "experimental-beta",
    });
  });

  it("skips a tag that points at HEAD", () => {
    const previous = selectPreviousTag(
      [
        { tag: "0.3.0-b", object: "current" },
        { tag: "0.3.0b", object: "previous" },
        { tag: "0.3.0-alpha", object: "older" },
      ],
      "current",
    );

    expect(previous).toMatchObject({
      tag: "0.3.0b",
      object: "previous",
    });
  });

  it("returns undefined when no earlier tag exists", () => {
    const previous = selectPreviousTag(
      [{ tag: "0.3.0-b", object: "current" }],
      "current",
    );

    expect(previous).toBeUndefined();
  });
});
