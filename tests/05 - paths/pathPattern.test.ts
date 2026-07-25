import { describe, it, beforeAll, expect } from "vitest";
import { DataFactory } from "rdf-data-factory";
import { rdfDereferencer } from "rdf-dereference";
import { CbdExtracted } from "../../lib/CBDShapeExtractor";
import { RdfStore } from "rdf-stores";
import { ShapesGraph } from "../../lib/ShapesGraph";
import { OneOrMorePath, PredicatePath, ZeroOrOnePath } from "../../lib/Path";

const df = new DataFactory();

describe("Test whether the Patterns are correctly created", function () {
  let shapeStore = RdfStore.createDefault();
  let shapesGraph: ShapesGraph;
  beforeAll(async () => {
    let readStream = (
      await rdfDereferencer.dereference("./tests/05 - paths/shape.ttl", {
        localFiles: true,
      })
    ).data;
    await new Promise((resolve, reject) => {
      shapeStore.import(readStream).on("end", resolve).on("error", reject);
    });
    shapesGraph = await ShapesGraph.fromStore(shapeStore);
  });
  it("Check whether sequence paths are correctly represented", async () => {
    expect(shapesGraph.shapes.get(df.namedNode("http://example.org/SequencePathShape")),).toBeTruthy();
  });
});

describe("Test whether the Patterns are correctly matched", function () {
  let shapeStore = RdfStore.createDefault();
  let store = RdfStore.createDefault();

  let shapesGraph: ShapesGraph;
  beforeAll(async () => {
    let readStream = (
      await rdfDereferencer.dereference("./tests/05 - paths/shape.ttl", {
        localFiles: true,
      })
    ).data;
    await new Promise((resolve, reject) => {
      shapeStore.import(readStream).on("end", resolve).on("error", reject);
    });
    shapesGraph = await ShapesGraph.fromStore(shapeStore);

    let readStream2 = (
      await rdfDereferencer.dereference("./tests/05 - paths/data.ttl", {
        localFiles: true,
      })
    ).data;
    await new Promise((resolve, reject) => {
      store.import(readStream2).on("end", resolve).on("error", reject);
    });
  });

  it("Check whether sequence paths are correctly matched", async () => {
    const match1 =
      await shapesGraph.shapes
        .get(df.namedNode("http://example.org/SequencePathShape"))!
        .requiredPaths[0].match(
          store,
          new CbdExtracted(),
          df.namedNode("http://example.org/A"),
          new Set(),
        );
    expect(match1.length > 0).toBeTruthy();
  });

  it("Check whether a double inverse is correctly matched", async () => {
    const match1 =
      await shapesGraph.shapes
        .get(df.namedNode("http://example.org/DoubleInversePathShape"))!
        .requiredPaths[0].match(
          store,
          new CbdExtracted(),
          df.namedNode("http://example.org/A"),
          new Set(),
        );
    expect(match1.length > 0).toBeTruthy();
  });

  it("does not expand beyond a zero-or-one path", async () => {
    const predicate = df.namedNode("http://example.org/next");
    const a = df.namedNode("http://example.org/zero-or-one-a");
    const b = df.namedNode("http://example.org/zero-or-one-b");
    const c = df.namedNode("http://example.org/zero-or-one-c");
    const pathStore = RdfStore.createDefault();
    pathStore.addQuad(df.quad(a, predicate, b));
    pathStore.addQuad(df.quad(b, predicate, c));

    const matches = await new ZeroOrOnePath(
      new PredicatePath(predicate),
    ).match(pathStore, new CbdExtracted(), a, new Set());

    expect(matches.map((match) => match.target.value)).toEqual([
      a.value,
      b.value,
    ]);
  });

  it("terminates repeated paths on cyclic data", async () => {
    const predicate = df.namedNode("http://example.org/next");
    const a = df.namedNode("http://example.org/cycle-a");
    const b = df.namedNode("http://example.org/cycle-b");
    const pathStore = RdfStore.createDefault();
    pathStore.addQuad(df.quad(a, predicate, b));
    pathStore.addQuad(df.quad(b, predicate, a));

    const matches = await new OneOrMorePath(
      new PredicatePath(predicate),
    ).match(pathStore, new CbdExtracted(), a, new Set());

    expect(matches.map((match) => match.target.value)).toEqual([
      b.value,
      a.value,
    ]);
  });
});
