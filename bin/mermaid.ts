import { assert } from "chai";
import { RdfStore } from "rdf-stores";
import { ShapesGraph } from "../lib/ShapesGraph";
import { DataFactory } from "rdf-data-factory";
import rdfDereference from "rdf-dereference";
import fs from "fs/promises";
import * as process from 'process';
const df = new DataFactory();

// Check if at least one command line argument is provided
if (process.argv.length <= 2) {
  console.error('Please provide an IRI to a dereferenceable SHACL NodeShape');
  process.exit(1); // Exit with an error code
}

const iri = process.argv[2];

async function main () {
    let df = new DataFactory();
    let shapeStore = RdfStore.createDefault();
    let shapesGraph: ShapesGraph;
    let readStream = (
      await rdfDereference.dereference(iri, {
        localFiles: true,
      })
    ).data;

    await new Promise((resolve, reject) => {
      shapeStore.import(readStream).on("end", resolve).on("error", reject);
    });

    shapesGraph = new ShapesGraph(shapeStore);
    const actualMermaid = shapesGraph.toMermaid(df.namedNode(iri));
    console.log(actualMermaid);
}
main();