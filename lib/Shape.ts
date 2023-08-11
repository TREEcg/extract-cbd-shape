import { NamedNode, Quad, Store, Term, BlankNode } from "n3";

export class Property {   
    node?: Shape;
    constructor() {
    }
}

export class Shape {
    nodeLinks: Map<string, string>;
    requiredProperties: Array<string> ;
    xone: Array<Array<Shape>>; //the first match, then stop
    inverseProperties : Array<string> ;
    constructor () {
        //All properties will be added, but if a required property is not available, then we need to further look it up
        this.requiredProperties = [];
        //If there’s a nodelink through one of the properties, I want to know what other shape to look up in the shapesgraph from there
        this.nodeLinks = new Map();
        this.xone = [];
        this.inverseProperties = [] ;
    }
}

export class ShapesGraph {

    shapes: Map<string, Shape>;

    constructor (shapeStore: Store) {
        this.shapes = this.initializeFromStore(shapeStore);
    }

    /**
     * 
     * @param shapeStore 
     * @param propertyShapeId 
     * @param shape 
     * @returns false if it wasn’t a property shape
     */
    protected preprocessPropertyShape(shapeStore: Store, propertyShapeId: Term, shape: Shape, required? : boolean): boolean {
        //Skip if shape has been deactivated
        let deactivated = shapeStore.getObjects(propertyShapeId, "http://www.w3.org/ns/shacl#deactivated");
        if (deactivated.length > 0 && deactivated[0].value === "true") {
            return true; //Success: doesn’t matter what kind of thing it was, it’s deactivated so let’s just proceed
        }

        let propertyId:string;
        let path = shapeStore.getObjects(propertyShapeId, 'http://www.w3.org/ns/shacl#path')[0];
        //check the path now to see whether we should add it on this level, or on a deeper or higher level.
        if (path) {
            //Only support predicate paths for now TODO
            let pathArray = this.rdfListToArray(shapeStore, path);
            if (pathArray.length > 1) {
                console.error("Sequence or other paths not yet supported");
            } else {
                propertyId = pathArray[0].value;
            }
        
            let minCount = shapeStore.getObjects(propertyShapeId, "http://www.w3.org/ns/shacl#minCount");

            if ((minCount[0] && minCount[0].value !== "0") || required) {
                shape.requiredProperties.push(propertyId);
            }
            // TODO: will the sh:or, sh:xone, sh:and, etc. be of use here? It won’t contain any more information about possible properties?
            // Maybe to potentially point to another node, xone a datatype?

            // Does it link to a literal or to a new node?
            let nodeLink = shapeStore.getObjects(propertyShapeId, 'http://www.w3.org/ns/shacl#node');
            if (nodeLink[0]) {
                shape.nodeLinks.set(propertyId, nodeLink[0]);
                //TODO: Nodelinks in conditionals?
            }
            return true; // Success: the property shape has been processed
            
        } 
        return false; //This wasn’t a property shape
    /**
     * {
        let i : number = 0;
        let sequence = false;
        let inverse = false;
        let alternative = false;
        let zeroOrOne = false;
        while (i < prop["http://www.w3.org/ns/shacl#path"].length ) {
            let pathPart =  prop["http://www.w3.org/ns/shacl#path"][i];
            if (pathPart['@id'] === "http://www.w3.org/ns/shacl#inversePath") {
                inverse = true;
                console.error('NY Implemented: inverse path detected!');
            } else if (pathPart['@id'] === "http://www.w3.org/ns/shacl#alternativePath") {
                alternative = true;
                console.error('NY Implemented: alternative path detected!');
            } else if (pathPart['@id'] === "http://www.w3.org/ns/shacl#zeroOrOnePath") {
                zeroOrOne = true;
                console.error('NY Implemented: zero or one path detected!');
            } else if (pathPart['@id'] === "http://www.w3.org/ns/shacl#zeroOrMorePath" || pathPart['@id'] === "http://www.w3.org/ns/shacl#oneOrMorePath") {
                console.error('We will not support one or more paths or zero or More paths at this time');
            } else { 
                // Only possibilities left: a predicate path, a sequence path, or a blank node indicating something else
                if (i === length-1 ) {
                    //check whether previous flags have been set
                    if (sequence) {

                    }
                    if (inverse) {

                    }
                    if (alternative) {

                    }
                    if (zeroOrOne) {

                    }
                    this.properties.set(new NamedNode(pathPart["@id"]), prop);
                } else {
                    //Create a new property if it does not yet exist, with a node link to another shape
                    sequence = true;
                    this.properties.set(new NamedNode(pathPart["@id"]), new Property());
                }
            }
            i++;
        }
        */

        
    }

    preprocessShape(shapeStore: Store, shapeId: string, shape: Shape) {
        return this.preprocessPropertyShape(shapeStore, shapeId, shape)?true: this.preprocessNodeShape(shapeStore, shapeId, shape);
    }

