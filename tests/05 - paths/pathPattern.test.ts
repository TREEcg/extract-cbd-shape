import { assert } from "chai";
import { DataFactory, NamedNode, Store } from "n3";
import {rdfDereferencer} from "rdf-dereference";
import { CbdExtracted } from "../../lib/CBDShapeExtractor";
const { namedNode } = DataFactory;
import { RdfStore } from "rdf-stores";
import {ShapesGraph} from "../../lib/ShapesGraph";
describe("Test whether the Patterns are correctly created", function () {
  let shapeStore = RdfStore.createDefault();
  let shapesGraph: ShapesGraph;
  before(async () => {
    let readStream = (
      await rdfDereferencer.dereference("./tests/05 - paths/shape.ttl", {
        localFiles: true,
      })
    ).data;
    await new Promise((resolve, reject) => {
      shapeStore.import(readStream).on("end", resolve).on("error", reject);
    });
    shapesGraph = new ShapesGraph(shapeStore);
  });
  it("Check whether sequence paths are correctly represented", async () => {
    assert(
      shapesGraph.shapes.get(namedNode("http://example.org/SequencePathShape")),
    );
  });
});

describe("Test whether the Patterns are correctly matched", function () {
  let shapeStore = RdfStore.createDefault();
  let store = RdfStore.createDefault();

  let shapesGraph: ShapesGraph;
  before(async () => {
    let readStream = (
      await rdfDereferencer.dereference("./tests/05 - paths/shape.ttl", {
        localFiles: true,
      })
    ).data;
    await new Promise((resolve, reject) => {
      shapeStore.import(readStream).on("end", resolve).on("error", reject);
    });
    shapesGraph = new ShapesGraph(shapeStore);

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
    let match1 =
      shapesGraph.shapes
        .get(namedNode("http://example.org/SequencePathShape"))!
        .requiredPaths[0].match(
          store,
          new CbdExtracted(),
          new NamedNode("http://example.org/A"),
          [],
        ).length > 0;
    //assert(shapesGraph.shapes.get('http://example.org/SequencePathShape').requiredPaths[0].match(store, new NamedNode("http://example.org/A")));
  });

  it("Check whether a double inverse is correctly matched", async () => {
    let match1 =
      shapesGraph.shapes
        .get(namedNode("http://example.org/DoubleInversePathShape"))!
        .requiredPaths[0].match(
          store,
          new CbdExtracted(),
          new NamedNode("http://example.org/A"),
          [],
        ).length > 0;
    //assert(shapesGraph.shapes.get('http://example.org/SequencePathShape').requiredPaths[0].match(store, new NamedNode("http://example.org/A")));
  });
});
