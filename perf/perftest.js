const Benchmark = require("benchmark");
const CBDShapeExtractor = require('../dist/lib/CBDShapeExtractor').CBDShapeExtractor;
const Store = require('n3').Store;
const rdfDereference = require('rdf-dereference').default;
const NamedNode = require('n3').NamedNode;

let main = async function () {
  var suite = new Benchmark.Suite;
  let shaclCatalog = new Store();
  let readStream = (
    await rdfDereference.dereference(
      "./tests/01 - fetching a shacl shape/shacl-catalog.ttl",
      { localFiles: true },
    )
  ).data;
  await new Promise((resolve, reject) => {
    shaclCatalog.import(readStream).on("end", resolve).on("error", reject);
  });

  let shaclShacl = new Store();
  let readStream2 = (
    await rdfDereference.dereference(
      "./tests/01 - fetching a shacl shape/shacl-shacl.ttl",
      { localFiles: true },
    )
  ).data;
  await new Promise((resolve, reject) => {
    shaclCatalog.import(readStream2).on("end", resolve).on("error", reject);
  });

  let extractor = new CBDShapeExtractor();
  let extractorWithShape = new CBDShapeExtractor(shaclShacl);

  
  // add tests
  suite.add('Extract1#CBD', async function() {
    let result = await extractor.extract(
      shaclCatalog,
      new NamedNode("http://example.org/PersonShape"),
    );
    //console.error("Extract#CBD returned " + result.length + " quads.");

  }).add('Extract1#CBDAndShape', async function() {
    let result = await extractorWithShape.extract(
      shaclCatalog,
      new NamedNode("http://example.org/PersonShape"),
      new NamedNode("http://www.w3.org/ns/shacl-shacl#ShapeShape")
    );
    //console.error("Extract#CBDAndShape returned " + result.length + " quads.");
  })
  // add listeners
  .on('cycle', function(event) {
    console.log(String(event.target));
  })
  .on('complete', function() {
    console.log('Fastest is ' + String(this.filter('fastest').map('name')));
  })
  // run async
  .run({ 'async': true });

}
main ();