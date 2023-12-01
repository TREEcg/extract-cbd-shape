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
            "./perf/resources/member.ttl",
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


    /* * Test extracting 10 members from a Collection with 10 different nodes
       * Test extracting 10 members from 1 page, but each member is out of band
       * Test extracting 10 members from 1 page, out of band, but each member has already a couple of triples in-band*/


    //out-band tests
    //Extraction 10 members from a Collection with 10 different nodes
    suite
        .add('Extract1#TenMemberCollection', async function () {
            let result = await extractor.extract(
                kboData,
                new NamedNode("http://example.org/Community"),
            );
             // console.error("Extract1#TenMemberCollection " + result.length + " quads.");
        })
        //Extraction 10 members from 1 page, but each member is out of band
        //Extraction 10 members from 1 page, out of band, but each member has already a couple of triples in-band
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