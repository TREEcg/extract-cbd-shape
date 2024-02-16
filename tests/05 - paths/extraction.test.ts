import { assert } from "chai";
import { NamedNode, Parser, Store, StreamParser, Term, Writer } from "n3";
import { CBDShapeExtractor } from "../../lib/CBDShapeExtractor";
import rdfDereference from "rdf-dereference";
import { RdfStore } from "rdf-stores";
describe("Check whether paths trigger the right extraction process", function () {
  let shapeStore = RdfStore.createDefault();
  let extractor: CBDShapeExtractor;
  let dataStore = RdfStore.createDefault();
  before(async () => {
    let readStream = (
      await rdfDereference.dereference("./tests/05 - paths/shape.ttl", {
        localFiles: true,
      })
    ).data;
    await new Promise((resolve, reject) => {
      shapeStore.import(readStream).on("end", resolve).on("error", reject);
    });
    extractor = new CBDShapeExtractor(shapeStore);
    let readStream2 = (
      await rdfDereference.dereference("./tests/05 - paths/data.ttl", {
        localFiles: true,
      })
    ).data;
    await new Promise((resolve, reject) => {
      dataStore.import(readStream2).on("end", resolve).on("error", reject);
    });
  });
  it("Test sequence path", async () => {
    let result = await extractor.extract(
      dataStore,
      new NamedNode("http://example.org/B"),
      new NamedNode("http://example.org/SequencePathShape"),
    );
    /*let writer = new Writer();
        writer.addQuads(result);
        writer.end((err, res) => {console.log(res);});*/
    assert.equal(result.length, 3);
  });
  it("Test an inverse path", async () => {
    let result = await extractor.extract(
      dataStore,
      new NamedNode("http://example.org/C"),
      new NamedNode("http://example.org/InversePathShape"),
    );
    /*let writer = new Writer();
        writer.addQuads(result);
        writer.end((err, res) => {console.log(res);});*/
    assert.equal(result.length, 1);
  });
  it("Test a double inverse path", async () => {
    let result = await extractor.extract(
      dataStore,
      new NamedNode("http://example.org/B"),
      new NamedNode("http://example.org/DoubleInversePathShape"),
    );
    /*let writer = new Writer();
        writer.addQuads(result);
        writer.end((err, res) => {console.log(res);});*/
    assert.equal(result.length, 1);
  });
  it("Test an inverse with a sequence path combo", async () => {
    let result = await extractor.extract(
      dataStore,
      new NamedNode("http://example.org/C"),
      new NamedNode("http://example.org/SequenceAndInversePathShape"),
    );
    /*let writer = new Writer();
        writer.addQuads(result);
        writer.end((err, res) => {console.error(res);});*/
    assert.equal(result.length, 2);
  });
  it("Test a zeroOrMore path", async () => {
    let result = await extractor.extract(
      dataStore,
      new NamedNode("http://example.org/A"),
      new NamedNode("http://example.org/ZeroOrMorePathShape"),
    );
    //let writer = new Writer();
    //writer.addQuads(result);
    //writer.end((err, res) => {console.error(res);});
    assert.equal(result.length, 2);
  });
  it("Test a oneOrMore path", async () => {
    let result = await extractor.extract(
      dataStore,
      new NamedNode("http://example.org/A"),
      new NamedNode("http://example.org/OneOrMorePathShape"),
    );
    //let writer = new Writer();
    //writer.addQuads(result);
    //writer.end((err, res) => {console.error(res);});
    assert.equal(result.length, 2);
  });
  it("Test a alternative path", async () => {
    let result = await extractor.extract(
      dataStore,
      new NamedNode("http://example.org/B"),
      new NamedNode("http://example.org/AlternativePathShape"),
    );
    /*let writer = new Writer();
        writer.addQuads(result);
        writer.end((err, res) => {console.error(res);});*/
    assert.equal(result.length, 2);
  });

  it("Test inverse and alternate together", async () => {
    let result = await extractor.extract(
      dataStore,
      new NamedNode("http://example.org/B"),
      new NamedNode("http://example.org/AllTogetherPathShape"),
    );
    /*let writer = new Writer();
        writer.addQuads(result);
        writer.end((err, res) => {console.error(res);});*/
    assert.equal(result.length, 2);
  });
});
