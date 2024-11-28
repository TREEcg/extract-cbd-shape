import {rdfDereferencer} from "rdf-dereference";
import { RdfStore } from "rdf-stores";
import {ShapesGraph} from "../../lib/ShapesGraph";
describe("Test shape template of the SHACL SHACL", function () {
  let shapeStore = RdfStore.createDefault();
  let shapesGraph: ShapesGraph;
  before(async () => {
    let readStream = (
      await rdfDereferencer.dereference(
        "./tests/01 - fetching a shacl shape/shacl-shacl.ttl",
        { localFiles: true },
      )
    ).data;
    await new Promise((resolve, reject) => {
      shapeStore.import(readStream).on("end", resolve).on("error", reject);
    });
    shapesGraph = new ShapesGraph(shapeStore);
  });
  it("Check whether the OR condition works - and check with recursion", async () => {
    //TODO
    //console.log(shapesGraph.shapes.get('http://www.w3.org/ns/shacl-shacl#ShapeShape').xone);
    //assert(shapesGraph.shapes.get('http://example.org/TriggersHTTPShape').xone[0][0].xone[0][0].nodeLinks.size > 0);
  });
});
