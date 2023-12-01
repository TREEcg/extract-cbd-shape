const Benchmark = require("benchmark");
const CBDShapeExtractor = require('../dist/lib/CBDShapeExtractor').CBDShapeExtractor;
const Store = require('n3').Store;
const rdfDereference = require('rdf-dereference').default;
const NamedNode = require('n3').NamedNode;


let main = async function () {
    let suite = new Benchmark.Suite;
    let memberData = new Store();
    let shaclmember = new Store();

    //Load the quads from the file
    let memberDataStream = (
        await rdfDereference.dereference(
            "./perf/resources/member.ttl",
            {localFiles: true},
        )
    ).data;

    //load the shacl shape from the file
    let memberShaclStream = (
        await rdfDereference.dereference(
            "./perf/resources/shacl-member.ttl",
            // "./tests/06 - shapes and named graphs/shape.ttl",
            {localFiles: true},
        )
    ).data;

    await new Promise((resolve, reject) => {
        memberData.import(memberDataStream).on("end", resolve).on("error", reject);
    });

    await new Promise((resolve, reject) => {
        shaclmember.import(memberShaclStream).on("end", resolve).on("error", reject);
    });
    // console.error(shaclmember.getQuads(null, null, null, null));


    let extractor = new CBDShapeExtractor();
    let extractorWithShape = new CBDShapeExtractor(shaclmember);
    //console.log(shaclmember.getQuads(null, null, null, null))


    /* * Test extracting 10 members from a Collection with 10 different nodes
       * Test extracting 10 members from 1 page, but each member is out of band
       * Test extracting 10 members from 1 page, out of band, but each member has already a couple of triples in-band*/


    //out-band tests
    //Extraction 10 members from a Collection with 10 different nodes
    suite
        .add('Extract1#ExtractionCollectionMembers', async function ExtractTenMemberCollection() {
                const members = memberData.getQuads(null, "https://w3id.org/tree#member", null);
                const result = new Store();
                for (const member of members) {
                    result.addQuads( await extractor.extract(
                        memberData,
                        member.object,
                    ));
                }
                 // console.error("Extract1#ExtractionMember " + result.size + " quads.");
            }
        )
        //Extraction 10 members from 1 page, but each member is out of band
        .add('Extract2#ExtractionCollectionMembersOutBand', {
        defer: true, // Enable asynchronous test
        fn: async function ExtractTenMemberCollection(deferred) {
            const members = memberData.getQuads(null, "https://w3id.org/tree#member", null);
            const result = new Store();
            for (const member of members) {
                let extract = await extractorWithShape.extract(
                    memberData,
                    member.object,
                    new NamedNode("http://example.org/memberShape")
                );
                // console.log(extract);
                result.addQuads(extract);
            }
            // console.error("Extract2#ExtractionCollectionMembersOutBand " + result.size + " quads.");

            // Resolve the deferred object to signal the end of the asynchronous test
            deferred.resolve();
        },
        // Set the timeout for this specific test
        time: 25000,
    })
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