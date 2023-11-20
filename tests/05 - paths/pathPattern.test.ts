import { assert } from "chai";
import { DataFactory, NamedNode, Store } from "n3";
import { ShapesGraph } from "../../lib/Shape";
import rdfDereference from "rdf-dereference";
const { namedNode } = DataFactory;

describe("Test whether the Patterns are correctly created", function () {
  let shapeStore = new Store();
  let shapesGraph: ShapesGraph;
  before(async () => {
    let readStream = (
      await rdfDereference.dereference("./tests/05 - paths/shape.ttl", {
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
  let shapeStore = new Store();
  let store = new Store();

  let shapesGraph: ShapesGraph;
  before(async () => {
    let readStream = (
      await rdfDereference.dereference("./tests/05 - paths/shape.ttl", {
        localFiles: true,
      })
    ).data;
    await new Promise((resolve, reject) => {
      shapeStore.import(readStream).on("end", resolve).on("error", reject);
    });
    shapesGraph = new ShapesGraph(shapeStore);

    let readStream2 = (
      await rdfDereference.dereference("./tests/05 - paths/data.ttl", {
        localFiles: true,
      })
    ).data;
    await new Promise((resolve, reject) => {
      store.import(readStream2).on("end", resolve).on("error", reject);
    });
  });

  it("Check whether sequence paths are correctly matched", async () => {
    let match1 = shapesGraph.shapes
      .get(namedNode("http://example.org/SequencePathShape"))!
      .requiredPaths[0].match(store, new NamedNode("http://example.org/A"), [])
      .next().value;
    //assert(shapesGraph.shapes.get('http://example.org/SequencePathShape').requiredPaths[0].match(store, new NamedNode("http://example.org/A")));
  });

  it("Check whether a double inverse is correctly matched", async () => {
    let match1 = shapesGraph.shapes
      .get(namedNode("http://example.org/DoubleInversePathShape"))!
      .requiredPaths[0].match(store, new NamedNode("http://example.org/A"), [])
      .next().value;
    //assert(shapesGraph.shapes.get('http://example.org/SequencePathShape').requiredPaths[0].match(store, new NamedNode("http://example.org/A")));
  });
});
