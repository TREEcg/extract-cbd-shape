import { assert } from "chai";
import { NamedNode, Parser, StreamParser, Term, Writer } from "n3";
import { RdfStore } from "rdf-stores";
import { CBDShapeExtractor } from "../../lib/CBDShapeExtractor";
import rdfDereference from "rdf-dereference";

describe("Check whether we can successfully extract a SHACL shape", async () => {
  let shapeStore = RdfStore.createDefault();
  let extractor: CBDShapeExtractor;
  let dataStore = RdfStore.createDefault();
  before(async () => {
    let readStream = (
      await rdfDereference.dereference(
        "./tests/01 - fetching a shacl shape/shacl-shacl.ttl",
        { localFiles: true },
      )
    ).data;
    await new Promise((resolve, reject) => {
      shapeStore.import(readStream).on("end", resolve).on("error", reject);
    });
    extractor = new CBDShapeExtractor(shapeStore);
    let readStream2 = (
      await rdfDereference.dereference(
        "./tests/01 - fetching a shacl shape/shacl-catalog.ttl",
        { localFiles: true },
      )
    ).data;
    await new Promise((resolve, reject) => {
      dataStore.import(readStream2).on("end", resolve).on("error", reject);
    });
  });

  it("Extracts a SHACL shape from a shape catalog", async () => {
    let result = await extractor.extract(
      dataStore,
      new NamedNode("http://example.org/PersonShape"),
      new NamedNode("http://www.w3.org/ns/shacl-shacl#NodeShapeShape"),
    );
    assert.equal(result.length, 11); // Just testing whether there are 11 quads being returned
  });

  it("Can extract another iteration with the same instance", async () => {
    let result = await extractor.extract(
      dataStore,
      new NamedNode("http://example.org/PersonShape"),
      new NamedNode("http://www.w3.org/ns/shacl-shacl#NodeShapeShape"),
    );
    //let writer = new Writer();
    //writer.addQuads(result);
    //writer.end((err, res) => {console.log(res);});
    assert.equal(result.length, 11); // Just testing whether there are 11 quads being returned
  });
  it("Can extract a deeper nested organization based on an optional sh:node link", async () => {
    //console.log(extractor.shapesGraph.shapes.get("http://www.w3.org/ns/shacl-shacl#NodeShape"));
    let result = await extractor.extract(
      dataStore,
      new NamedNode("http://example.org/OrganizationShape"),
      new NamedNode("http://www.w3.org/ns/shacl-shacl#NodeShapeShape"),
    );
    //let writer = new Writer();
    //writer.addQuads(result);
    //writer.end((err, res) => {console.log(res);});
    assert.equal(result.length, 16); // Just testing whether there are 16 quads being returned now
  });

  it("Can extract itself from itself", async () => {
    let result = await extractor.extract(
      shapeStore,
      new NamedNode("http://www.w3.org/ns/shacl-shacl#ShapeShape"),
      new NamedNode("http://www.w3.org/ns/shacl-shacl#ShapeShape"),
    );
    /*let writer = new Writer();
        writer.addQuads(result);
        writer.end((err, res) => {console.log(res);});*/

    //TODO: Didn’t yet calculate how many actually should be returned here... Just assumed this number is correct...
    assert.equal(result.length, 273); // Just testing whether there are quads being returned now
  });
});
