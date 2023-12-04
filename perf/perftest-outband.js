const Benchmark = require("benchmark");
const Store = require("n3").Store;
const rdfDereference = require("rdf-dereference").default;
const NamedNode = require("n3").NamedNode;
const { performance } = require("perf_hooks");
const { JSDOM } = require("jsdom");

const CBDShapeExtractor =
  require("../dist/lib/CBDShapeExtractor").CBDShapeExtractor;

const { renderResults } = require("./render");
const runBenchmarkInCleanContext = async (benchmarkName, benchmarkFn, timeout) => {
  const dom = new JSDOM();
  const cleanContext = dom.window.document;

  const deferred = {
    resolve: () => {
      // Resolve the deferred object to signal the end of the asynchronous test
      // console.log(`Benchmark ${benchmarkName} completed`);
    },
  };

  const startTime = performance.now();

  try {
    // Pass the deferred object to the benchmark function
    await benchmarkFn(cleanContext, deferred);
  } catch (error) {
    console.error(`Benchmark ${benchmarkName} failed: ${error}`);
  } finally {
    const endTime = performance.now();
    // console.log(`${benchmarkName} took ${endTime - startTime} milliseconds in a clean context`);

    // If a timeout is provided, use it to wait before resolving
    if (timeout) {
      setTimeout(() => {
        deferred.resolve();
      }, timeout);
    } else {
      deferred.resolve();
    }
  }
};




let main = async function () {
  let suite = new Benchmark.Suite();
  let memberData = new Store();
  let memberOutBandData = new Store();
  let memberOutBandDataPartial = new Store();
  let shaclmember = new Store();

  //Load the quads from the file
  let memberDataStream = (
    await rdfDereference.dereference("./perf/resources/member.ttl", {
      localFiles: true,
    })
  ).data;

  //Load the quads from the file
  let memberDataStreamOutBand = (
      await rdfDereference.dereference("./perf/resources/member-outband.ttl", {
        localFiles: true,
      })
  ).data;

  //Load the quads from the file
  let memberDataStreamOutBandPartial = (
      await rdfDereference.dereference("./perf/resources/member-partial-outband.ttl", {
        localFiles: true,
      })
  ).data;

  //load the shacl shape from the file
  let memberShaclStream = (
    await rdfDereference.dereference(
      "./perf/resources/shacl-member.ttl",
      { localFiles: true }
    )
  ).data;

  await new Promise((resolve, reject) => {
    memberData.import(memberDataStream).on("end", resolve).on("error", reject);
  });

  await new Promise((resolve, reject) => {
    memberOutBandData.import(memberDataStreamOutBand).on("end", resolve).on("error", reject);
  });

  await new Promise((resolve, reject) => {
    memberOutBandDataPartial.import(memberDataStreamOutBandPartial).on("end", resolve).on("error", reject);
  });


  await new Promise((resolve, reject) => {
    shaclmember
      .import(memberShaclStream)
      .on("end", resolve)
      .on("error", reject);
  });
  // console.error(shaclmember.getQuads(null, null, null, null));

  let extractor = new CBDShapeExtractor();
  let extractorWithShape = new CBDShapeExtractor(shaclmember);
  //console.log(shaclmember.getQuads(null, null, null, null))

  /* * Test extracting 10 members from a Collection with 10 different nodes
    * Test extracting 10 members from 1 page, out of band, but each member has already a couple of triples in-band
    * Test extracting 10 members from 1 page, but each member is out of band*/

  //out-band tests
  //Extraction 10 members from a Collection with 10 different nodes
  suite
      .add("Extract1#ExtractionCollectionMembers", async () => {
    await runBenchmarkInCleanContext("Extract1#ExtractionCollectionMembers", async (cleanContext, deferred) => {
      const members = memberData.getQuads(null, "https://w3id.org/tree#member", null);
      const result = new Store();
      for (const member of members) {
        result.addQuads(await extractor.extract(memberData, member.object));
      }
      // console.error("Extract1#ExtractionMembersAllInBand " + result.size + " quads.");
    }, 25000);
  })



      // Extraction 10 members from 1 page, out of band, but each member has already a couple of triples in-band
      // 20 quads in band
      // 20 quads out of band
      .add("Extract2#ExtractionMembersPartialOutBand", async (deferred) => {
        await runBenchmarkInCleanContext("Extract2#ExtractionMembersPartialOutBand", async (cleanContext) => {
          const members = memberOutBandDataPartial.getQuads(
              null,
              "https://w3id.org/tree#member",
              null
          );
          const result = new Store();
          for (const member of members) {
            let extract = await extractorWithShape.extract(
                memberOutBandDataPartial,
                member.object,
                new NamedNode("http://example.org/memberShape")
            );
            // console.log(extract);
            result.addQuads(extract);
          }
          // console.error("Extract2#ExtractionMembersPartialOutBand " + result.size + " quads.");
        }, 25000); // Set the timeout for this specific benchmark
      })

      // * Test extracting 10 members from 1 page, but each member is out of band*/
      .add("Extract3#ExtractionMembersOutBand", async (deferred) => {
        await runBenchmarkInCleanContext("Extract3#ExtractionMembersOutBand", async (cleanContext) => {
          const members = memberOutBandData.getQuads(
              null,
              "https://w3id.org/tree#member",
              null
          );
          const result = new Store();
          for (const member of members) {
            let extract = await extractorWithShape.extract(
                memberOutBandData,
                member.object,
                new NamedNode("http://example.org/memberShape")
            );
            // console.log(extract);
            result.addQuads(extract);
          }
          console.error("Extract3#ExtractionMembersOutBand " + result.size + " quads.");
        }, 25000); // Set the timeout for this specific benchmark
      })


    .on("complete", function () {
      const results = this.map((test) => {
        return {
          name: test.name,
          opsPerSecond: test.hz,
          samples: test.stats.sample.length,
        };
      });
      renderResults("outband", results);
    })
    // run async
    .run({ async: true });
};
main();
