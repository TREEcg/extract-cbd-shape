import { assert } from "chai";
import {Store, NamedNode, Writer, Term, Parser, StreamParser} from "n3";
import {CBDShapeExtractor} from '../../lib/extract-cbd-shape';
import rdfDereference from 'rdf-dereference';

describe('Tests whether plain CBD works using the data from 01 and 02', function () {
    it('Example 01 should return 11 triples with CBD', async () => {
        let extractor = new CBDShapeExtractor();
        let dataStore = new Store();
        let readStream = (await rdfDereference.dereference("./tests/01\ -\ fetching\ a\ shacl\ shape/shacl-catalog.ttl", { localFiles: true })).data;
        await new Promise ((resolve, reject) => {
            dataStore.import(readStream).on("end",resolve)
            .on("error", reject);
        });
        let result = await extractor.extract(dataStore, new NamedNode("http://example.org/PersonShape"));
        //let writer = new Writer();
        //writer.addQuads(result);
        //writer.end((err, res) => {console.log(res);});
        assert.equal(result.length, 11); // Only this many triples are given using plain CBD
    });
    it('Example 02 should return 2 triples with CBD', async () => {
        let extractor = new CBDShapeExtractor();
        let dataStore = new Store();
        let readStream = (await rdfDereference.dereference("./tests/02 - marine regions LDES/data.ttl", { localFiles: true })).data;
        await new Promise ((resolve, reject) => {
            dataStore.import(readStream).on("end",resolve)
            .on("error", reject);
        });
        let result = await extractor.extract(dataStore, new NamedNode("http://marineregions.org/mrgid/24983?t=1690208097"));
        //let writer = new Writer();
        //writer.addQuads(result);
        //writer.end((err, res) => {console.log(res);});
        assert.equal(result.length, 2); // Only this many triples are given using plain CBD
    });
});

describe('Test CBD with nested blank nodes', async () => {
    it('Should be able to process nested blank nodes', async () => {
        let extractor = new CBDShapeExtractor();
        let dataStore = new Store();
        let readStream = (await rdfDereference.dereference("./tests/03 - CBD tests without a shape/data.ttl", { localFiles: true })).data;
        await new Promise ((resolve, reject) => {
            dataStore.import(readStream).on("end",resolve)
            .on("error", reject);
        });
        let result = await extractor.extract(dataStore, new NamedNode("http://example.org/A"));
//        let writer = new Writer();
//        writer.addQuads(result);
//        writer.end((err, res) => {console.log(res);});
        assert.equal(result.length, 4); // Only this many triples are given using plain CBD
    });
});

describe('Test CBD with named graph', () => {

    it('Should retrieve all triples within a graph', async () => {
        let extractor = new CBDShapeExtractor();
        let dataStore = new Store();
        let readStream = (await rdfDereference.dereference("./tests/03 - CBD tests without a shape/data.ttl", { localFiles: true })).data;
        await new Promise ((resolve, reject) => {
            dataStore.import(readStream).on("end",resolve)
            .on("error", reject);
        });
        let result = await extractor.extract(dataStore, new NamedNode("http://example.org/C"));
        let writer = new Writer();
        //writer.addQuads(result);
        //writer.end((err, res) => {console.log(res);});
        //assert.equal(result.length, 4); // Only this many triples are given using plain CBD
    })
    it('Should retrieve all triples within a graph and combine it with the triples found from CBD', async () => {
        let extractor = new CBDShapeExtractor();
        let dataStore = new Store();
        let readStream = (await rdfDereference.dereference("./tests/03 - CBD tests without a shape/data.ttl", { localFiles: true })).data;
        await new Promise ((resolve, reject) => {
            dataStore.import(readStream).on("end",resolve)
            .on("error", reject);
        });
        let result = await extractor.extract(dataStore, new NamedNode("http://example.org/B"));
        //let writer = new Writer();
        //writer.addQuads(result);
        //writer.end((err, res) => {console.log(res);});
        assert.equal(result.length, 8); // Only this many triples are given using plain CBD
    })
});