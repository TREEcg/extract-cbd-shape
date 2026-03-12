import Benchmark from "benchmark";
import { RdfStore } from "rdf-stores";
import { rdfDereferencer } from "rdf-dereference";
import { DataFactory } from "rdf-data-factory";
import { CBDShapeExtractor } from "../dist/lib/CBDShapeExtractor.js";
import { renderResults } from "./render.js";

const namedNode = new DataFactory().namedNode;
Benchmark.options.minSamples = 100;
Benchmark.options.maxTime = 2;

let main = async function () {
  let suite = new Benchmark.Suite(undefined, { maxTime: 2 });
  let kboData = RdfStore.createDefault();
  let kboData130Quads = RdfStore.createDefault();
  let kboData1300Quads = RdfStore.createDefault();
  let shaclKBO = RdfStore.createDefault();
  //Load the quads from the file
  let kboDataStream = (
    await rdfDereferencer.dereference("./perf/resources/kbo.ttl", {
      localFiles: true,
    })
  ).data;

  //load the shacl shape from the file
  let kboDataStream130Quads = (
    await rdfDereferencer.dereference("./perf/resources/kbo-130-quads.ttl", {
      localFiles: true,
    })
  ).data;

  //load the shacl shape from the file
  let kboDataStream1300Quads = (
    await rdfDereferencer.dereference("./perf/resources/kbo-1300-quads.ttl", {
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
    kboData130Quads
      .import(kboDataStream130Quads)
      .on("end", resolve)
      .on("error", reject);
  });

  await new Promise((resolve, reject) => {
    kboData1300Quads
      .import(kboDataStream1300Quads)
      .on("end", resolve)
      .on("error", reject);
  });

  await new Promise((resolve, reject) => {
    shaclKBO.import(kboShaclStream).on("end", resolve).on("error", reject);
  });
  ////console.log(kboData130Quads.size);

  let extractor = new CBDShapeExtractor();
  let extractorWithShape = new CBDShapeExtractor(shaclKBO);

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
    //Extraction only star-shapes (CBD) + blank nodes to be extracted
    .add("Extract1#CBDAndBlankNode", {
      defer: true,
      fn: async function(deferred) {
      let result = await extractor.extract(
        kboData,
        namedNode("https://kbopub.economie.fgov.be/kbo#0877248501.2022.11")
      );
      //console.log("Extract1#CBDAndBlankNode returned:" + result.length + " quads.");
    
      deferred.resolve();
    }
    })
    //Extraction only star-shapes (CBD) + blank nodes to be extracted, retrieve 13 quads out of 130
    .add("Extract1.1#CBDAndBlankNodeTenPercent", {
      defer: true,
      fn: async function(deferred) {
      let result = await extractor.extract(
        kboData130Quads,
        namedNode("https://kbopub.economie.fgov.be/kbo#0877248501.2022.11")
      );
      //console.log("Extract1.1#CBDAndBlankNodeTenPercent returned: " + result.length + " quads.");
    
      deferred.resolve();
    }
    })

    //Extraction only star-shapes (CBD) + blank nodes to be extracted, retrieve 13 quads out of 1300
    .add("Extract1.2#CBDAndBlankNodeOnePercent", {
      defer: true,
      fn: async function(deferred) {
      let result = await extractor.extract(
        kboData1300Quads,
        namedNode("https://kbopub.economie.fgov.be/kbo#0877248501.2022.11")
      );
      //console.log("Extract1.2#CBDAndBlankNodeOnePercent returned: " + result.length + " quads.");
    
      deferred.resolve();
    }
    })

    //Extraction CBD + named graphs
    .add("Extract2#CBDAndNamedGraphs", {
      defer: true,
      fn: async function(deferred) {
      let result = await extractor.extract(
        kboData,
        namedNode("https://kbopub.economie.fgov.be/kbo#0417199869.2022.11")
      );
      //console.log("Extract2#CBDAndNamedGraphs returned: " + result.length + " quads.");
    
      deferred.resolve();
    }
    })

    //Extraction CBD + named graphs,retrieve 13 quads out of 130
    .add("Extract2.1#CBDAndNamedGraphsTenPercent", {
      defer: true,
      fn: async function(deferred) {
      let result = await extractor.extract(
        kboData130Quads,
        namedNode("https://kbopub.economie.fgov.be/kbo#0417199869.2022.11")
      );
      //console.log("Extract2.1#CBDAndNamedGraphsTenPercent returned: " + result.length + " quads.");
    
      deferred.resolve();
    }
    })

    //Extraction CBD + named graphs,retrieve 13 quads out of 1300
    .add("Extract2.2#CBDAndNamedGraphsOnePercent", {
      defer: true,
      fn: async function(deferred) {
      let result = await extractor.extract(
        kboData1300Quads,
        namedNode("https://kbopub.economie.fgov.be/kbo#0417199869.2022.11")
      );
      //console.log("Extract2.2#CBDAndNamedGraphsOnePercent returned: " + result.length + " quads.");
    
      deferred.resolve();
    }
    })

    //Extraction CBD + Simple Shape not adding any triples other than what CBD gives
    .add("Extract3#CBDAndSimpleShape", {
      defer: true,
      fn: async function(deferred) {
      let result = await extractorWithShape.extract(
        kboData,
        namedNode("https://kbopub.economie.fgov.be/kbo#0877248501.2022.11"),
        namedNode("https://kbopub.economie.fgov.be/kbo#LegalEntityShape")
      );
      //console.log("Extract3#CBDAndSimpleShape returned: " + result.length + " quads.");
    
      deferred.resolve();
    }
    })
    //Extraction CBD + Simple Shape not adding any triples other than what CBD gives, retrieve 13 quads out of 130
    .add("Extract3.1#CBDAndSimpleShapeTenPercent", {
      defer: true,
      fn: async function(deferred) {
      let result = await extractorWithShape.extract(
        kboData130Quads,
        namedNode("https://kbopub.economie.fgov.be/kbo#0877248501.2022.11"),
        namedNode("https://kbopub.economie.fgov.be/kbo#LegalEntityShape")
      );
      //console.log("Extract3.1#CBDAndSimpleShapeTenPercent returned: " + result.length + " quads.");
    
      deferred.resolve();
    }
    })

    //Extraction CBD + Simple Shape not adding any triples other than what CBD gives, retrieve 13 quads out of 1300
    .add("Extract3.2#CBDAndSimpleShapeOnePercent", {
      defer: true,
      fn: async function(deferred) {
      let result = await extractorWithShape.extract(
        kboData1300Quads,
        namedNode("https://kbopub.economie.fgov.be/kbo#0877248501.2022.11"),
        namedNode("https://kbopub.economie.fgov.be/kbo#LegalEntityShape")
      );
      //console.log("Extract3.2#CBDAndSimpleShapeOnePercent returned: " + result.length + " quads.");
    
      deferred.resolve();
    }
    })

    // Extraction CBD + named graphs + Simple shape that does not add any triples other than already present
    .add("Extract4#CBDAndSimpleShapeAndNamedGraphs", {
      defer: true,
      fn: async function(deferred) {
      let result = await extractorWithShape.extract(
        kboData,
        namedNode("https://kbopub.economie.fgov.be/kbo#0417199869.2022.11"),
        namedNode("https://kbopub.economie.fgov.be/kbo#LegalEntityShape")
      );
      //console.log("Extract4#CBDAndSimpleShapeAndNamedGraphs returned: " + result.length + " quads.");
    
      deferred.resolve();
    }
    })
    // Extraction CBD + named graphs + Simple shape that does not add any triples other than already present, retrieve 13 quads out of 130
    .add(
      "Extract4.1#CBDAndSimpleShapeAndNamedGraphsTenPercent",
      async function () {
        let result = await extractorWithShape.extract(
          kboData130Quads,
          namedNode(
            "https://kbopub.economie.fgov.be/kbo#0417199869.2022.11"
          ),
          namedNode("https://kbopub.economie.fgov.be/kbo#LegalEntityShape")
        );
        //console.log("Extract4.1#CBDAndSimpleShapeAndNamedGraphsTenPercent returned: " + result.length + " quads.");
      }
    )
    // Extraction CBD + named graphs + Simple shape that does not add any triples other than already present, retrieve 13 quads out of 1300
    .add(
      "Extract4.2#CBDAndSimpleShapeAndNamedGraphsOnePercent",
      async function () {
        let result = await extractorWithShape.extract(
          kboData1300Quads,
          namedNode(
            "https://kbopub.economie.fgov.be/kbo#0417199869.2022.11"
          ),
          namedNode("https://kbopub.economie.fgov.be/kbo#LegalEntityShape")
        );
        //console.log("Extract4.2#CBDAndSimpleShapeAndNamedGraphsOnePercent returned: " + result.length + " quads.");
      }
    )

    // Extraction Shape selecting specific property paths, but not too complex
    .add("Extract5#CBDAndShaclExtended", {
      defer: true,
      fn: async function(deferred) {
      let result = await extractorWithShape.extract(
        kboData,
        namedNode("https://kbopub.economie.fgov.be/kbo#0877248501.2023.11"),
        namedNode(
          "https://kbopub.economie.fgov.be/kbo#LegalEntityShapeExtended"
        )
      );
      //console.log("Extract5#CBDAndShaclExtended returned: " + result.length + " quads.");
    
      deferred.resolve();
    }
    })

    // Extraction Shape selecting specific property paths, but not too complex,retrieve 13 quads out of 130
    .add("Extract5.1#CBDAndShaclExtendedTenPercent", {
      defer: true,
      fn: async function(deferred) {
      let result = await extractorWithShape.extract(
        kboData130Quads,
        namedNode("https://kbopub.economie.fgov.be/kbo#0877248501.2023.11"),
        namedNode(
          "https://kbopub.economie.fgov.be/kbo#LegalEntityShapeExtended"
        )
      );
      //console.log("Extract5.1#CBDAndShaclExtendedTenPercent returned: " + result.length + " quads.");
    
      deferred.resolve();
    }
    })

    // Extraction Shape selecting specific property paths, but not too complex,retrieve 13 quads out of 1300
    .add("Extract5.2#CBDAndShaclExtendedOnePercent", {
      defer: true,
      fn: async function(deferred) {
      let result = await extractorWithShape.extract(
        kboData1300Quads,
        namedNode("https://kbopub.economie.fgov.be/kbo#0877248501.2023.11"),
        namedNode(
          "https://kbopub.economie.fgov.be/kbo#LegalEntityShapeExtended"
        )
      );
      //console.log("Extract5.2#CBDAndShaclExtendedOnePercent returned: " + result.length + " quads.");
    
      deferred.resolve();
    }
    })

    //Extraction Complex shape with conditionals
    .add("Extract6#CBDAndShaclExtendedComplex", {
      defer: true,
      fn: async function(deferred) {
      let result = await extractorWithShape.extract(
        kboData,
        namedNode("https://kbopub.economie.fgov.be/kbo#0877248501.2023.11"),
        namedNode(
          "https://kbopub.economie.fgov.be/kbo#LegalEntityShapeConditions"
        )
      );
      //console.log("Extract6#CBDAndShaclExtendedComplex returned: " + result.length + " quads.");
    
      deferred.resolve();
    }
    })
    //Extraction Complex shape with conditionals,retrieve 13 quads out of 130
    .add("Extract6.1#CBDAndShaclExtendedComplexTenPercent", {
      defer: true,
      fn: async function(deferred) {
      let result = await extractorWithShape.extract(
        kboData130Quads,
        namedNode("https://kbopub.economie.fgov.be/kbo#0877248501.2023.11"),
        namedNode(
          "https://kbopub.economie.fgov.be/kbo#LegalEntityShapeConditions"
        )
      );
      //console.log("Extract6.1#CBDAndShaclExtendedComplexTenPercent returned: " + result.length + " quads.");
    
      deferred.resolve();
    }
    })
    //Extraction Complex shape with conditionals,retrieve 13 quads out of 130
    .add("Extract6.2#CBDAndShaclExtendedComplexOnePercent", {
      defer: true,
      fn: async function(deferred) {
      let result = await extractorWithShape.extract(
        kboData1300Quads,
        namedNode("https://kbopub.economie.fgov.be/kbo#0877248501.2023.11"),
        namedNode(
          "https://kbopub.economie.fgov.be/kbo#LegalEntityShapeConditions"
        )
      );
      //console.log("Extract6.2#CBDAndShaclExtendedComplexOnePercent returned: " + result.length + " quads.");
    
      deferred.resolve();
    }
    })

    // add listeners
    .on("complete", function () {
      const results = this.map((test) => {
        return {
          name: test.name,
          opsPerSecond: test.hz,
          samples: test.stats.sample.length,
        };
      });
      renderResults("inband-percent", results);
    })
    // run async
    .run({ async: true });
};
main();
