import { assert } from "chai";
import { NamedNode, Parser, Store, StreamParser, Term, Writer } from "n3";
import { CBDShapeExtractor } from "../../lib/CBDShapeExtractor";
import rdfDereference from "rdf-dereference";

describe("Check weather all selected quads can be extracted", function () {
  let shapeStore = new Store();
  let extractor: CBDShapeExtractor;
  let dataStore = new Store();
  before(async () => {
    let readStream = (
      await rdfDereference.dereference("./tests/06 - shapes and named graphs/shape-example.ttl", {
        localFiles: true,
      })
    ).data;
    await new Promise((resolve, reject) => {
      shapeStore.import(readStream).on("end", resolve).on("error", reject);
    });
    extractor = new CBDShapeExtractor(shapeStore);
    let readStream2 = (
      await rdfDereference.dereference("./tests/06 - shapes and named graphs/data-example.ttl", {
        localFiles: true,
      })
    ).data;
    await new Promise((resolve, reject) => {
      dataStore.import(readStream2).on("end", resolve).on("error", reject);
    });
  });
  it("All quads from example should be extracted", async () => {
    let result = await extractor.extract(
      dataStore,
      new NamedNode("http://example.org/important_point"),
      new NamedNode("http://example.org/Shape")
    );
    // It should only have 6 quads
    assert.equal(result.length, 3);
  });
  
});
