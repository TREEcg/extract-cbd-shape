import * as process from 'process';
import { CBDShapeExtractor } from '../lib/extract-cbd-shape';
import {Store, Writer, NamedNode} from 'n3';
import rdfDereference from 'rdf-dereference';

// Check if at least one command line argument is provided
if (process.argv.length <= 2) {
  console.error('Please provide an entity to describe in the first command line parameter, and optionally a shape IRI to fulfill, and a IRI');
  process.exit(1); // Exit with an error code
}
async function main () {
    // Get the command line parameter at index 2 (index 0 is the node executable and index 1 is the script file)
    const entity = process.argv[2];
    let shapeStore:Store = new Store();
    let shapeId = "";
    if (process.argv[3]) {
        //A shape type has been set!
        if(process.argv[3] === 'shape') {
            //Use our own shape extractor shape
            let readStream = (await rdfDereference.dereference("./extract-cbd-shape-ap.ttl", { localFiles: true })).data;
            await new Promise ((resolve, reject) => {
                shapeStore.import(readStream).on("end",resolve)
                .on("error", reject);
            });
            if (process.argv[4]) {
                shapeId = process.argv[4];
            } else {
                console.error("ShapeIRI needed as third argument");
                process.exit(1);
            }
        }
    }
    let extractor = new CBDShapeExtractor(shapeStore);
    console.error('Processing shape ' + shapeId + ' from this shape: ', extractor.shapesGraph);
    let writer = new Writer();
    let quads = await extractor.extract(new Store(), new NamedNode(entity), shapeId);
    writer.addQuads(quads);
    writer.end((err, res) => {console.log(res);});
}
main();