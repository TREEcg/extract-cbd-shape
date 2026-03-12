import { describe, it, beforeAll, expect } from "vitest";
import { DataFactory } from "rdf-data-factory";
import { RdfStore } from "rdf-stores";
import { rdfDereferencer } from "rdf-dereference";
import { ShapesGraph } from "../../lib/ShapesGraph";

const df = new DataFactory();

describe("Test whether the SHACL template is well extracted based on paths", function () {
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
