import { assert } from "chai";
import { DataFactory } from "rdf-data-factory";
import { RdfStore } from "rdf-stores";
import { ShapeTemplate } from "../../lib/Shape";
import rdfDereference from "rdf-dereference";
import {ShapesGraph} from "../../lib/ShapesGraph";

const df = new DataFactory();

describe("Test whether the SHACL template is well extracted based on paths", function () {
  let shapeStore = RdfStore.createDefault();
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
      shapesGraph.shapes.get(df.namedNode("http://example.org/SequencePathShape")),
    );
  });
});
