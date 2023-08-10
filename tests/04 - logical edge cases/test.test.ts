import { assert } from "chai";
import {Store, NamedNode, Writer, Term, Parser, StreamParser} from "n3";
import {CBDShapeExtractor} from '../../lib/extract-cbd-shape';
import rdfDereference from 'rdf-dereference';

describe('Tests whether plain CBD works using the data from 01 and 02', function () {
    let shapeStore = new Store();
    let extractor;
    let dataStore = new Store();
    before(async () => {
        let readStream = (await rdfDereference.dereference("./tests/04 - logical edge cases/shape.ttl", { localFiles: true })).data;
        await new Promise ((resolve, reject) => {
            shapeStore.import(readStream).on("end",resolve)
            .on("error", reject);
        });
        extractor = new CBDShapeExtractor(shapeStore);
        let readStream2 = (await rdfDereference.dereference("./tests/04 - logical edge cases/data.ttl", { localFiles: true })).data;
        await new Promise ((resolve, reject) => {
            dataStore.import(readStream2).on("end",resolve)
                                        .on("error", reject);
        });
    })
    it("Check whether the OR condition works - and check with recursion", async () => {
        let result = await extractor.extract(dataStore, new NamedNode("http://example.org/Person1"), new NamedNode("http://example.org/Shape"));
        console.log(extractor.shapesGraph)
        //let writer = new Writer();
        //writer.addQuads(result);
        //writer.end((err, res) => {console.log(res);});
        assert.equal(result.length, 7);
    })
    it("Check whether the OR condition works a second time as well", async () => {
        let result = await extractor.extract(dataStore, new NamedNode("http://example.org/Person2"), new NamedNode("http://example.org/PersonShape"));
        //let writer = new Writer();
        //writer.addQuads(result);
        //writer.end((err, res) => {console.log(res);});
        assert.equal(result.length, 7);
    })
    it("Check whether it does an HTTP request if it doesn’t find the required properties on a node", async () => {
        let result = await extractor.extract(dataStore, new NamedNode("http://example.org/Person3"), new NamedNode("http://example.org/KnowsPieterShape"));
        //let writer = new Writer();
        //writer.addQuads(result);
        //writer.end((err, res) => {console.log(res);});
        assert.equal(result.length, 43); // This count might be tricky as a test as my profile is of course able to change... TODO: change to an archived test case ttl
    })
});