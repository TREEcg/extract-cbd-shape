import { describe, it, beforeAll, expect } from "vitest";
import { DataFactory } from "rdf-data-factory";
import { RdfStore } from "rdf-stores";
import { rdfDereferencer } from "rdf-dereference";
import { ShapesGraph } from "../../lib/ShapesGraph";

const df = new DataFactory();

describe("Test shape template of the logical edge cases", function () {
  let shapeStore = RdfStore.createDefault();
  let shapesGraph: ShapesGraph;
  beforeAll(async () => {
    let readStream = (
      await rdfDereferencer.dereference(
        "./tests/04 - logical edge cases/shape.ttl",
        { localFiles: true },
      )
    ).data;
    await new Promise((resolve, reject) => {
      shapeStore.import(readStream).on("end", resolve).on("error", reject);
    });
    shapesGraph = await ShapesGraph.fromStore(shapeStore);
  });
  it("Check whether a circular Xone shape works", async () => {
    const shape = shapesGraph.shapes.get(df.namedNode("http://example.org/CircularXoneShape"))!;
    expect(shape.atLeastOneLists.length).toBe(1);
    expect(shape.atLeastOneLists[0].length).toBe(2);
    // The first xone element has a nodeLink
    expect(shape.atLeastOneLists[0][0].nodeLinks.length).toBe(1);
    expect(shape.atLeastOneLists[0][0].nodeLinks[0].link.value).toBe("http://example.org/CircularXoneShape");
  });
  it("Check whether the XONE condition works 2 levels deep", async () => {
    expect(shapesGraph.shapes.get(df.namedNode("http://example.org/TriggersHTTPShape"))!
      .atLeastOneLists[0][0].atLeastOneLists[0].length > 0,).toBeTruthy();
  });
});
