import { NamedNode, Quad, Store, Term, BlankNode } from "n3";

export class Property {   
    node?: Shape;
    constructor() {
    }
}

export abstract class PathItem {
    value: PathPattern|NamedNode|Array<PathPattern>;
    constructor (value:PathPattern|NamedNode|Array<PathPattern>){
        this.value = value;
    }
}

export class PredicateItem extends PathItem{
    constructor (value:NamedNode){
        super(value);
    }
}
export class AlternativePathItem extends PathItem{
    constructor (value: Array<PathPattern>) {
        super(value)
    }
}
export class InversePathItem extends PathItem{
    constructor (value:PathPattern|NamedNode){
        super(value);
    }
}

export class ZeroOrMorePathItem extends PathItem{
    
}

export class OneOrMorePathItem extends PathItem{
    
}

export class ZeroOrOnePathItem extends PathItem{
    
}

export class PathPattern {
    pathItems:Array<PathItem>;
    constructor (pathItems: Array<PathItem>) {
        this.pathItems = pathItems;
    }
    
    /**
     * Converts it to a SPARQL property path for easy output
     * @returns SPARQK property path string
     */
    public toString () {
        let str = "";
        let i = 0;
        if (this.pathItems.length > 1) {
            str+= "(";
        }
        for (let item of this.pathItems) {
            //If it’s not the first item, add a space
            if (i!==0) {
                str+=" ";
            }
            if (item instanceof PredicateItem) {
                str+= "<"+item.value.value+">";
            } else if (item instanceof InversePathItem) {
                str+= "^" + item.value.toString();
            } else if (item instanceof AlternativePathItem) {
                for (let alternate of item.value) {
                    str+= alternate.value.toString() + "|";
                }
            } else if (item instanceof ZeroOrOnePathItem){
                str+= item.value.toString() + "?";
            } else if (item instanceof ZeroOrMorePathItem){
                str+= item.value.toString() + "*";
            } else if (item instanceof OneOrMorePathItem){
                str+= item.value.toString() + "+";
            }
            //if this is not the last item, we’re dealing with a sequence path, so add a slash for the next item
            if (i !== this.pathItems.length-1) {
                str += "/";
            }
            i++;
        }
        if (this.pathItems.length > 1) {
            str+= ")";
        }
        return str;
    }
    public * match (store:Store, focusNode: Term, pathItems?:Array<PathItem>, currentPath?: Array<Quad>, inverse?:boolean): Generator<Array<Quad>> {
        //returns all real paths that match the path pattern starting from the focusNode        
        if (!currentPath) {
            currentPath = [];
        }
        if (!pathItems) {
            pathItems = this.pathItems;
        }
        //Work out each item, building further
        //and concatenate it with the rest of all possible solutions of the rest. Yield solutions one by one if it’s the last element in the array
        let pathItem = pathItems[0];
        
        if (pathItem instanceof PredicateItem) {
            //Look up the quad, on the focus node in the store, if one or more exists, loop through them, add them to possible yielded solutions, and continue
            let quads = [];
            if (!inverse)
                quads = store.getQuads(focusNode, pathItem.value );
            else 
                quads = store.getQuads(null, pathItem.value, focusNode );
            for (let quad of quads) {
                //Each of these is a possibility for more matches
                let newCurrentPath = currentPath;
                newCurrentPath.push(quad);
                //If there are no elements left, we are yielding our result
                if (pathItems.length === 1) {
                    yield newCurrentPath;
                } else {
                    //Go deeper and yield the results of the function in here
                    let newFocusNode = inverse?quad.subject:quad.object;
                    let restMatches = this.match(store, newFocusNode, pathItems.slice(1), currentPath)
                    let restMatch = restMatches.next();
                    while (!restMatch.done) {
                        yield restMatch.value;
                        restMatch = restMatches.next();
                    }
                }
            }
            
        } else if (pathItem instanceof InversePathItem) {
            //Match everything inside, but add a flag inverse - then continue the sequence path, if there are more, and add the result here.
            //pathItem will be a new pathpattern, but we need to extract it with inverse true and make sure a new current path is created for every result
            let inverseMatches = this.match(store, focusNode, pathItem.value.pathItems, currentPath, true);
            //For every match, add it to a currentPath and continue the sequence
            for (let match of Array.from(inverseMatches)) {
                let newCurrentPath = [...currentPath, ...match]; // create a copy and concat with the path from the matches
                //If there are no elements left in the rest of the sequence path, we are yielding our result
                if (pathItems.length === 1) {
                    yield newCurrentPath;
                } else {
                    //Otherwise, we need to handle the rest of the sequence path by starting from our last focusnode and path
                    //Also pass the current inverse in case we’re already in an inverse. Would be really weird, but hey, who are we to judge anyone’s shape
                    let restMatches = this.match(store, match[match.length-1].object, pathItems.slice(1), newCurrentPath, inverse);
                    let restMatch = restMatches.next();
                    while (!restMatch.done) {
                        yield restMatch.value;
                        restMatch = restMatches.next();
                    }
                }
            }
        } else if(pathItem instanceof ZeroOrOnePathItem) {
            console.error('No support yet for Zero Or One path');
        } else if (pathItem instanceof OneOrMorePathItem) {
            console.error('No support yet for One or More path');
        } else if (pathItem instanceof ZeroOrMorePathItem){
            console.error('No support yet for Zero Or More path');
            
        } else if (pathItem instanceof AlternativePathItem) {
            console.error('No support yet for Alternative path');
        }
        //All potential matches we need to further study...
        
    }
}

