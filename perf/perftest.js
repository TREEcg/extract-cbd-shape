const Benchmark = require("benchmark");
const CBDShapeExtractor = require('../dist/lib/CBDShapeExtractor').CBDShapeExtractor;
const Store = require('n3').Store;
const rdfDereference = require('rdf-dereference').default;
const NamedNode = require('n3').NamedNode;
const ora = require("ora");

let main = async function () {
  var suite = new Benchmark.Suite;
  let kboData = new Store();
  let shaclKBO = new Store();


  //Load the quads from the file
  let kboDataStream = (
    await rdfDereference.dereference(
          "./perf/resources/kbo.ttl",
      { localFiles: true },
    )
  ).data;

  await new Promise((resolve, reject) => {
    kboData.import(kboDataStream).on("end", resolve).on("error", reject);
  });
  // console.error(kboData.getQuads(null, null, null, null));

  //load the shacl shape

  let kboShaclStream = (
    await rdfDereference.dereference(
      "./tests/01 - fetching a shacl shape/shacl-shacl.ttl",
      { localFiles: true },
    )
  ).data;
  await new Promise((resolve, reject) => {
    kboData.import(kboShaclStream).on("end", resolve).on("error", reject);
  });

  // 
  let extractor = new CBDShapeExtractor();
  let extractorWithShape = new CBDShapeExtractor(shaclKBO);


  // Set same options for all tests
  suite.options.minSamples = 100;
  suite.options.maxTime = 2;


/*  Test framework, 2 types of tests:
    Test Sample 13 quads
    1. in-band only
   * Only star-shapes (CBD) + blank nodes to be extracted
   * CBD + named graphs
   * CBD + Simple Shape not adding any triples other than what CBD gives
   * CBD + named graphs + Simple shape that does not add any triples other than already present
   * Shape selecting specific property paths, but not too complex
   * Complex shape with conditionals
   2. out of band tests
   * Test extracting 10 members from a Collection with 10 different nodes
   * Test extracting 10 members from 1 page, but each member is out of band
   * Test extracting 10 members from 1 page, out of band, but each member has already a couple of triples in-band*/


  //Extraction only star-shapes (CBD) + blank nodes to be extracted
  suite
      .add('Extract1#CBDAndBlankNode', async function () {
        let result = await extractor.extract(
            kboData,
            new NamedNode("https://kbopub.economie.fgov.be/kbo#0877248501.2022.11"),
        );
        // console.error("Extract#CBD returned " + result.length + " quads.");
      })


      //Extraction CBD + named graphs
      .add('Extract2#CBDAndNamedGraphs', async function () {
         let result = await extractor.extract(
             kboData,
             new NamedNode("https://kbopub.economie.fgov.be/kbo#0417199869.2022.11"),
         );
         // console.error("Extract#CBDAndShape returned " + result.length + " quads.");
       })


      //Extraction CBD + Simple Shape not adding any triples other than what CBD gives
      .add('Extract3#CBDAndSimpleShape', async function () {
        let result = await extractorWithShape.extract(
            kboData,
            new NamedNode("https://kbopub.economie.fgov.be/kbo#0877248501.2022.11"),
            new NamedNode("https://kbopub.economie.fgov.be/kbo#LegalEntityShape")
        );
        // console.error("Extract#CBDAndShape returned " + result.length + " quads.");
      })


      // CBD + named graphs + Simple shape that does not add any triples other than already present
      .add('Extract4#CBDAndSimpleShapeAndNamedGraphs', async function () {
        let result = await extractorWithShape.extract(
            kboData,
            new NamedNode("https://kbopub.economie.fgov.be/kbo#0417199869.2022.11"),
            new NamedNode("http://www.w3.org/ns/shacl-shacl#ShapeShape")
        );
        // console.error("Extract#CBDAndShape returned " + result.length + " quads.");
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