import { assert } from "chai";
import {Store, NamedNode, Writer, Term, Parser, StreamParser} from "n3";
import {CBDShapeExtractor} from '../../lib/extract-cbd-shape';
import rdfDereference from 'rdf-dereference';

describe('Check whether a member from the MRG source can be fully extracted', function () {
    this.timeout(25000); 
    it('Extract a shape from MRG and check whether it successfully did a call to a geometry it needs', async () => {
        let shapeStore = new Store();
        let readStream = (await rdfDereference.dereference("./tests/02 - marine regions LDES/shacl.ttl", { localFiles: true })).data;
        await new Promise ((resolve, reject) => {
            shapeStore.import(readStream).on("end",resolve)
            .on("error", reject);
        });
        let extractor = new CBDShapeExtractor(shapeStore);
        let dataStore = new Store();
        let readStream2 = (await rdfDereference.dereference("./tests/02 - marine regions LDES/data.ttl", { localFiles: true })).data;
        await new Promise ((resolve, reject) => {
            dataStore.import(readStream2).on("end",resolve)
            .on("error", reject);
        });
        let result = await extractor.extract(dataStore, new NamedNode("http://marineregions.org/mrgid/24983?t=1690208097"), new NamedNode("http://example.org/shape"));
        //let writer = new Writer();
        //writer.addQuads(result);
        //writer.end((err, res) => {console.log(res);});
        assert.equal(result.filter((quad, index, array) => {
            return quad.subject.value === 'http://marineregions.org/mrgid/24983/geometries?source=110&attributeValue=2004';
        }).length, 2); // Test whether it actually did a call
    });
});