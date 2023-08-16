import { assert } from "chai";
import {Store, NamedNode, Writer, Term, Parser, StreamParser} from "n3";
import {CBDShapeExtractor} from '../../lib/extract-cbd-shape';
import rdfDereference from 'rdf-dereference';

describe('Check whether paths trigger the right extraction process', function () {
    this.timeout(25000); 

    let shapeStore = new Store();
    let extractor;
    let dataStore = new Store();
    before(async () => {
        let readStream = (await rdfDereference.dereference("./tests/05 - paths/shape.ttl", { localFiles: true })).data;
        await new Promise ((resolve, reject) => {
            shapeStore.import(readStream).on("end",resolve)
            .on("error", reject);
        });
        extractor = new CBDShapeExtractor(shapeStore);
        let readStream2 = (await rdfDereference.dereference("./tests/05 - paths/data.ttl", { localFiles: true })).data;
        await new Promise ((resolve, reject) => {
            dataStore.import(readStream2).on("end",resolve)
                                        .on("error", reject);
        });
    })
    it("Test an inverse path", async () => {
        let result = await extractor.extract(dataStore, new NamedNode("http://example.org/C"), new NamedNode("http://example.org/InversePathShape"));
        //let writer = new Writer();
        //writer.addQuads(result);
        //writer.end((err, res) => {console.log(res);});
        assert.equal(result.length, 1);
    })
});