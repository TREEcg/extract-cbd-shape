import { describe, it, beforeAll, expect } from "vitest";
import { DataFactory } from "rdf-data-factory";
import { rdfDereferencer } from "rdf-dereference";
import { CbdExtracted } from "../../lib/CBDShapeExtractor";
import { RdfStore } from "rdf-stores";
import { ShapesGraph } from "../../lib/ShapesGraph";

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
          [],
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
          [],
        );
    expect(match1.length > 0).toBeTruthy();
  });
});
