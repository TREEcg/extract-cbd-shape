const Benchmark = require("benchmark");
const Store = require("n3").Store;
const { RdfStore } = require("rdf-stores");
const rdfDereference = require("rdf-dereference").default;
const NamedNode = require("n3").NamedNode;

const CBDShapeExtractor =
  require("../dist/lib/CBDShapeExtractor").CBDShapeExtractor;

const { renderResults } = require("./render");
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
    await rdfDereference.dereference("./perf/resources/kbo.ttl", {
      localFiles: true,
    })
  ).data;

  //load the shacl shape from the file
  let kboDataStream130Quads = (
    await rdfDereference.dereference("./perf/resources/kbo-130-quads.ttl", {
      localFiles: true,
    })
  ).data;

  //load the shacl shape from the file
  let kboDataStream1300Quads = (
    await rdfDereference.dereference("./perf/resources/kbo-1300-quads.ttl", {
      localFiles: true,
    })
  ).data;

  //load the shacl shape from the file
  let kboShaclStream = (
    await rdfDereference.dereference(
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
    .add("Extract1#CBDAndBlankNode", async function () {
      let result = await extractor.extract(
        kboData,
        new NamedNode("https://kbopub.economie.fgov.be/kbo#0877248501.2022.11")
      );
      //console.log("Extract1#CBDAndBlankNode returned:" + result.length + " quads.");
    })
    //Extraction only star-shapes (CBD) + blank nodes to be extracted, retrieve 13 quads out of 130
    .add("Extract1.1#CBDAndBlankNodeTenPercent", async function () {
      let result = await extractor.extract(
        kboData130Quads,
        new NamedNode("https://kbopub.economie.fgov.be/kbo#0877248501.2022.11")
      );
      //console.log("Extract1.1#CBDAndBlankNodeTenPercent returned: " + result.length + " quads.");
    })

    //Extraction only star-shapes (CBD) + blank nodes to be extracted, retrieve 13 quads out of 1300
    .add("Extract1.2#CBDAndBlankNodeOnePercent", async function () {
      let result = await extractor.extract(
        kboData1300Quads,
        new NamedNode("https://kbopub.economie.fgov.be/kbo#0877248501.2022.11")
      );
      //console.log("Extract1.2#CBDAndBlankNodeOnePercent returned: " + result.length + " quads.");
    })

    //Extraction CBD + named graphs
    .add("Extract2#CBDAndNamedGraphs", async function () {
      let result = await extractor.extract(
        kboData,
        new NamedNode("https://kbopub.economie.fgov.be/kbo#0417199869.2022.11")
      );
      //console.log("Extract2#CBDAndNamedGraphs returned: " + result.length + " quads.");
    })

    //Extraction CBD + named graphs,retrieve 13 quads out of 130
    .add("Extract2.1#CBDAndNamedGraphsTenPercent", async function () {
      let result = await extractor.extract(
        kboData130Quads,
        new NamedNode("https://kbopub.economie.fgov.be/kbo#0417199869.2022.11")
      );
      //console.log("Extract2.1#CBDAndNamedGraphsTenPercent returned: " + result.length + " quads.");
    })

    //Extraction CBD + named graphs,retrieve 13 quads out of 1300
    .add("Extract2.2#CBDAndNamedGraphsOnePercent", async function () {
      let result = await extractor.extract(
        kboData1300Quads,
        new NamedNode("https://kbopub.economie.fgov.be/kbo#0417199869.2022.11")
      );
      //console.log("Extract2.2#CBDAndNamedGraphsOnePercent returned: " + result.length + " quads.");
    })

    //Extraction CBD + Simple Shape not adding any triples other than what CBD gives
    .add("Extract3#CBDAndSimpleShape", async function () {
      let result = await extractorWithShape.extract(
        kboData,
        new NamedNode("https://kbopub.economie.fgov.be/kbo#0877248501.2022.11"),
        new NamedNode("https://kbopub.economie.fgov.be/kbo#LegalEntityShape")
      );
      //console.log("Extract3#CBDAndSimpleShape returned: " + result.length + " quads.");
    })
    //Extraction CBD + Simple Shape not adding any triples other than what CBD gives, retrieve 13 quads out of 130
    .add("Extract3.1#CBDAndSimpleShapeTenPercent", async function () {
      let result = await extractorWithShape.extract(
        kboData130Quads,
        new NamedNode("https://kbopub.economie.fgov.be/kbo#0877248501.2022.11"),
        new NamedNode("https://kbopub.economie.fgov.be/kbo#LegalEntityShape")
      );
      //console.log("Extract3.1#CBDAndSimpleShapeTenPercent returned: " + result.length + " quads.");
    })

    //Extraction CBD + Simple Shape not adding any triples other than what CBD gives, retrieve 13 quads out of 1300
    .add("Extract3.2#CBDAndSimpleShapeOnePercent", async function () {
      let result = await extractorWithShape.extract(
        kboData1300Quads,
        new NamedNode("https://kbopub.economie.fgov.be/kbo#0877248501.2022.11"),
        new NamedNode("https://kbopub.economie.fgov.be/kbo#LegalEntityShape")
      );
      //console.log("Extract3.2#CBDAndSimpleShapeOnePercent returned: " + result.length + " quads.");
    })

    // Extraction CBD + named graphs + Simple shape that does not add any triples other than already present
    .add("Extract4#CBDAndSimpleShapeAndNamedGraphs", async function () {
      let result = await extractorWithShape.extract(
        kboData,
        new NamedNode("https://kbopub.economie.fgov.be/kbo#0417199869.2022.11"),
        new NamedNode("https://kbopub.economie.fgov.be/kbo#LegalEntityShape")
      );
      //console.log("Extract4#CBDAndSimpleShapeAndNamedGraphs returned: " + result.length + " quads.");
    })
    // Extraction CBD + named graphs + Simple shape that does not add any triples other than already present, retrieve 13 quads out of 130
    .add(
      "Extract4.1#CBDAndSimpleShapeAndNamedGraphsTenPercent",
      async function () {
        let result = await extractorWithShape.extract(
          kboData130Quads,
          new NamedNode(
            "https://kbopub.economie.fgov.be/kbo#0417199869.2022.11"
          ),
          new NamedNode("https://kbopub.economie.fgov.be/kbo#LegalEntityShape")
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
          new NamedNode(
            "https://kbopub.economie.fgov.be/kbo#0417199869.2022.11"
          ),
          new NamedNode("https://kbopub.economie.fgov.be/kbo#LegalEntityShape")
        );
        //console.log("Extract4.2#CBDAndSimpleShapeAndNamedGraphsOnePercent returned: " + result.length + " quads.");
      }
    )

    // Extraction Shape selecting specific property paths, but not too complex
    .add("Extract5#CBDAndShaclExtended", async function () {
      let result = await extractorWithShape.extract(
        kboData,
        new NamedNode("https://kbopub.economie.fgov.be/kbo#0877248501.2023.11"),
        new NamedNode(
          "https://kbopub.economie.fgov.be/kbo#LegalEntityShapeExtended"
        )
      );
      //console.log("Extract5#CBDAndShaclExtended returned: " + result.length + " quads.");
    })

    // Extraction Shape selecting specific property paths, but not too complex,retrieve 13 quads out of 130
    .add("Extract5.1#CBDAndShaclExtendedTenPercent", async function () {
      let result = await extractorWithShape.extract(
        kboData130Quads,
        new NamedNode("https://kbopub.economie.fgov.be/kbo#0877248501.2023.11"),
        new NamedNode(
          "https://kbopub.economie.fgov.be/kbo#LegalEntityShapeExtended"
        )
      );
      //console.log("Extract5.1#CBDAndShaclExtendedTenPercent returned: " + result.length + " quads.");
    })

    // Extraction Shape selecting specific property paths, but not too complex,retrieve 13 quads out of 1300
    .add("Extract5.2#CBDAndShaclExtendedOnePercent", async function () {
      let result = await extractorWithShape.extract(
        kboData1300Quads,
        new NamedNode("https://kbopub.economie.fgov.be/kbo#0877248501.2023.11"),
        new NamedNode(
          "https://kbopub.economie.fgov.be/kbo#LegalEntityShapeExtended"
        )
      );
      //console.log("Extract5.2#CBDAndShaclExtendedOnePercent returned: " + result.length + " quads.");
    })

    //Extraction Complex shape with conditionals
    .add("Extract6#CBDAndShaclExtendedComplex", async function () {
      let result = await extractorWithShape.extract(
        kboData,
        new NamedNode("https://kbopub.economie.fgov.be/kbo#0877248501.2023.11"),
        new NamedNode(
          "https://kbopub.economie.fgov.be/kbo#LegalEntityShapeConditions"
        )
      );
      //console.log("Extract6#CBDAndShaclExtendedComplex returned: " + result.length + " quads.");
    })
    //Extraction Complex shape with conditionals,retrieve 13 quads out of 130
    .add("Extract6.1#CBDAndShaclExtendedComplexTenPercent", async function () {
      let result = await extractorWithShape.extract(
        kboData130Quads,
        new NamedNode("https://kbopub.economie.fgov.be/kbo#0877248501.2023.11"),
        new NamedNode(
          "https://kbopub.economie.fgov.be/kbo#LegalEntityShapeConditions"
        )
      );
      //console.log("Extract6.1#CBDAndShaclExtendedComplexTenPercent returned: " + result.length + " quads.");
    })
    //Extraction Complex shape with conditionals,retrieve 13 quads out of 130
    .add("Extract6.2#CBDAndShaclExtendedComplexOnePercent", async function () {
      let result = await extractorWithShape.extract(
        kboData1300Quads,
        new NamedNode("https://kbopub.economie.fgov.be/kbo#0877248501.2023.11"),
        new NamedNode(
          "https://kbopub.economie.fgov.be/kbo#LegalEntityShapeConditions"
        )
      );
      //console.log("Extract6.2#CBDAndShaclExtendedComplexOnePercent returned: " + result.length + " quads.");
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
