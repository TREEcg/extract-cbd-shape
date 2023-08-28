import rdfDereference, { RdfDereferencer } from "rdf-dereference";
import { EvaluatedOrShape, PathPattern, PredicateItem, Shape, ShapesGraph } from "./Shape";
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

    constructor (shapesGraphStore?:Store, dereferencer?: RdfDereferencer) {
        if (!dereferencer)
            this.dereferencer = rdfDereference;
        else
            this.dereferencer = dereferencer;
        
        //Pre-process shape
        if (shapesGraphStore)
            this.shapesGraph = new ShapesGraph(shapesGraphStore);
    }
    
    loadQuadStreamInStore(store, quadStream) {
        return new Promise((resolve, reject) => {
            store.import(quadStream).on("end", resolve).on("error", reject);
        });
    }

    /**
     * Extracts:
     *  * first level quads, 
     *  * their blank nodes with their quads (recursively),
     *  * all quads in the namedgraph of this entity,
     *  * all quads of required paths found in the shape
     *  * the same algorithm on top of all found node links
     * @param store The N3 Store loaded with a set of initial quads
     * @param id The entity to be described/extracted
     * @param shapeId The optional SHACL NodeShape identifier
     * @returns Promise of a quad array of the described entity
     */
    public async extract (store: Store, id: Term, shapeId?:Term): Promise<Array<Quad>> {
        let result = (await this.extractRecursively(store, id, shapeId?shapeId.value:null, []))
        .concat(store.getQuads(null,null,null,id));// also add the quads where the named graph matches the current id
        if (result.length === 0) {
            //Dereference and try again to extract them from the store
            console.error('Dereferencing ' + id.value + " as there were no quads found at all");
            await this.loadQuadStreamInStore(store, (await this.dereferencer.dereference(id.value)).data);
            result = (await this.extractRecursively(store, id, shapeId?shapeId.value:null, []))
                                .concat(store.getQuads(null,null,null,id));
        }
        //When returning the quad array, remove duplicate triples as CBD, required properties, etc. could have added multiple times the same triple
        return result.filter((value:Quad, index: number, array: Quad[]) => {
            return array.indexOf(value) === index;
        });
    }

    /**
     * Processes orLists:
     *  - per orList, it checks all items. For all items, it concatenates the nodelinks to one result: these are all possibilities that may be considered
     *  - per orList, it checks whether at least 1 match has been found based on the required properties. If not, an HTTP request should be triggered
     * @param store 
     * @param currentEntityId 
     * @param shape 
     * @returns A promise
     */
    private async orListsToShapeWithoutOrLists(store: Store, currentEntityId: Term, shape:Shape): Promise<EvaluatedOrShape> {
        let result: EvaluatedOrShape = new EvaluatedOrShape();
        //The variable checking whether all OrLists were valid
        let allOrListsValid = true;
        //Process all orLists
        for (let orList of shape.orLists) {
            //Check nodelists first and add them to the result
            let atLeastOne = false;
            for (let orItem of orList) {
                //If an orItem has an orList inside, process and flatten it again first
                let evaluatedOrShape = new EvaluatedOrShape();
                if (orItem.orLists.length > 0) {
                    evaluatedOrShape = await this.orListsToShapeWithoutOrLists(store, currentEntityId, orItem);
                }
                //Add all nodeLinks on a big pile in the results object /// TODO -- this can probably already be done beforehand and we only need to check requiredproperties?
                result.nodeLinks = result.nodeLinks.concat(orItem.nodeLinks).concat(evaluatedOrShape.nodeLinks);
                let allRequiredPathsSet = true;
                for (let requiredPath of orItem.requiredPaths) {
                    let matches = requiredPath.match(store, currentEntityId);
                    let match = matches.next();
                    //Check whether one or more exist
                    if (match.value) {
                        //Check if the property is set, if not, change the allRequiredPathsSet to false and break out of this loop as this won’t be a match
                        allRequiredPathsSet = false;
                        break;
                    }
                }
                //Now we need to check whether this orItem validates. This can be check based on what evaluatedOrShape gives us something and whether the required paths on this one work.
                if (!evaluatedOrShape.invalid && allRequiredPathsSet) {
                    atLeastOne = true;
                }
            }
            if (!atLeastOne) {
                allOrListsValid = false;
            }
        }
        if (!allOrListsValid)
            result.invalid = true;
        return result;
    }

    private async extractRecursively (store: Store, id: Term, shapeId:string, extracted: Array<string>): Promise<Array<Quad>> {
        //If it has already been extracted, don’t extract it again: prevents cycles
        if (extracted.includes(id.value)) {
            return [];
        }
        let dereferenced = false;
        extracted.push(id.value);
        let result: Quad[] = [];
        let shape: Shape;
        let orResultShape = new EvaluatedOrShape(); 
        //First, let’s check whether all required paths on this node are available. If not, we’re going to have to do an HTTP request to the current one
        if (shapeId && this.shapesGraph) {
            shape = this.shapesGraph.shapes.get(shapeId);
            let processedPaths : Array<PathPattern> = [];
            //Process the orlist
            if (shape.orLists.length > 0) {
                orResultShape = await this.orListsToShapeWithoutOrLists(store,id,shape);
                if (orResultShape.invalid && !dereferenced) {
                    console.error('Dereferencing ' + id.value + " as none of the OR or XONE conditions were met");
                    await this.loadQuadStreamInStore(store, (await this.dereferencer.dereference(id.value)).data);
                    //We will not retry the algorithm again, because the nodelinks are already processed as a whole anyway.
                    dereferenced = true;
                }
            }
            
            for (let path of shape.requiredPaths) {    
                let matches = path.match(store, id);
                let match = matches.next();
                if (!match.value && !dereferenced) { // apparently there are no (1 or more) matches at all with this required Path
                    //Need to do an extra HTTP request, probably want to log this somehow (TODO)
                    console.error('Dereferencing ' + id.value + " as required path " + path + " wasn’t set");
                    await this.loadQuadStreamInStore(store, (await this.dereferencer.dereference(id.value)).data);
                    //recheck all matches now
                    matches = path.match(store, id);
                    match = matches.next();
                    // Only do this once, because why would we do this more often?
                    dereferenced = true;
                } 
                if (match.value && !(path.pathItems.length === 1 && path.pathItems[0] instanceof PredicateItem)){
                    //Only adds the found quads to the result if it’s not a predicate path, because these are going to be found by CBD (next step) anyway
                    // And don’t add the first quad because this quad is going to be certainly found by CBD as well
                    match.value.shift();
                    result = result.concat(match.value); //should we remove blank nodes, as these are also going to be found by CBD?
                    // And do this for all matches that were found
                    while (!match.done) {
                        match.value.shift();
                        result = result.concat(match.value);
                        match = matches.next();
                    }
                }
                processedPaths.push(path);
            }
            //Next, let’s find all nodelinks, and add all paths that are not going to be found by CBD, and process them again with this algorithm.
            for (let nodeLink of shape.nodeLinks.concat(orResultShape.nodeLinks)) {
                //Find all matches with the path
                let matches = nodeLink.pathPattern.match(store, id);
                let match = matches.next();
                while (!match.done) {
                    //Follow the nodelink → of the match of course
                    let nodeLinkPathQuads: Array<Quad> = match.value;
                    //If the found object in the path is a namednode, let’s do the extract recursively again
                    let object = nodeLinkPathQuads[nodeLinkPathQuads.length-1].object;
                    //Only check namednodes: blank nodes are already further checked anyway
                    result = result.concat(await this.extractRecursively(store, object, nodeLink.link, extracted));
                    if (!(nodeLink.pathPattern.pathItems.length === 1 && nodeLink.pathPattern.pathItems[0] instanceof PredicateItem)) {
                        nodeLinkPathQuads.shift()
                        result.concat(nodeLinkPathQuads);
                    }
                    match = matches.next();
                }
            }
        }

        //Now, just perform CBD and we’re done
        const quads = store.getQuads(id,null,null,null);
        //Iterate over the quads, add them to the result and check whether we should further get other quads based on blank nodes or the SHACL shape
        for (const q of quads) {
            result.push(q);
            // Conditionally get more quads: if it’s a not yet extracted blank node
            if (q.object instanceof BlankNode && !extracted.includes(q.object.value)) {
                result = result.concat(await this.extractRecursively(store, q.object, null, extracted));
                extracted.push(q.object);
            }
        }

        return result;
    }
}