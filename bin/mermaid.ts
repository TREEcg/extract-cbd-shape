import { RdfStore } from "rdf-stores";
import { ShapesGraph } from "../lib/ShapesGraph";
import { DataFactory } from "rdf-data-factory";
import { rdfDereferencer } from "rdf-dereference";
import * as process from 'process';
import { Term } from "@rdfjs/types";
import { deflate } from "pako";
import { fromUint8Array } from 'js-base64';

const df = new DataFactory();


// Check if at least one command line argument is provided
if (process.argv.length <= 2) {
  console.error('Please provide an IRI to a dereferenceable SHACL NodeShape or an LDES or tree:Collection with with tree:shape property in it');
  process.exit(1); // Exit with an error code
}

let iri = process.argv[2];

async function main() {
  let df = new DataFactory();
  let shapeStore = RdfStore.createDefault();
  let shapesGraph: ShapesGraph;
  let shapeTerm: Term = df.namedNode(iri);
  let readStream = null;

  try {
    readStream = (
      await rdfDereferencer.dereference(iri, {
        localFiles: true,
      })
    ).data;
  } catch (err) {
    console.error('Could not open/dereference ' + iri + ' with error message:\n' + (<Error>err).cause);
    process.exit(1);
  }

  await new Promise((resolve, reject) => {
    shapeStore.import(readStream).on("end", resolve).on("error", reject);
  });

  let tmpShapeTerm: Term[] = shapeStore.getQuads(
    null,
    df.namedNode('https://w3id.org/tree#shape'),
    null
  ).map((quad) => quad.object);

  if (tmpShapeTerm[0]) {
    shapeTerm = tmpShapeTerm[0];
    iri = shapeTerm.value;
  }
  if (tmpShapeTerm[0] && tmpShapeTerm[0].termType === 'NamedNode') {
    //Dereference the shape and add it here. The iri is not this IRI
    console.error('GET ' + shapeTerm.value);
    // Try to dereference this one as well. If it works, nice, if it doesn’t, too bad, we’ll continue without notice.
    try {
      const readStream2 = (
        await rdfDereferencer.dereference(shapeTerm.value, {
          localFiles: true,
        })
      ).data;

      await new Promise((resolve, reject) => {
        shapeStore.import(readStream2).on("end", resolve).on("error", () => {
          console.error('Warning: could not fetch ' + iri + ' but continuing');
          resolve(null);
        });
      });
    } catch (err) {
      console.error('Could not dereference ' + shapeTerm.value + ' with error message:\n' + (<Error>err).cause);
    }
  }

  try {
    shapesGraph = new ShapesGraph(shapeStore);
    const actualMermaid = shapesGraph.toMermaid(shapeTerm);
    console.log('```mermaid');
    console.log(actualMermaid);
    console.log('```');


    const formatJSON = (data: unknown): string => JSON.stringify(data, undefined, 2);
    const serialize = (state: string): string => {
      const data = new TextEncoder().encode(state);
      const compressed = deflate(data, { level: 9 }); // zlib level 9
      return fromUint8Array(compressed, true); // url safe base64 encoding
    }
    const defaultState = {
      code: actualMermaid,
      mermaid: formatJSON({
        theme: 'default'
      }),
      autoSync: true,
      updateDiagram: true
    };
    const json = JSON.stringify(defaultState);
    const serialized = serialize(json);
    console.log();
    console.log('Mermaid Live: https://mermaid.live/view#pako:' + serialized);
  } catch (err) {
    console.error('Error: ' + (<Error>err).message);
  }
}
main();
