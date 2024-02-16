import { assert } from "chai";
import {
  DataFactory,
  NamedNode,
  Parser,
  StreamParser,
  Term,
  Writer,
} from "n3";
import { RdfStore } from "rdf-stores";
import { ShapesGraph, ShapeTemplate } from "../../lib/Shape";
import rdfDereference from "rdf-dereference";

const { namedNode } = DataFactory;
describe("Test shape template of the logical edge cases", function () {
  let shapeStore = RdfStore.createDefault();
  let shapesGraph: ShapesGraph;
  before(async () => {
    let readStream = (
      await rdfDereference.dereference(
        "./tests/04 - logical edge cases/shape.ttl",
        { localFiles: true },
      )
    ).data;
    await new Promise((resolve, reject) => {
      shapeStore.import(readStream).on("end", resolve).on("error", reject);
    });
    shapesGraph = new ShapesGraph(shapeStore);
  });
  it("Check whether a circular Xone shape works", async () => {
    //console.log(shapesGraph.shapes.get('http://example.org/CircularXoneShape').atLeastOneLists.flat(10));//.xone[0][0].xone[0][0]);
    assert(
      shapesGraph.shapes.get(namedNode("http://example.org/TriggersHTTPShape"))!
        .atLeastOneLists[0][0].atLeastOneLists[0].length > 0,
    );
  });
  it("Check whether the XONE condition works 2 levels deep", async () => {
    //console.log(shapesGraph.shapes.get('http://example.org/TriggersHTTPShape').atLeastOneLists[0][0].atLeastOneLists.flat(10));//.xone[0][0].xone[0][0]);
    assert(
      shapesGraph.shapes.get(namedNode("http://example.org/TriggersHTTPShape"))!
        .atLeastOneLists[0][0].atLeastOneLists[0].length > 0,
    );
  });
});
