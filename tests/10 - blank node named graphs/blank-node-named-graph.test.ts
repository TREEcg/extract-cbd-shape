import { describe, it, beforeAll, expect } from "vitest";
import { DataFactory } from "rdf-data-factory";
import { CBDShapeExtractor } from "../../lib/extract-cbd-shape";
import { RdfStore } from "rdf-stores";
import { rdfDereferencer } from "rdf-dereference";
import type { Quad } from "@rdfjs/types";

const df = new DataFactory();

/**
 * Covers LDES10-EXTRACT-006/007/008 of the LDES client conformance test suite:
 * a blank node used as a named graph must be followed as well.
 */
describe("Blank nodes used as a named graph", function () {
  let dataStore = RdfStore.createDefault();

  beforeAll(async () => {
    const readStream = (
      await rdfDereferencer.dereference(
        "./tests/10 - blank node named graphs/data.trig",
        { localFiles: true },
      )
    ).data;
    await new Promise((resolve, reject) => {
      dataStore.import(readStream).on("end", resolve).on("error", reject);
    });
  });

  const asStrings = (quads: Quad[]) =>
    quads
      .map(
        (q) =>
          `${q.subject.termType === "BlankNode" ? "_:b" : q.subject.value} ${q.predicate.value} ${q.object.termType === "BlankNode" ? "_:b" : q.object.value} ${q.graph.termType === "BlankNode" ? "_:b" : q.graph.value}`,
      )
      .sort();

  it("follows the blank node graph of a member and recurses into it", async () => {
    const extractor = new CBDShapeExtractor();
    const result = await extractor.extract(
      dataStore,
      df.namedNode("https://example.test/m"),
    );

    expect(asStrings(result)).toEqual(
      [
        "https://example.test/m https://example.test/signature _:b ",
        "https://example.test/s https://example.test/value payload _:b",
        "https://example.test/s https://example.test/next _:b _:b",
        "_:b https://example.test/value detail ",
        "_:b https://example.test/back _:b ",
      ].sort(),
    );
  });

  it("does not process the same blank node twice", async () => {
    const extractor = new CBDShapeExtractor();
    const result = await extractor.extract(
      dataStore,
      df.namedNode("https://example.test/m"),
    );
    expect(result.length).toBe(5);
  });

  it("also works when CBD is restricted to the default graph", async () => {
    const extractor = new CBDShapeExtractor(undefined, undefined, {
      cbdDefaultGraph: true,
    });
    const result = await extractor.extract(
      dataStore,
      df.namedNode("https://example.test/m"),
    );

    expect(asStrings(result)).toEqual(
      [
        "https://example.test/m https://example.test/signature _:b ",
        "https://example.test/s https://example.test/value payload _:b",
        "https://example.test/s https://example.test/next _:b _:b",
        "_:b https://example.test/value detail ",
        "_:b https://example.test/back _:b ",
      ].sort(),
    );
  });
});
