import { assert } from "chai";
import { DataFactory, Store } from "n3";
import { ShapesGraph, ShapeTemplate } from "../../lib/Shape";
import rdfDereference from "rdf-dereference";
const { namedNode } = DataFactory;

describe("Test whether the SHACL template is well extracted based on paths", function () {
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
