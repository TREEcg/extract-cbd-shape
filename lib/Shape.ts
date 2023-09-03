import { NamedNode, Quad, Store, Term, BlankNode } from "n3";
import { AlternativePathItem, InversePathItem, OneOrMorePathItem, PathItem, PathPattern, PredicateItem, ZeroOrMorePathItem, ZeroOrOnePathItem } from "./Path";

//TODO: split this file up between Shape functionality and SHACL to our Shape class conversion steps. Also introduce a ShEx to Shape Template
export class NodeLink {
    public pathPattern : PathPattern;
    public link: string;
    constructor (pathPattern: PathPattern, link: string) {
        this.pathPattern = pathPattern;
        this.link = link;
    }
}

export class Shape {
    closed: boolean;
    nodeLinks: Array<NodeLink>;
    requiredPaths: Array<PathPattern> ;
    optionalPaths: Array<PathPattern>;
    atLeastOneLists: Array<Array<Shape>>;
    constructor () {
        //All properties will be added, but if a required property is not available, then we need to further look it up
        this.requiredPaths = [];
        //If there’s a nodelink through one of the properties, I want to know what other shape to look up in the shapesgraph from there
        this.nodeLinks = [];
        this.atLeastOneLists = [];
        this.optionalPaths = [];
        this.closed = false; //default value
    }
}

export class ShapesGraph {
    
    shapes: Map<string, Shape>;
    
    constructor (shapeStore: Store) {
        this.shapes = this.initializeFromStore(shapeStore);
    }
    
    protected constructPathPattern(shapeStore: Store, pathNode: Term): PathPattern {
        let listArray = this.rdfListToArray(shapeStore, pathNode);
        let result:PathItem[] = [];
        for (let listItem of listArray) {
            let p: PathItem;
            if (listItem instanceof BlankNode) {
                //Look for special types
                let zeroOrMorePathObjects = shapeStore.getObjects(listItem, "http://www.w3.org/ns/shacl#zeroOrMorePath");
                let oneOrMorePathObjects = shapeStore.getObjects(listItem, "http://www.w3.org/ns/shacl#oneOrMorePath");
                let zeroOrOnePathObjects = shapeStore.getObjects(listItem, "http://www.w3.org/ns/shacl#zeroOrOnePath");
                let inversePathObjects = shapeStore.getObjects(listItem, "http://www.w3.org/ns/shacl#inversePath");
                let alternativePathObjects = shapeStore.getObjects(listItem, "http://www.w3.org/ns/shacl#alternativePath");
                if (zeroOrMorePathObjects[0]) {
                    p = new ZeroOrMorePathItem(this.constructPathPattern(shapeStore, zeroOrMorePathObjects[0]));
                }else if (oneOrMorePathObjects[0]) {
                    p = new OneOrMorePathItem(this.constructPathPattern(shapeStore, oneOrMorePathObjects[0]));
                } else if (zeroOrOnePathObjects[0]) {
                    p = new ZeroOrOnePathItem(this.constructPathPattern(shapeStore, zeroOrOnePathObjects[0]));
                } else if (inversePathObjects[0]){
                    p = new InversePathItem(this.constructPathPattern(shapeStore, inversePathObjects[0]));
                } else if (alternativePathObjects[0]){
                    let alternativeListArray = this.rdfListToArray(shapeStore, alternativePathObjects[0]).map( (value: Term) => {
                        return this.constructPathPattern(shapeStore, value);
                    });
                    p = new AlternativePathItem(alternativeListArray);
                } else {
                    //RDF List encountered in an rdf list... let’s just process the list as well?
                    // e.g., :    	sh:path ( ex:test ex:test2 (ex:test3 ex:test4) ) is equivalent to sh:path ( ex:test ex:test2 ex:test3 ex:test4 )
                    result.concat(this.constructPathPattern(shapeStore, listItem).pathItems);                    
                }
            } else {
                //This is a named node, and therefore it is a predicate item
                p = new PredicateItem(listItem);
            }
            result.push(p);
        }
        return new PathPattern(result);
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
        
        let path = shapeStore.getObjects(propertyShapeId, 'http://www.w3.org/ns/shacl#path')[0];
        //Process the path now and make sure there’s a match function
        if (!path) {
            return false; //this isn’t a property shape...
        }

        let pathPattern = this.constructPathPattern(shapeStore, path);
        
        let minCount = shapeStore.getObjects(propertyShapeId, "http://www.w3.org/ns/shacl#minCount");
        
        if ((minCount[0] && minCount[0].value !== "0") || required) {
            shape.requiredPaths.push(pathPattern);
        } else {
            //TODO: don’t include node links?
            shape.optionalPaths.push(pathPattern);
        }
        // **TODO**: will the sh:or, sh:xone, sh:and, etc. be of use here? It won’t contain any more information about possible properties?
        // Maybe to potentially point to another node, xone a datatype?
        
        // Does it link to a literal or to a new node?
        let nodeLink = shapeStore.getObjects(propertyShapeId, 'http://www.w3.org/ns/shacl#node');
        if (nodeLink[0]) {
            shape.nodeLinks.push(new NodeLink(pathPattern, nodeLink[0].value));
        }
        //TODO: Can Nodelinks appear in conditionals from here? Probably they can? (same comment as ↑)
        return true; // Success: the property shape has been processed    
    }
    
    /**
    * Processes a NodeShape or PropertyShape and adds NodeLinks and required properties to the arrays.
    * @param shapeStore 
    * @param shapeId 
    * @param shape 
    * @returns 
    */
    preprocessShape(shapeStore: Store, shapeId: string, shape: Shape) {
        return this.preprocessPropertyShape(shapeStore, shapeId, shape)?true: this.preprocessNodeShape(shapeStore, shapeId, shape);
    }
    
    /**
    * Processes a NodeShape
    * @param shapeStore 
    * @param nodeShapeId 
    * @param shape 
    */
    protected preprocessNodeShape(shapeStore: Store, nodeShapeId: string, shape: Shape) {
        //Process properties if it has any
        let properties = shapeStore.getObjects(nodeShapeId, "http://www.w3.org/ns/shacl#property");
        for (let prop of properties) {
            this.preprocessPropertyShape(shapeStore, prop, shape);
        }
        
        // process sh:and: just add all IDs to this array
        // Process everything you can find nested in AND or OR clauses
        // Reason why we must process OR and AND in the same way for discovery is provided in the README.md
        for (let andList of shapeStore.getObjects(nodeShapeId, "http://www.w3.org/ns/shacl#and")) {
            // Try to process it as a property shape
            //for every andList found, iterate through it and try to preprocess the property shape, if doesn’t work, preprocess as a nodeshape again
            for (let and of this.rdfListToArray(shapeStore, andList)) {
                this.preprocessShape(shapeStore, and, shape);
            }
        }
        //Process zero or more sh:xone and sh:or lists in the same way
        for (let xoneOrOrList of shapeStore.getObjects(nodeShapeId, "http://www.w3.org/ns/shacl#xone").concat( shapeStore.getObjects(nodeShapeId, "http://www.w3.org/ns/shacl#or"))) {
            let atLeastOneList : Array<Shape> = this.rdfListToArray(shapeStore, xoneOrOrList).map((val): Shape => {
                let newShape = new Shape();
                //Create a new shape and process as usual -- but mind that we don’t trigger a circular shape here...
                this.preprocessShape(shapeStore, val, newShape);
                return newShape;
                //Add this one to the shapesgraph
            });
            shape.atLeastOneLists.push(atLeastOneList);
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