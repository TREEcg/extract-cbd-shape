import { assert } from "chai";
import { NamedNode, Parser, StreamParser, Term, Writer } from "n3";
import { CBDShapeExtractor } from "../../lib/CBDShapeExtractor";
import {rdfDereferencer} from "rdf-dereference";
import { RdfStore } from "rdf-stores";

describe("Check whether paths trigger the right extraction process", function () {
  let shapeStore = RdfStore.createDefault();
  let extractor: CBDShapeExtractor;
  let dataStore = RdfStore.createDefault();
  before(async () => {
    let readStream = (
      await rdfDereferencer.dereference("./tests/06 - shapes and named graphs/shape.ttl", {
        localFiles: true,
      })
    ).data;
    await new Promise((resolve, reject) => {
      shapeStore.import(readStream).on("end", resolve).on("error", reject);
    });
    extractor = new CBDShapeExtractor(shapeStore);
    let readStream2 = (
      await rdfDereferencer.dereference("./tests/06 - shapes and named graphs/data.ttl", {
        localFiles: true,
      })
    ).data;
    await new Promise((resolve, reject) => {
      dataStore.import(readStream2).on("end", resolve).on("error", reject);
    });
  });
  it("Named Graphs should not conflict with the shape extraction", async () => {
    let result = await extractor.extract(
      dataStore,
      new NamedNode("http://example.org/M1v1"),
      new NamedNode("http://example.org/Shape"),
      [new NamedNode("http://example.org/M1v2")] //Other members in the current context
    );
    // It should only have 2 quads: one outside of the named graph, and one in the named graph that is not part of the other named graphs
    assert.equal(result.length, 2);
  });

});
