import { assert } from "chai";
import { NamedNode, Parser, StreamParser, Term, Writer } from "n3";
import { RdfStore } from "rdf-stores";
import { CBDShapeExtractor } from "../../lib/CBDShapeExtractor";
import rdfDereference from "rdf-dereference";

describe("Extracting logical edge cases", function () {
  this.timeout(25000);

  let shapeStore = RdfStore.createDefault();
  let extractor: CBDShapeExtractor;
  let dataStore = RdfStore.createDefault();
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
    extractor = new CBDShapeExtractor(shapeStore);
    let readStream2 = (
      await rdfDereference.dereference(
        "./tests/04 - logical edge cases/data.ttl",
        { localFiles: true },
      )
    ).data;
    await new Promise((resolve, reject) => {
      dataStore.import(readStream2).on("end", resolve).on("error", reject);
    });
  });
  it("Check whether the OR condition works - and check with recursion", async () => {
    let result = await extractor.extract(
      dataStore,
      new NamedNode("http://example.org/Person1"),
      new NamedNode("http://example.org/Shape"),
    );
    //let writer = new Writer();
    //writer.addQuads(result);
    //writer.end((err, res) => {console.log(res);});
    assert.equal(result.length, 7);
  });
  it("Check whether the OR condition works a second time as well", async () => {
    let result = await extractor.extract(
      dataStore,
      new NamedNode("http://example.org/Person2"),
      new NamedNode("http://example.org/PersonShape"),
    );
    //let writer = new Writer();
    //writer.addQuads(result);
    //writer.end((err, res) => {console.log(res);});
    assert.equal(result.length, 7);
  });
  it("Check whether it does an HTTP request if it doesn’t find the required properties on a node", async () => {
    let result = await extractor.extract(
      dataStore,
      new NamedNode("http://example.org/Person3"),
      new NamedNode("http://example.org/KnowsPieterShape"),
    );
    //let writer = new Writer();
    //writer.addQuads(result);
    //writer.end((err, res) => {console.log(res);});
    assert.equal(result.length, 4);
  });
  it("Check whether it finds the nodelink in a xone", async () => {
    let result = await extractor.extract(
      dataStore,
      new NamedNode("http://example.org/Person4"),
      new NamedNode("http://example.org/XoneWithNodeShape"),
    );
    //let writer = new Writer();
    //writer.addQuads(result);
    //writer.end((err, res) => {console.log(res);});
    assert.equal(result.length, 3);
  });
  it("Check whether a node link in a xone in a xone triggers an HTTP request", async () => {
    let result = await extractor.extract(
      dataStore,
      new NamedNode("http://example.org/Person5"),
      new NamedNode("http://example.org/TriggersHTTPShape"),
    );
    //let writer = new Writer();
    //writer.addQuads(result);
    //writer.end((err, res) => {console.log(res);});
    assert.equal(result.length, 3);
  });
  it("Check whether a circular XONE shape works", async () => {
    let result = await extractor.extract(
      dataStore,
      new NamedNode("http://example.org/Person6"),
      new NamedNode("http://example.org/CircularXoneShape"),
    );
    //let writer = new Writer();
    //writer.addQuads(result);
    //writer.end((err, res) => {console.log(res);});
    assert.equal(result.length, 7);
  });
});

describe("Check whether paths are correctly chained", async () => {
  const shape = `
@prefix sh:  <http://www.w3.org/ns/shacl#> .
@prefix ex:  <http://example.org/> .

ex:innerShape 
	a sh:NodeShape ;
	sh:property [
		sh:path (ex:first ex:second);
	] .

ex:outerShape 
	a sh:NodeShape ;
	sh:property [
		sh:path ex:inner;
    sh:node ex:innerShape;
	] .
`;

  const data = `
@prefix ex:  <http://example.org/> .

ex:false ex:second "Don't find me".

ex:true ex:first ex:trueInner.
ex:trueInner ex:second "Find me".

ex:subject ex:first ex:false;
  ex:inner ex:true.
`;

  let shapeStore = RdfStore.createDefault();
  let extractor: CBDShapeExtractor;
  let dataStore = RdfStore.createDefault();

  const shapeQuads = new Parser().parse(shape);
  const dataQuads = new Parser().parse(data);

  shapeQuads.forEach((quad) => shapeStore.addQuad(quad));
  dataQuads.forEach((quad) => dataStore.addQuad(quad));
  extractor = new CBDShapeExtractor(shapeStore);

  const entity = await extractor.extract(
    dataStore,
    new NamedNode("http://example.org/subject"),
    new NamedNode("http://example.org/outerShape"),
  );
  it("Follows complex path inside inner node", async () => {
    const findMe = entity.find((q) => q.object.value === "Find me");
    assert.isTrue(!!findMe, "Find me is found");
  });

  it("Doesn't follow path if it is not part of the shape", async () => {
    const findMe = entity.find((q) => q.object.value === "Don't find me");
    assert.isTrue(!findMe, "Don't find me is not found");
  });
});
