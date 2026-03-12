import Benchmark from "benchmark";
import { RdfStore } from "rdf-stores";
import { rdfDereferencer } from "rdf-dereference";
import { DataFactory } from "rdf-data-factory";
import { CBDShapeExtractor } from "../dist/lib/CBDShapeExtractor.js";
import { renderResults } from "./render.js";

const namedNode = new DataFactory().namedNode;
Benchmark.options.minSamples = 10;
Benchmark.options.maxTime = 2;

let main = async function () {
  let suite = new Benchmark.Suite(undefined, { maxTime: 2 });
  let kboData = RdfStore.createDefault();
  let shaclKBO = RdfStore.createDefault();
  //Load the quads from the file
  let kboDataStream = (
    await rdfDereferencer.dereference("./perf/resources/kbo.ttl", {
      localFiles: true,
    })
  ).data;

  //load the shacl shape from the file
  let kboShaclStream = (
    await rdfDereferencer.dereference(
      "./perf/resources/shacl-kbo.ttl",
      // "./tests/06 - shapes and named graphs/shape.ttl",
      { localFiles: true }
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
     */

  //In-band tests - 13 quads
  //Extraction only star-shapes (CBD) + blank nodes to be extracted
  suite
    .add("CBDAndBlankNode", {
      defer: true,
      fn: async function (deferred) {
        let result = await extractor.extract(
          kboData,
          namedNode("https://kbopub.economie.fgov.be/kbo#0877248501.2022.11")
        );
        //  console.log("Extract1#CBD returned " + result.length + " quads.");

        deferred.resolve();
      }
    })
    //Extraction CBD + named graphs
    .add("CBDAndNamedGraphs", {
      defer: true,
      fn: async function (deferred) {
        let result = await extractor.extract(
          kboData,
          namedNode("https://kbopub.economie.fgov.be/kbo#0417199869.2022.11")
        );
        // console.log(
        //   "Extract2#CBDAndNamedGraphs returned " + result.length + " quads."
        // );

        deferred.resolve();
      }
    })

    //Extraction CBD + Simple Shape not adding any triples other than what CBD gives
    .add("CBDAndSimpleShape", {
      defer: true,
      fn: async function (deferred) {
        let result = await extractorWithShape.extract(
          kboData,
          namedNode("https://kbopub.economie.fgov.be/kbo#0877248501.2022.11"),
          namedNode("https://kbopub.economie.fgov.be/kbo#LegalEntityShape")
        );
        // console.log("Extract3#CBDAndSimpleShape " + result.length + " quads.");

        deferred.resolve();
      }
    })

    // Extraction CBD + named graphs + Simple shape that does not add any triples other than already present
    .add("CBDAndSimpleShapeAndNamedGraphs", {
      defer: true,
      fn: async function (deferred) {
        let result = await extractorWithShape.extract(
          kboData,
          namedNode("https://kbopub.economie.fgov.be/kbo#0417199869.2022.11"),
          namedNode("https://kbopub.economie.fgov.be/kbo#LegalEntityShape")
        );
        //  console.log("Extract4#CBDAndSimpleShapeAndNamedGraphs " + result.length + " quads.");

        deferred.resolve();
      }
    })

    // Extraction Shape selecting specific property paths, but not too complex
    .add("CBDAndShaclExtended", {
      defer: true,
      fn: async function (deferred) {
        let result = await extractorWithShape.extract(
          kboData,
          namedNode("https://kbopub.economie.fgov.be/kbo#0877248501.2023.11"),
          namedNode(
            "https://kbopub.economie.fgov.be/kbo#LegalEntityShapeExtended"
          )
        );
        //  console.log("Extract5#CBDAndShaclExtended " + result.length + " quads.");

        deferred.resolve();
      }
    })

    // Extraction Complex shape with conditionals
    .add("CBDAndShaclExtendedComplex", {
      defer: true,
      fn: async function (deferred) {
        let result = await extractorWithShape.extract(
          kboData,
          namedNode("https://kbopub.economie.fgov.be/kbo#0877248501.2023.11"),
          namedNode(
            "https://kbopub.economie.fgov.be/kbo#LegalEntityShapeConditions"
          )
        );
        // console.log("Extract6#CBDAndShaclExtendedComplex " + result.length + " quads.");

        deferred.resolve();
      }
    })
    //add listeners
    .on("cycle", function (event) {
      console.log(String(event.target));
    })
    // add listeners
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

      renderResults("inband", results);
    })
    // run async
    .run({ async: true });
};
main();
