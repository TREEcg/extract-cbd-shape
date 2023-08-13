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

    public extract (store: Store, id: Term, shapeId?:Term): Promise<Array<Quad>> {
        let extracted = [];
        return this.extractRecursively(store, id, shapeId?shapeId.value:null, extracted);
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

                let requiredProperties = currentXoneShapeItem.requiredProperties;

                let xoneShape:Shape;
                if (currentXoneShapeItem.nodeLinks.size > 0) {
                    xoneAdditionalShapes.nodeLinks = new Map([...Array.from(xoneAdditionalShapes.nodeLinks.entries()), ...Array.from(currentXoneShapeItem.nodeLinks.entries())]);
                }
                if (currentXoneShapeItem.xone.length > 0) {
                    xoneShape = await this.xoneListsToShapeWithoutXone(store, currentEntityId, currentXoneShapeItem);                    
                    requiredProperties = requiredProperties.concat(xoneShape.requiredProperties)
                }
                //If there’s a possible addition nodelist from the xoneShape, do add it - it doesn’t matter if it’s actually valid.
                if (xoneShape && xoneShape.nodeLinks.size > 0 ) {
                    xoneAdditionalShapes.nodeLinks = new Map([...Array.from(xoneAdditionalShapes.nodeLinks.entries()), ...Array.from(xoneShape.nodeLinks.entries())]);
                }

                for (let prop of requiredProperties) {
                    //Check if the property is set, if not, change the allSet to false and break out of this loop as this won’t be a match
                    if (store.getQuads(currentEntityId, prop, null, null).length === 0) {
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
                    for (let prop of xoneItem.requiredProperties.concat(xoneShape.requiredProperties)) {
                        //Check if the property is set, if not, change the allSet to false and break out of this loop as this won’t be a match
                        if (store.getQuads(currentEntityId, prop, null, null).length === 0) {
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
            xoneAdditionalShapes.requiredProperties = xoneAdditionalShapes.requiredProperties.concat(found.requiredProperties);
            
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
            //also process the resolved xone list of required properties.
            if (shape.xone.length > 0) {
                xoneShape = await this.xoneListsToShapeWithoutXone(store,id,shape);
            }
            for (let prop of shape.requiredProperties.concat(xoneShape.requiredProperties)) {
                if (store.getQuads(id, new NamedNode(prop), null, null).length === 0) {
                    //Need to do an extra HTTP request, probably want to log this somehow (TODO)
                    console.error('Dereferencing ' + id.value + " as required property " + prop + " wasn’t set");
                    await this.loadQuadStreamInStore(store, (await this.dereferencer.dereference(id.value)).data);
                    // Only do this once, because why would we do this more often?
                    break;
                }
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
            if (q.object instanceof BlankNode && !extracted.includes(q.object.value)) {
                if (shape && shape.nodeLinks) {
                    result = result.concat(await this.extractRecursively(store, q.object, shape.nodeLinks.get(q.predicate.value), extracted));
                } else {
                    result = result.concat(await this.extractRecursively(store, q.object, null, extracted));
                }
            }
            // 2. According to the shacl Shape, there are potentially deeper down properties to be found, so let’s go there if this property is one of them
            else if (q.object instanceof NamedNode && shape && shape.nodeLinks.get(q.predicate.value) && !extracted.includes(q.object)) {
                //Extract additional quads, and do extra HTTP request if needed (included in this extract script)
                let additionalQuads = await this.extractRecursively(store, q.object, shape.nodeLinks.get(q.predicate.value), extracted);
                result = result.concat(additionalQuads);
            } //Do the same for the result of the xone array
            else if (q.object instanceof NamedNode && xoneShape && xoneShape.nodeLinks.has(q.predicate.value) && !extracted.includes(q.object)) {
                //Extract additional quads, and do extra HTTP request if needed (included in this extract script)
                let additionalQuads = await this.extractRecursively(store, q.object, xoneShape.nodeLinks.get(q.predicate.value), extracted);
                result = result.concat(additionalQuads);
            }
        }
        //add the quads where the named graph matches the current id
        result = result.concat(store.getQuads(null,null,null,id));

        return result;
    }
}