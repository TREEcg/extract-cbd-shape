const Benchmark = require("benchmark");
const CBDShapeExtractor = require('../dist/lib/CBDShapeExtractor').CBDShapeExtractor;
const Store = require('n3').Store;
const rdfDereference = require('rdf-dereference').default;
const NamedNode = require('n3').NamedNode;


let main = async function () {
    let suite = new Benchmark.Suite;
    let kboData = new Store();
    let shaclKBO = new Store();

    //Load the quads from the file
    let kboDataStream = (
        await rdfDereference.dereference(
            "./perf/resources/kbo.ttl",
            {localFiles: true},
        )
    ).data;

    //load the shacl shape from the file
    let kboShaclStream = (
        await rdfDereference.dereference(
            "./perf/resources/shacl-kbo.ttl",
            // "./tests/06 - shapes and named graphs/shape.ttl",
            {localFiles: true},
        )
    ).data;

    await new Promise((resolve, reject) => {
        kboData.import(kboDataStream).on("end", resolve).on("error", reject);
    });

    await new Promise((resolve, reject) => {
        shaclKBO.import(kboShaclStream).on("end", resolve).on("error", reject);
    });
    // console.error(shaclKBO.getQuads(null, null, null, null));


    let extractor = new CBDShapeExtractor();
    let extractorWithShape = new CBDShapeExtractor(shaclKBO);
    //console.log(shaclKBO.getQuads(null, null, null, null))


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
            // console.error("Extract2#CBDAndNamedGraphs returned " + result.length + " quads.");
        })


        //Extraction CBD + Simple Shape not adding any triples other than what CBD gives
        .add('Extract3#CBDAndSimpleShape', async function () {
            let result = await extractorWithShape.extract(
                kboData,
                new NamedNode("https://kbopub.economie.fgov.be/kbo#0877248501.2022.11"),
                new NamedNode("https://kbopub.economie.fgov.be/kbo#LegalEntityShape")
            );
            // console.error("Extract3#CBDAndSimpleShape " + result.length + " quads.");
        })


        // Extraction CBD + named graphs + Simple shape that does not add any triples other than already present
        .add('Extract4#CBDAndSimpleShapeAndNamedGraphs', async function () {
            let result = await extractorWithShape.extract(
                kboData,
                new NamedNode("https://kbopub.economie.fgov.be/kbo#0417199869.2022.11"),
                new NamedNode("https://kbopub.economie.fgov.be/kbo#LegalEntityShape")
            );
            // console.error("Extract4#CBDAndSimpleShapeAndNamedGraphs " + result.length + " quads.");
        })

        // Extraction Shape selecting specific property paths, but not too complex
        .add('Extract5#CBDAndShaclExtended', async function () {
            let result = await extractorWithShape.extract(
                kboData,
                new NamedNode("https://kbopub.economie.fgov.be/kbo#0877248501.2022.11"),
                new NamedNode("https://kbopub.economie.fgov.be/kbo#LegalEntityShapeExtended")
            );
            // console.error("Extract5#CBDAndShaclExtended " + result.length + " quads.");
        })

        // add listeners
        .on('cycle', function (event) {
            console.log(String(event.target));
        })
        .on('complete', function () {
            console.log('Fastest is ' + String(this.filter('fastest').map('name')));
        })
        // run async
        .run({'async': true});

}
main();