import { assert } from "chai";
import { DataFactory } from "rdf-data-factory";
import { RdfStore } from "rdf-stores";
import rdfDereference from "rdf-dereference";
import {ShapesGraph} from "../../lib/ShapesGraph";
import fs from "fs/promises";

const df = new DataFactory();

describe("Test whether the correct Mermaid text is generated for a ShapesGraph", function () {
  let shapeStore = RdfStore.createDefault();
  let shapesGraph: ShapesGraph;
  before(async () => {
    let readStream = (
      await rdfDereference.dereference("./tests/07 - mermaid/shape.ttl", {
        localFiles: true,
      })
    ).data;

    await new Promise((resolve, reject) => {
      shapeStore.import(readStream).on("end", resolve).on("error", reject);
    });

    shapesGraph = new ShapesGraph(shapeStore);
  });

  it("Sequence path", async () => {
    const actualMermaid = shapesGraph.toMermaid(df.namedNode("http://example.org/SequencePathShape"));
    const expectedMermaid = await fs.readFile('./tests/07 - mermaid/sequence-path.txt', 'utf-8');
    assert.equal(actualMermaid, expectedMermaid);
  });

  it("Optional sequence path", async () => {
    const actualMermaid = shapesGraph.toMermaid(df.namedNode("http://example.org/OptionalSequencePathShape"));
    const expectedMermaid = await fs.readFile('./tests/07 - mermaid/optional-sequence-path.txt', 'utf-8');
    assert.equal(actualMermaid, expectedMermaid);
  });

  it("Inverse path", async () => {
    const actualMermaid = shapesGraph.toMermaid(df.namedNode("http://example.org/InversePathShape"));
    const expectedMermaid = await fs.readFile('./tests/07 - mermaid/inverse-path.txt', 'utf-8');
    assert.equal(actualMermaid, expectedMermaid);
  });

  it("Optional inverse path", async () => {
    const actualMermaid = shapesGraph.toMermaid(df.namedNode("http://example.org/OptionalInversePathShape"));
    const expectedMermaid = await fs.readFile('./tests/07 - mermaid/optional-inverse-path.txt', 'utf-8');
    assert.equal(actualMermaid, expectedMermaid);
  });

  it("Sequence and inverse path", async () => {
    const actualMermaid = shapesGraph.toMermaid(df.namedNode("http://example.org/SequenceAndInversePathShape"));
    const expectedMermaid = await fs.readFile('./tests/07 - mermaid/sequence-and-inverse-path.txt', 'utf-8');
    assert.equal(actualMermaid, expectedMermaid);
  });

  it("Double inverse path", async () => {
    const actualMermaid = shapesGraph.toMermaid(df.namedNode("http://example.org/DoubleInversePathShape"));
    const expectedMermaid = await fs.readFile('./tests/07 - mermaid/double-inverse-path.txt', 'utf-8');
    assert.equal(actualMermaid, expectedMermaid);
  });

  it("Triple inverse path", async () => {
    const actualMermaid = shapesGraph.toMermaid(df.namedNode("http://example.org/TripleInversePathShape"));
    const expectedMermaid = await fs.readFile('./tests/07 - mermaid/triple-inverse-path.txt', 'utf-8');
    assert.equal(actualMermaid, expectedMermaid);
  });

  it("Quadruple inverse path", async () => {
    const actualMermaid = shapesGraph.toMermaid(df.namedNode("http://example.org/QuadrupleInversePathShape"));
    const expectedMermaid = await fs.readFile('./tests/07 - mermaid/quadruple-inverse-path.txt', 'utf-8');
    assert.equal(actualMermaid, expectedMermaid);
  });

  it("Zero or more path", async () => {
    const actualMermaid = shapesGraph.toMermaid(df.namedNode("http://example.org/ZeroOrMorePathShape"));
    const expectedMermaid = await fs.readFile('./tests/07 - mermaid/zero-or-more-path.txt', 'utf-8');
    assert.equal(actualMermaid, expectedMermaid);
  });

  it("One or more path", async () => {
    const actualMermaid = shapesGraph.toMermaid(df.namedNode("http://example.org/OneOrMorePathShape"));
    const expectedMermaid = await fs.readFile('./tests/07 - mermaid/one-or-more-path.txt', 'utf-8');
    assert.equal(actualMermaid, expectedMermaid);
  });

  it("Zero or one path", async () => {
    const actualMermaid = shapesGraph.toMermaid(df.namedNode("http://example.org/ZeroOrOnePathShape"));
    const expectedMermaid = await fs.readFile('./tests/07 - mermaid/zero-or-one-path.txt', 'utf-8');
    assert.equal(actualMermaid, expectedMermaid);
  });

  it("Alternative path", async () => {
    const actualMermaid = shapesGraph.toMermaid(df.namedNode("http://example.org/AlternativePathShape"));
    const expectedMermaid = await fs.readFile('./tests/07 - mermaid/alternative-path.txt', 'utf-8');
    assert.equal(actualMermaid, expectedMermaid);
  });

  it("All together path", async () => {
    const actualMermaid = shapesGraph.toMermaid(df.namedNode("http://example.org/AllTogetherPathShape"));
    const expectedMermaid = await fs.readFile('./tests/07 - mermaid/all-together-path.txt', 'utf-8');
    assert.equal(actualMermaid, expectedMermaid);
  });

  it("Nested shape", async () => {
    const actualMermaid = shapesGraph.toMermaid(df.namedNode("http://example.org/NestedShape"));
    const expectedMermaid = await fs.readFile('./tests/07 - mermaid/nested-shape.txt', 'utf-8');
    assert.equal(actualMermaid, expectedMermaid);
  });

  it("Nested with optional path shape", async () => {
    const actualMermaid = shapesGraph.toMermaid(df.namedNode("http://example.org/NestedWithOptionalShape"));
    const expectedMermaid = await fs.readFile('./tests/07 - mermaid/nested-with-optional-shape.txt', 'utf-8');
    assert.equal(actualMermaid, expectedMermaid);
  });

  it("Xone with node shape", async () => {
    const actualMermaid = shapesGraph.toMermaid(df.namedNode("http://example.org/XoneWithNodeShape"));
    const expectedMermaid = await fs.readFile('./tests/07 - mermaid/xone-with-node-shape.txt', 'utf-8');
    assert.equal(actualMermaid, expectedMermaid);
  });

  it("Xone with node shape 2", async () => {
    const actualMermaid = shapesGraph.toMermaid(df.namedNode("http://example.org/XoneWithNodeShape2"));
    const expectedMermaid = await fs.readFile('./tests/07 - mermaid/xone-with-node-shape-2.txt', 'utf-8');
    assert.equal(actualMermaid, expectedMermaid);
  });

  it("Throw error when shape not found", async () => {
    let error: Error;
    const term = "http://example.org/abc";

    try {
      shapesGraph.toMermaid(df.namedNode(term));
    } catch (e) {
      error = e as Error;
    }

    // @ts-ignore
    assert.isDefined(error);
    // @ts-ignore
    assert.equal(error.message, `No shape found for term "${term}"`);
  });
});