    protected preprocessNodeShape(shapeStore: Store, nodeShapeId: string, shape: Shape) {
            //Should we process sh:targetObjectsOf? This could be a hint that there is a possible non-required inverse property? Or should we only interpret this for target selection and of no value to triple selection?
            /*let targetObjectsOfArray = shapeStore.getObjects(shapeId, "http://www.w3.org/ns/shacl#targetObjectsOf");
            for (let tOF of targetObjectsOfArray) {
                shape.inverseProperties.push(tOF.value);
            }*/
            //Answer: no, we won’t

            //Process properties if it has any
            let properties = shapeStore.getObjects(nodeShapeId, "http://www.w3.org/ns/shacl#property");
            for (let prop of properties) {
                this.preprocessPropertyShape(shapeStore, prop, shape);
            }

            //process sh:and and sh:or on shapeId: just add all IDs to this array

            // Process everything you can find nested in AND or OR clauses
            // Reason why we must process OR and AND in the same way for discovery is provided in the README.md
            for (let andList of shapeStore.getObjects(nodeShapeId, "http://www.w3.org/ns/shacl#and").concat( shapeStore.getObjects(nodeShapeId, "http://www.w3.org/ns/shacl#or"))) {
                // Try to process it as a property shape
                //for every andList found, iterate through it and try to preprocess the property shape, if doesn’t work, preprocess as a nodeshape again
                for (let and of this.rdfListToArray(shapeStore, andList)) {
                    let success = this.preprocessPropertyShape(shapeStore, andList, shape);
                    if (!success) {
                        //This wasn’t a property shape:
                        // - now it can possibly again be a nodeshape, and then it means that nodeshape needs to also be processed every time this one is encountered. I’d add all required properties here as well.
                        // - it can also be a nested or/and/xone-clause → then the preprocessNodeShape just needs to be called again on this one ( x AND ( Y AND Z ) <=> x and Y and Z)
                        this.preprocessNodeShape(shapeStore, and, shape);
                    }
                }
                
            }
            
            //TODO: XONE
            //This or can refer to: properties or a nodeshape. If it refers to a nodeshape, then that nodeshape must be merged with this one.
            //process sh:xone on shapeId
            for (let xoneList of shapeStore.getObjects(nodeShapeId, "http://www.w3.org/ns/shacl#xone")) {
                shape.xone.push(this.rdfListToArray(shapeStore, xoneList).map((val): Shape => {
                        let newShape = new Shape();
                        this.preprocessShape(shapeStore, val, newShape);
                        //Add this one to the shapesgraph
                        return newShape;
                    }));
                console.log(shape.xone);
            }
            //And finally, we’re just ignoring sh:not. Don’t process this one
    }

    /**
     * 
     * @param nodeShape is an N3.Store with the quads of the SHACL shape
     */
    initializeFromStore (shapeStore: Store): Map<NamedNode, Shape> {
        //get all named nodes of entities that are sh:ShapeNodes which we’ll recognize through their use of sh:property (we’ll find other relevant shape nodes later on)
        //TODO: This is a limitation though: we only support NodeShapes with at least one sh:property set? Other NodeShapes in this context are otherwise just meaningless?
        const shapeNodes = shapeStore.getSubjects("http://www.w3.org/ns/shacl#property")
                                .concat(shapeStore.getSubjects("http://www.w3.org/1999/02/22-rdf-syntax-ns#type", "http://www.w3.org/ns/shacl#NodeShape")
                                .concat(shapeStore.getObjects(null, "http://www.w3.org/ns/shacl#node")))
                                //just keep the string
                                .map((value: Term) => { return value.value})
                                //DISTINCT
                                .filter((value: Term, index: number, array: Array<Term>) => {return array.indexOf(value) === index;});
        let shapes = new Map();
        for (let shapeId of shapeNodes) {
            let shape = new Shape();
            //Don’t process if shape is deactivated
            let deactivated = shapeStore.getObjects(shapeId, "http://www.w3.org/ns/shacl#deactivated");
            if (!(deactivated.length > 0 && deactivated[0].value === "true")) {
                this.preprocessNodeShape(shapeStore, shapeId, shape);
                shapes.set(shapeId, shape);
            }
        }
        return shapes;
    }

    /**
     * Processes all element from an RDF List, or detects it wasn’t a list after all and it’s just one element.
     * @param shapeStore 
     * @param item 
     * @returns 
     */
    protected * rdfListToGenerator(shapeStore: Store, item: Term): Generator<Term> {
        if (shapeStore.getObjects(item, "http://www.w3.org/1999/02/22-rdf-syntax-ns#first")[0]) {
            yield shapeStore.getObjects(item, "http://www.w3.org/1999/02/22-rdf-syntax-ns#first")[0];
            let rest = shapeStore.getObjects(item, "http://www.w3.org/1999/02/22-rdf-syntax-ns#rest")[0];
            while (rest && rest.value !== 'http://www.w3.org/1999/02/22-rdf-syntax-ns#nil') {
                yield shapeStore.getObjects(rest, "http://www.w3.org/1999/02/22-rdf-syntax-ns#first")[0];
                rest = shapeStore.getObjects(rest, "http://www.w3.org/1999/02/22-rdf-syntax-ns#rest")[0];
            }
        } else {
            //it’s not a list, it’s just one element
            yield item;
        }
        return;
    }

    protected rdfListToArray(shapeStore: Store, item: Term): Array<Term> {
        return Array.from(this.rdfListToGenerator(shapeStore,item));
    }

}