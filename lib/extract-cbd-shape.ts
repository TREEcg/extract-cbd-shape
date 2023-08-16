import rdfDereference, { RdfDereferencer } from "rdf-dereference";
import { PathPattern, PredicateItem, Shape, ShapesGraph } from "./Shape";
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
        let extracted = [];
        let result = (await this.extractRecursively(store, id, shapeId?shapeId.value:null, extracted))
        .concat(store.getQuads(null,null,null,id));// also add the quads where the named graph matches the current id
        if (result.length === 0) {
            //Dereference and try again to extract them from the store
            console.error('Dereferencing ' + id.value + " as there were no quads found at all");
            await this.loadQuadStreamInStore(store, (await this.dereferencer.dereference(id.value)).data);
            result = (await this.extractRecursively(store, id, shapeId?shapeId.value:null, extracted))
                                .concat(store.getQuads(null,null,null,id));
        }
        //When returning the quad array, remove duplicate triples as CBD, required properties, etc. could have added multiple times the same triple
        return result.filter((value:Quad, index: number, array: Quad[]) => {
            return array.indexOf(value) === index;
        });
    }

    /**
     * Proccesses all xone lists on top of a shape while processing an entity, and simplifies this to a single set of required properties and nodelinks
     * @param store 
     * @param currentEntityId 
     * @param shape 
     * @returns 
     */
    private async xoneListsToShapeWithoutXone(store: Store, currentEntityId: Term, shape:Shape): Promise<Shape> {
        let xoneAdditionalShapes: Shape = new Shape();

        //Process all exclusively one arrays given, and check whether the requiredproperties is fullfilled
        for (let xoneList of shape.xone) {
            //First iteration: check if at least one is set
            let found: Shape;
            for (let currentXoneShapeItem of xoneList) {
                //Loop through requiredProperties to check whether they are set. If at least one is not set, mark this iteration as false.
                let allSet = true;
                // Also check whether there are even more xoneLists in it and process these as well.

                let requiredPaths = currentXoneShapeItem.requiredPaths;

                let xoneShape:Shape;
                if (currentXoneShapeItem.nodeLinks.length > 0) {
                    xoneAdditionalShapes.nodeLinks = xoneAdditionalShapes.nodeLinks.concat(currentXoneShapeItem.nodeLinks);
                }
                if (currentXoneShapeItem.xone.length > 0) {
                    xoneShape = await this.xoneListsToShapeWithoutXone(store, currentEntityId, currentXoneShapeItem);                    
                    requiredPaths = requiredPaths.concat(xoneShape.requiredPaths)
                }
                //If there’s a possible addition nodelist from the xoneShape, do add it - it doesn’t matter if it’s actually valid.
                if (xoneShape && xoneShape.nodeLinks.length > 0 ) {
                    xoneAdditionalShapes.nodeLinks = xoneAdditionalShapes.nodeLinks.concat(xoneShape.nodeLinks);
                }

                for (let path of requiredPaths) {
                    let matches = path.match(store, currentEntityId);
                    let match = matches.next();
                    if (match.done) {
                        //Check if the property is set, if not, change the allSet to false and break out of this loop as this won’t be a match
                        allSet = false;
                        break;
                    }
                }
                if (allSet) {
                    //This is the one! We can break out of the loop and set this as the XONE option without having to dereference anything else
                    found = currentXoneShapeItem;
                    break;
                }
            }
            if (!found) {
                //We didn’t find a solution earlier... We need to do an HTTP request to the current id, and retry finding it. If nothing works then, then so be it
                console.error('Dereferencing ' + currentEntityId.value + " when resolving a XONE condition");
                await this.loadQuadStreamInStore(store, (await this.dereferencer.dereference(currentEntityId.value)).data);
                for (let xoneItem of xoneList) {
                    let allSet = true;
                    let xoneShape:Shape = await this.xoneListsToShapeWithoutXone(store, currentEntityId, xoneItem);
                    for (let path of xoneItem.requiredPaths.concat(xoneShape.requiredPaths)) {
                        let matches = path.match(store, currentEntityId);
                        let match = matches.next();
                        if (match.done) {
                            //Check if the property is set, if not, change the allSet to false and break out of this loop as this won’t be a match
                            allSet = false;
                            break;
                        } 
                    }
                    if (allSet) {
                        //This is the one! We can break out of the loop and set this as the XONE option without having to dereference anything else
                        found = xoneItem;
                        break;
                    }
                }
            }
            //We did or did not find a solution after fetching the shape Merge the requiredproperties
            //xoneAdditionalShapes.nodeLinks = xoneAdditionalShapes.nodeLinks.(found.nodeLinks)
            xoneAdditionalShapes.requiredPaths = xoneAdditionalShapes.requiredPaths.concat(found.requiredPaths);
            
        }
        return xoneAdditionalShapes;
    }

    private async extractRecursively (store: Store, id: Term, shapeId:string, extracted: Array<string>): Promise<Array<Quad>> {
        //If it has already been extracted, don’t extract it again: prevents cycles
        if (extracted.includes(id.value)) {
            return [];
        }

        extracted.push(id.value);
        let result: Quad[] = [];
        let shape: Shape;
        let xoneShape: Shape = new Shape(); 
        //First, let’s check whether all required properties on this node are available. If not, we’re going to have to do an HTTP request to the current one
        if (shapeId && this.shapesGraph) {
            shape = this.shapesGraph.shapes.get(shapeId);
            let processedPaths : Array<PathPattern> = [];
            //also process the resolved xone list of required properties.
            if (shape.xone.length > 0) {
                xoneShape = await this.xoneListsToShapeWithoutXone(store,id,shape);
            }
            for (let path of shape.requiredPaths.concat(xoneShape.requiredPaths)) {
                
                let matches = path.match(store, id);
                let match = matches.next();
                if (match.done) { // apparently there are no (1 or more) matches at all with this required Path
                    //Need to do an extra HTTP request, probably want to log this somehow (TODO)
                    console.error('Dereferencing ' + id.value + " as required path " + path + " wasn’t set");
                    await this.loadQuadStreamInStore(store, (await this.dereferencer.dereference(id.value)).data);
                    // Only do this once, because why would we do this more often?
                    break;
                } else if (!(path.pathItems.length === 1 && path.pathItems[0] instanceof PredicateItem)){
                    //Only adds the found quads to the result if it’s not a predicate path, because these are going to be found by CBD (next step) anyway
                    // And don’t add the first quad because this quad is going to be certainly found by CBD as well
                    result = result.concat(match.value.shift()); //should we remove blank nodes, as these are also going to be found by CBD?
                    // And do this for all matches that were found
                    while (!match.done) {
                        result = result.concat(match.value.shift());
                        match = matches.next();
                    }
                }
                processedPaths.push(path);
            }
            //Next, let’s find all nodelinks, and add all paths that are not going to be found by CBD, and process them again with this algorithm.
            for (let nodeLink of shape.nodeLinks.concat(xoneShape.nodeLinks)) {
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
                        result.concat(nodeLinkPathQuads.shift());
                    }
                    match = matches.next();
                }
            }
        }

        //Now, just perform CBD now and we’re done
        const quads = store.getQuads(id,null,null,null);
        //Iterate over the quads, add them to the result and check whether we should further get other quads based on blank nodes or the SHACL shape
        for (const q of quads) {
            result.push(q);
            // Conditionally get more quads
            // 1. CBD: always further explore blanknodes, but mind that when you further explore a blank node, also take into account the shape again of following that node if it exist
            //console.log("Processing: ", q)
            if (q.object instanceof BlankNode && !extracted.includes(q.object.value)) {
                //if (shape && shape.nodeLinks) {
                //    result = result.concat(await this.extractRecursively(store, q.object, shape.nodeLinks.get(q.predicate.value), extracted));
                //} else {
                    result = result.concat(await this.extractRecursively(store, q.object, null, extracted));
                //}
            }
            // 2. According to the shacl Shape, there are potentially deeper down properties to be found, so let’s go there if this property is one of them
            /*else if (q.object instanceof NamedNode && shape && shape.nodeLinks.get(q.predicate.value) && !extracted.includes(q.object)) {
                //Extract additional quads, and do extra HTTP request if needed (included in this extract script)
                let additionalQuads = await this.extractRecursively(store, q.object, shape.nodeLinks.get(q.predicate.value), extracted);
                result = result.concat(additionalQuads);
            } //Do the same for the result of the xone array
            else if (q.object instanceof NamedNode && xoneShape && xoneShape.nodeLinks.has(q.predicate.value) && !extracted.includes(q.object)) {
                //Extract additional quads, and do extra HTTP request if needed (included in this extract script)
                let additionalQuads = await this.extractRecursively(store, q.object, xoneShape.nodeLinks.get(q.predicate.value), extracted);
                result = result.concat(additionalQuads);
            }*/
        }

        return result;
    }
}