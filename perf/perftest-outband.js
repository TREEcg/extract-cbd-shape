import Benchmark from "benchmark";
import { RdfStore } from "rdf-stores";
import { rdfDereferencer } from "rdf-dereference";
import { NamedNode } from "n3";
import { performance } from "perf_hooks";
import { JSDOM } from "jsdom";
import { CBDShapeExtractor } from "../dist/lib/CBDShapeExtractor.js";
import { renderResults } from "./render.js";
const runBenchmarkInCleanContext = async (
  benchmarkName,
  benchmarkFn,
  deferred
) => {
  const dom = new JSDOM();
  const cleanContext = dom.window.document;

  const startTime = performance.now();

  try {
    // Pass the clean context
    await benchmarkFn(cleanContext);
  } catch (error) {
    console.error(`Benchmark ${benchmarkName} failed: ${error}`);
  } finally {
    const endTime = performance.now();
    // console.log(`${benchmarkName} took ${endTime - startTime} milliseconds in a clean context`);
    deferred.resolve();
  }
};

let main = async function () {
  let suite = new Benchmark.Suite();
  let memberData = RdfStore.createDefault();
  let memberData1000Members = RdfStore.createDefault();
  let memberOutBandData = RdfStore.createDefault();
  let memberOutBandDataPartial = RdfStore.createDefault();
  let shaclmember = RdfStore.createDefault();

  //Load the quads from the file
  let memberDataStream = (
    await rdfDereferencer.dereference("./perf/resources/member.ttl", {
      localFiles: true,
    })
  ).data;

  //Load the quads from the file
  let memberDataStream1000members = (
    await rdfDereferencer.dereference("./perf/resources/member-1000.ttl", {
      localFiles: true,
    })
  ).data;

  //Load the quads from the file
  let memberDataStreamOutBand = (
    await rdfDereferencer.dereference("./perf/resources/member-outband.ttl", {
      localFiles: true,
    })
  ).data;

  //Load the quads from the file
  let memberDataStreamOutBandPartial = (
    await rdfDereferencer.dereference(
      "./perf/resources/member-partial-outband.ttl",
      {
        localFiles: true,
      }
    )
  ).data;

  //load the shacl shape from the file
  let memberShaclStream = (
    await rdfDereferencer.dereference("./perf/resources/shacl-member.ttl", {
      localFiles: true,
    })
  ).data;

  await new Promise((resolve, reject) => {
    memberData.import(memberDataStream).on("end", resolve).on("error", reject);
  });

  await new Promise((resolve, reject) => {
    memberData1000Members
      .import(memberDataStream1000members)
      .on("end", resolve)
      .on("error", reject);
  });

  await new Promise((resolve, reject) => {
    memberOutBandData
      .import(memberDataStreamOutBand)
      .on("end", resolve)
      .on("error", reject);
  });

  await new Promise((resolve, reject) => {
    memberOutBandDataPartial
      .import(memberDataStreamOutBandPartial)
      .on("end", resolve)
      .on("error", reject);
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

  /*
   * Test extracting 10 members from a Collection with 10 different nodes
   * Test extracting 10 members from 1 page, out of band, but each member has already a couple of triples in-band
   * Test extracting 10 members from 1 page, but each member is out of band
   * Test extracting 10 members from a Collection with 1000 different nodes
   **/

  //out-band tests

  suite
    //Extraction 10 members from a Collection with 10 different nodes
    .add("Extract1#ExtractionCollectionMembers", {
      defer: true,
      fn: async (deferred) => {
        await runBenchmarkInCleanContext(
          "Extract1#ExtractionCollectionMembers",
          async (cleanContext) => {
            const members = memberData.getQuads(
              null,
              new NamedNode("https://w3id.org/tree#member"),
              null,
              null
            );
            const result = RdfStore.createDefault();
            for (const member of members) {
              for (const quad of await extractor.extract(
                memberData,
                member.object
              )) {
                result.addQuad(quad);
              }
            }
            // console.log("Extract1#ExtractionCollection10Members: " + result.size + " quads.");
          },
          deferred
        );
      }
    })

    // Extraction 10 members from 1 page, out of band, but each member has already a couple of triples in-band
    // 20 quads in band
    // 20 quads out of band
    .add("Extract2#ExtractionMembersPartialOutBand", {
      defer: true,
      fn: async (deferred) => {
        await runBenchmarkInCleanContext(
          "Extract2#ExtractionMembersPartialOutBand",
          async (cleanContext) => {
            const members = memberData.getQuads(
              null,
              new NamedNode("https://w3id.org/tree#member"),
              null,
              null
            );
            const result = RdfStore.createDefault();
            for (const member of members) {
              let extract = await extractorWithShape.extract(
                memberOutBandDataPartial,
                member.object,
                new NamedNode("http://example.org/memberShape")
              );
              // console.log(extract);
              for (const quad of extract) {
                result.addQuad(quad);
              }
            }
            // console.log("Extract3#ExtractionMembersPartialOutBand: " + result.size + " quads.");
          },
          deferred
        ); // Set the timeout for this specific benchmark
      }
    })

    // * Test extracting 10 members from 1 page, but each member is out of band*/
    .add("Extract3#ExtractionMembersOutBand", {
      defer: true,
      fn: async (deferred) => {
        await runBenchmarkInCleanContext(
          "Extract3#ExtractionMembersOutBand",
          async (cleanContext) => {
            const members = memberData.getQuads(
              null,
              new NamedNode("https://w3id.org/tree#member"),
              null,
              null
            );
            const result = RdfStore.createDefault();
            for (const member of members) {
              let extract = await extractorWithShape.extract(
                memberOutBandData,
                member.object,
                new NamedNode("http://example.org/memberShape")
              );
              // console.log(extract);
              for (const quad of extract) {
                result.addQuad(quad);
              }
            }
            // console.log("Extract4#ExtractionMembersOutBand: " + result.size + " quads.");
          },
          deferred
        ); // Set the timeout for this specific benchmark
      }
    })

    //Extraction 1000 members from a Collection with 1000 different nodes
    .add("Extract4#ExtractionCollection1000Members", {
      defer: true,
      fn: async (deferred) => {
        await runBenchmarkInCleanContext(
          "Extract#ExtractionCollection1000Members",
          async (cleanContext) => {
            const members = memberData1000Members.getQuads(
              null,
              new NamedNode("https://w3id.org/tree#member"),
              null,
              null
            );
            const result = RdfStore.createDefault();
            for (const member of members) {
              for (const quad of await extractor.extract(
                memberData1000Members,
                member.object
              )) {
                result.addQuad(quad);
              }
            }
            // console.log("Extract2#ExtractionCollection1000Members: " + result.size + " quads.");
          },
          deferred
        );
      }
    })
    //add listeners
    .on("cycle", function (event) {
      console.log(String(event.target));
    })
    //add listeners
    .on("complete", function () {
      const results = this.map((test) => {
        return {
          name: test.name,
          opsPerSecond: test.hz,
          samples: test.stats.sample.length,
          mean: test.stats.mean,
          deviation: test.stats.deviation,
        };
      });
      renderResults("outband", results);
    })
    // run async
    .run({ async: true });
};
main();
