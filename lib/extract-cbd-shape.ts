import rdfDereference, { RdfDereferencer } from "rdf-dereference";
import { Shape, ShapesGraph } from "./Shape";
import { Store, NamedNode, Quad, Term, BlankNode} from "n3";

/**
* Usage:
*  import {ShapeExtractor} from "extract-cbd-shape";
*  ...
*  let shapeExtractor = new ShapeExtractor(shape, dereferencer);
*  let entityquads = await shapeExtractor.extract(store, entity);
*/
export class CBDShapeExtractor {
    dereferencer: RdfDereferencer;
    shapesGraph: ShapesGraph;
    extracted : Array<string>;

    constructor (shapesGraphStore?:Store, dereferencer?: RdfDereferencer) {
        if (!dereferencer)
            this.dereferencer = rdfDereference;
        else
            this.dereferencer = dereferencer;
        
        this.extracted = [];
        //Pre-process shape
        if (shapesGraphStore)
            this.shapesGraph = new ShapesGraph(shapesGraphStore);
    }
    
    loadQuadStreamInStore(store, quadStream) {
        return new Promise((resolve, reject) => {
            store.import(quadStream).on("end", resolve).on("error", reject);
        });
    }

    public extract (store: Store, id: Term, shapeId?:Term): Promise<Array<Quad>> {
        this.extracted = [];
        return this.extractRecursively(store, id, shapeId);
    }

    private async extractRecursively (store: Store, id: Term, shapeId?:Term): Promise<Array<Quad>> {
        //If it has already been extracted, don’t extract it again: prevents cycles
        if (this.extracted.includes(id.value)) {
            return [];
        }

        this.extracted.push(id.value);
        let result: Quad[] = [];
        let shape: Shape;
        if (shapeId && this.shapesGraph) {
            shape = this.shapesGraph.shapes.get(shapeId.value);
            for (let prop of shape.requiredProperties) {
                if (store.getQuads(id, new NamedNode(prop), null, null).length === 0) {
                    //Need to do an extra HTTP request, probably want to log this somehow (TODO)
                    console.error('Dereferencing ' + id.value);
                    await this.loadQuadStreamInStore(store, (await this.dereferencer.dereference(id.value)).data);
                }
            }
            for (let xoneList of shape.xone) {
                //TODO: process xone’s items!
                //for (xoneItem of )
            }
            //look up all inverse properties and add them to the result
            for (let inverseProperty of shape.inverseProperties) {
                store.getQuads(null, inverseProperty, id);   
            }
        }
        const quads = store.getQuads(id,null,null,null);
        //Iterate over the quads, add them to the result and check whether we should further get other quads based on blank nodes or the SHACL shape
        for (const q of quads) {
            result.push(q);
            // Conditionally get more quads
            // 1. CBD: always further explore blanknodes, but mind that when you further explore a blank node, also take into account the shape again of following that node if it exist
            //console.log("Processing: ", q)
            if (q.object instanceof BlankNode && !this.extracted.includes(q.object.value)) {
                if (shape && shape.nodeLinks) {
                    result = result.concat(await this.extractRecursively(store, q.object, shape.nodeLinks.get(q.predicate.value)));
                } else {
                    result = result.concat(await this.extractRecursively(store, q.object));
                }
            }
            // 2. According to the shacl Shape, there are potentially deeper down properties to be found, so let’s go there if this property is one of them
            else if (q.object instanceof NamedNode && shape && shape.nodeLinks.get(q.predicate.value) && !this.extracted.includes(q.object)) {
                //Extract additional quads, and do extra HTTP request if needed (included in this extract script)
                let additionalQuads = await this.extractRecursively(store, q.object, shape.nodeLinks.get(q.predicate.value));
                result = result.concat(additionalQuads);
            }
        }
        //add the quads where the named graph matches the current id
        result = result.concat(store.getQuads(null,null,null,id));

        return result;
    }
}