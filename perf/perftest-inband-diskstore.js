import Benchmark from "benchmark";
import { RdfStore } from "rdf-stores";
import { rdfDereferencer } from "rdf-dereference";
import { DataFactory } from "rdf-data-factory";
import { Quadstore } from "quadstore";
import { Level } from "level";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { CBDShapeExtractor } from "../dist/lib/CBDShapeExtractor.js";
import { renderResults } from "./render.js";

const namedNode = new DataFactory().namedNode;
Benchmark.options.minSamples = 10;
Benchmark.options.maxTime = 2;

let main = async function () {
    let suite = new Benchmark.Suite(undefined, { maxTime: 2 });

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "quadstore-perf-"));
    const backend = new Level(tempDir);
    const quadStore = new Quadstore({
        backend: backend,
        dataFactory: new DataFactory(),
    });
    await quadStore.open();

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
        quadStore.import(kboDataStream).on("end", resolve).on("error", reject);
    });

    await new Promise((resolve, reject) => {
        shaclKBO.import(kboShaclStream).on("end", resolve).on("error", reject);
    });

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
                    quadStore,
                    namedNode("https://kbopub.economie.fgov.be/kbo#0877248501.2022.11")
                );
                deferred.resolve();
            }
        })
        //Extraction CBD + named graphs
        .add("CBDAndNamedGraphs", {
            defer: true,
            fn: async function (deferred) {
                let result = await extractor.extract(
                    quadStore,
                    namedNode("https://kbopub.economie.fgov.be/kbo#0417199869.2022.11")
                );
                deferred.resolve();
            }
        })

        //Extraction CBD + Simple Shape not adding any triples other than what CBD gives
        .add("CBDAndSimpleShape", {
            defer: true,
            fn: async function (deferred) {
                let result = await extractorWithShape.extract(
                    quadStore,
                    namedNode("https://kbopub.economie.fgov.be/kbo#0877248501.2022.11"),
                    namedNode("https://kbopub.economie.fgov.be/kbo#LegalEntityShape")
                );
                deferred.resolve();
            }
        })

        // Extraction CBD + named graphs + Simple shape that does not add any triples other than already present
        .add("CBDAndSimpleShapeAndNamedGraphs", {
            defer: true,
            fn: async function (deferred) {
                let result = await extractorWithShape.extract(
                    quadStore,
                    namedNode("https://kbopub.economie.fgov.be/kbo#0417199869.2022.11"),
                    namedNode("https://kbopub.economie.fgov.be/kbo#LegalEntityShape")
                );
                deferred.resolve();
            }
        })

        // Extraction Shape selecting specific property paths, but not too complex
        .add("CBDAndShaclExtended", {
            defer: true,
            fn: async function (deferred) {
                let result = await extractorWithShape.extract(
                    quadStore,
                    namedNode("https://kbopub.economie.fgov.be/kbo#0877248501.2023.11"),
                    namedNode(
                        "https://kbopub.economie.fgov.be/kbo#LegalEntityShapeExtended"
                    )
                );
                deferred.resolve();
            }
        })

        // Extraction Complex shape with conditionals
        .add("CBDAndShaclExtendedComplex", {
            defer: true,
            fn: async function (deferred) {
                let result = await extractorWithShape.extract(
                    quadStore,
                    namedNode("https://kbopub.economie.fgov.be/kbo#0877248501.2023.11"),
                    namedNode(
                        "https://kbopub.economie.fgov.be/kbo#LegalEntityShapeConditions"
                    )
                );
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

            renderResults("inband-diskstore", results);

            // Cleanup
            (async () => {
                await quadStore.close();
                await backend.close();
                await fs.rm(tempDir, { recursive: true, force: true });
            })();
        })
        // run async
        .run({ async: true });
};
main();
