import { assert } from "chai";
import { CBDShapeExtractor } from "../../lib/CBDShapeExtractor";
import {rdfDereferencer} from "rdf-dereference";
import { Quad, Term as RTerm } from "@rdfjs/types";
import { RdfStore } from "rdf-stores";
import { DataFactory } from "rdf-data-factory";
const df = new DataFactory();
describe("Check weather all selected quads can be extracted", function () {
  let shapeStore = RdfStore.createDefault();
  let extractor: CBDShapeExtractor;
  let dataStore = RdfStore.createDefault();
  before(async () => {
    let readStream = (
      await rdfDereferencer.dereference(
        "./tests/06 - shapes and named graphs/shape-example.ttl",
        {
          localFiles: true,
        },
      )
    ).data;
    await new Promise((resolve, reject) => {
      shapeStore.import(readStream).on("end", resolve).on("error", reject);
    });
    extractor = new CBDShapeExtractor(shapeStore);
    let readStream2 = (
      await rdfDereferencer.dereference(
        "./tests/06 - shapes and named graphs/data-example.ttl",
        {
          localFiles: true,
        },
      )
    ).data;
    await new Promise((resolve, reject) => {
      dataStore.import(readStream2).on("end", resolve).on("error", reject);
    });
  });
  it("All quads from example should be extracted", async () => {
    let result = await extractor.extract(
      dataStore,
      df.namedNode("http://example.org/line"),
      df.namedNode("http://example.org/shape"),
    );
    // It should only have 6 quads
    assert.equal(result.length, 6);
  });

  it("bulk - All quads from example should be extracted", async () => {
    let called = 0;
    const cb = (member: { subject: RTerm; quads: Quad[] }) => {
      called += 1;
      if (member.subject.value == "http://example.org/line") {
        assert.equal(member.quads.length, 6);
        return;
      }

      if (member.subject.value == "http://example.org/important_point") {
        assert.equal(member.quads.length, 2);
        return;
      }
      assert.fail();
    };

    let result = await extractor.bulkExtract(
      dataStore,
      [
        df.namedNode("http://example.org/line"),
        df.namedNode("http://example.org/important_point"),
      ],
      df.namedNode("http://example.org/shape"),
      undefined,
      cb,
    );
    // It should only have 6 quads
    assert.equal(result.length, 2);
    assert.equal(called, 2);
  });
});