export class NodeLink {
    public pathPattern : PathPattern;
    public link: string;
    constructor (pathPattern: PathPattern, link: string) {
        this.pathPattern = pathPattern;
        this.link = link;
    }
}

export class Shape {
    nodeLinks: Array<NodeLink>;
    requiredPaths: Array<PathPattern> ;
    xone: Array<Array<Shape>>; //the first match, then stop
    constructor () {
        //All properties will be added, but if a required property is not available, then we need to further look it up
        this.requiredPaths = [];
        //If there’s a nodelink through one of the properties, I want to know what other shape to look up in the shapesgraph from there
        this.nodeLinks = [];
        this.xone = [];
    }
    getNodeLinkQuads (id:Term, store:Store, focusNode: Term) {
        for (let nodeLink of this.nodeLinks) {
            if (nodeLink.pathPattern.match(store, focusNode)) {

            }
        }
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
        //Only support predicate paths for now TODO
        let pathPattern = this.constructPathPattern(shapeStore, path);
        
        let minCount = shapeStore.getObjects(propertyShapeId, "http://www.w3.org/ns/shacl#minCount");
        
        if ((minCount[0] && minCount[0].value !== "0") || required) {
            shape.requiredPaths.push(pathPattern);
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
        
        //process sh:and and sh:or on shapeId: just add all IDs to this array
        // Process everything you can find nested in AND or OR clauses
        // Reason why we must process OR and AND in the same way for discovery is provided in the README.md
        for (let andList of shapeStore.getObjects(nodeShapeId, "http://www.w3.org/ns/shacl#and").concat( shapeStore.getObjects(nodeShapeId, "http://www.w3.org/ns/shacl#or"))) {
            // Try to process it as a property shape
            //for every andList found, iterate through it and try to preprocess the property shape, if doesn’t work, preprocess as a nodeshape again
            for (let and of this.rdfListToArray(shapeStore, andList)) {
                this.preprocessShape(shapeStore, and, shape);
            }
        }
        //Process zero or more possibly recursive sh:xone lists
        for (let xoneList of shapeStore.getObjects(nodeShapeId, "http://www.w3.org/ns/shacl#xone")) {
            shape.xone.push(this.rdfListToArray(shapeStore, xoneList).map((val): Shape => {
                    let newShape = new Shape();
                    this.preprocessShape(shapeStore, val, newShape);
                    //Add this one to the shapesgraph
                    return newShape;
                }));
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