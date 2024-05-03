import { assert } from "chai";
import { RdfStore } from "rdf-stores";
import { ShapesGraph } from "../lib/ShapesGraph";
import { DataFactory } from "rdf-data-factory";
import rdfDereference from "rdf-dereference";
import fs from "fs/promises";
import * as process from 'process';
import { Term } from "rdf-js";
const df = new DataFactory();

// Check if at least one command line argument is provided
if (process.argv.length <= 2) {
  console.error('Please provide an IRI to a dereferenceable SHACL NodeShape or an LDES or tree:Collection with with tree:shape property in it');
  process.exit(1); // Exit with an error code
}

let iri = process.argv[2];

async function main () {
    let df = new DataFactory();
    let shapeStore = RdfStore.createDefault();
    let shapesGraph: ShapesGraph;
    let shapeTerm: Term = df.namedNode(iri);
    let readStream = (
      await rdfDereference.dereference(iri, {
        localFiles: true,
      })
    ).data;

    await new Promise((resolve, reject) => {
      shapeStore.import(readStream).on("end", resolve).on("error", reject);
    });
    let tmpShapeTerm: Term[] = shapeStore.getQuads(null, df.namedNode('https://w3id.org/tree#shape'), null).map((quad) => quad.object);
    if (tmpShapeTerm[0]) {
        shapeTerm = tmpShapeTerm[0];
        iri = shapeTerm.value;
    }
    if (tmpShapeTerm[0] && tmpShapeTerm[0].termType==='NamedNode') {
        //Dereference the shape and add it here. The iri is not this IRI
        console.error('GET ' + shapeTerm.value);
        //Try to dereference this one as well. If it works, nice, if it doesn’t, too bad, we’ll continue without notice.
        let readStream2 = (
            await rdfDereference.dereference(shapeTerm.value, {
              localFiles: true,
            })
        ).data;
        await new Promise((resolve, reject) => {
            shapeStore.import(readStream2).on("end", resolve).on("error", () => {
                console.error('Warning: couldn’t fetch ' + iri + ' but continuing');
                resolve(null);
            });
        });
    }

    shapesGraph = new ShapesGraph(shapeStore);
    const actualMermaid = shapesGraph.toMermaid(shapeTerm);
    console.log(actualMermaid);
}
main();