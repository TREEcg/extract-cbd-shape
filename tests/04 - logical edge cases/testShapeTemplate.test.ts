import { assert } from "chai";
import {Store, NamedNode, Writer, Term, Parser, StreamParser} from "n3";
import {Shape, ShapesGraph} from '../../lib/Shape';
import rdfDereference from 'rdf-dereference';

describe('Test shape template of the logical edge cases', function () {
    let shapeStore = new Store();
    let shapesGraph: ShapesGraph;
    before(async () => {
        let readStream = (await rdfDereference.dereference("./tests/04 - logical edge cases/shape.ttl", { localFiles: true })).data;
        await new Promise ((resolve, reject) => {
            shapeStore.import(readStream).on("end",resolve)
            .on("error", reject);
        });
        shapesGraph = new ShapesGraph(shapeStore);
        
    })
    it("Check whether a circular Xone shape works", async () => {
        console.log(shapesGraph.shapes.get('http://example.org/CircularXoneShape').xone.flat(10));//.xone[0][0].xone[0][0]);
        assert(shapesGraph.shapes.get('http://example.org/TriggersHTTPShape').xone[0][0].xone[0][0].nodeLinks.size > 0);
    })
    it("Check whether the XONE condition works 2 levels deep", async () => {
        console.log(shapesGraph.shapes.get('http://example.org/TriggersHTTPShape').xone[0][0].xone.flat(10));//.xone[0][0].xone[0][0]);
        assert(shapesGraph.shapes.get('http://example.org/TriggersHTTPShape').xone[0][0].xone[0][0].nodeLinks.size > 0);
    })
});