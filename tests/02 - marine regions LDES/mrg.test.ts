import { assert } from "chai";
import { Writer } from "n3";
import { DataFactory } from "rdf-data-factory";
import { RdfStore } from "rdf-stores";
import { CBDShapeExtractor } from "../../lib/extract-cbd-shape";
import rdfDereference from "rdf-dereference";
import { TREE } from "@treecg/types";
const df = new DataFactory();
describe("Check whether a member from the MRG source can be fully extracted", function () {
  this.timeout(25000);
  it("Extract a shape from MRG and check whether it successfully did a call to a geometry it needs", async () => {
    let shapeStore =RdfStore.createDefault();
    let readStream = (
      await rdfDereference.dereference(
        "./tests/02 - marine regions LDES/shacl.ttl",
        { localFiles: true },
      )
    ).data;
    await new Promise((resolve, reject) => {
      shapeStore.import(readStream).on("end", resolve).on("error", reject);
    });
    let extractor = new CBDShapeExtractor(shapeStore);
    let dataStore =RdfStore.createDefault();
    let readStream2 = (
      await rdfDereference.dereference(
        "./tests/02 - marine regions LDES/data.ttl",
        { localFiles: true },
      )
    ).data;
    await new Promise((resolve, reject) => {
      dataStore.import(readStream2).on("end", resolve).on("error", reject);
    });
    let result = await extractor.extract(
      dataStore,
      df.namedNode("http://marineregions.org/mrgid/24983?t=1690208097"),
      df.namedNode("http://example.org/shape"),
    );

    assert.equal(
      result.filter((quad) => {
        return (
          quad.subject.value ===
          "http://marineregions.org/mrgid/24983/geometries?source=110&attributeValue=2004"
        );
      }).length,
      2,
    ); // Test whether it actually did a call
  });

  it("Extract a shape from MRG, based on the blank node and check whether it successfully did a call to a geometry it needs", async () => {
    let dataStore = RdfStore.createDefault();
    let readStream2 = (
      await rdfDereference.dereference(
        "./tests/02 - marine regions LDES/data.ttl",
        { localFiles: true },
      )
    ).data;
    await new Promise((resolve, reject) => {
      dataStore.import(readStream2).on("end", resolve).on("error", reject);
    });
    let extractor = new CBDShapeExtractor(dataStore);

    const shapeId = dataStore.getQuads(null, TREE.terms.shape, null)[0].object;

    const id = df.namedNode(
      "http://marineregions.org/mrgid/24983?t=1690208097",
    );
    let result = await extractor.extract(dataStore, id, shapeId);

    const predicates = result
      .filter((q) => q.subject.equals(id))
      .map((q) => q.predicate);

    assert.equal(
      predicates.length,
      13
    )
  });
});
