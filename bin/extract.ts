import * as process from 'process';
import { CBDShapeExtractor } from '../lib/CBDShapeExtractor';
import { Writer } from 'n3';
import { DataFactory } from 'rdf-data-factory';
import { RdfStore } from 'rdf-stores';
import rdfDereference from 'rdf-dereference';

const df = new DataFactory();

// Check if at least one command line argument is provided
if (process.argv.length <= 2) {
  console.error('Please provide an entity to describe in the first command line parameter, and optionally a shape IRI to fulfill, and a IRI');
  process.exit(1); // Exit with an error code
}

async function loadShape(shapeURL: string, shapeStore: RdfStore) {
    let readStream = (await rdfDereference.dereference(shapeURL)).data;
    let requested : string[] = [shapeURL]
    await new Promise ((resolve, reject) => {
        shapeStore.import(readStream).on("end",resolve)
        .on("error", reject);
    });
    //Now check whether there are one or more owl:imports on the shapesgraph -- But we don’t know how to know the IRI of the shapesgraph as it is not included in the SHACL spec... So we’ll leave it open for now.
    let importsURLs = shapeStore.getQuads(null, df.namedNode('http://www.w3.org/2002/07/owl#imports'),null,null).map((quad) => {
        return quad.object.value ;
    });
    //If the import has not been requested before, let’s request it
    for (let imp of importsURLs) {
        if (!requested.includes(imp)) {
            requested.push(imp);
            let newReadStream = (await rdfDereference.dereference(imp)).data;
            await new Promise ((resolve, reject) => {
                shapeStore.import(newReadStream).on("end",resolve)
                .on("error", reject);
            });
            //check for new imports URLs
            importsURLs = shapeStore.getQuads(null, df.namedNode('http://www.w3.org/2002/07/owl#imports'),null,null).map((quad) => {
                return quad.object.value ;
            });
        }
    }
}

async function main () {
    // Get the command line parameter at index 2 (index 0 is the node executable and index 1 is the script file)
    const entity = process.argv[2];
    let shapeStore:RdfStore = RdfStore.createDefault();
    let shapeId = "";
    if (process.argv[3]) {
        //A shape type has been set!
        if(process.argv[3] === 'shape') {
            //Use our own shape extractor shape
            shapeId = "https://raw.githubusercontent.com/pietercolpaert/extract-cbd-shape/main/extract-cbd-shape-ap.ttl#ShapeShape";
        } else {
            shapeId = process.argv[3];
        }
        await loadShape(shapeId, shapeStore);
    }
    let extractor = new CBDShapeExtractor(shapeStore);
    console.error('Processing shape ' + shapeId + ' from this shape: ', extractor.shapesGraph);
    let writer = new Writer();
    let quads = await extractor.extract(RdfStore.createDefault(), df.namedNode(entity), df.namedNode(shapeId));
    writer.addQuads(quads);
    writer.end((err, res) => {console.log(res);});
}
main();