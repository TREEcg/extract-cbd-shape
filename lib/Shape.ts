import { RdfStore } from "rdf-stores";
import { Term } from "@rdfjs/types";
import { DataFactory } from 'rdf-data-factory';
const df = new DataFactory();
import { createTermNamespace, RDF } from "@treecg/types";
import {
  AlternativePath,
  InversePath,
  OneOrMorePath,
  Path,
  PredicatePath,
  SequencePath,
  ZeroOrMorePath,
  ZeroOrOnePath,
} from "./Path";
import { CbdExtracted } from "./CBDShapeExtractor";

const SHACL = createTermNamespace(
  "http://www.w3.org/ns/shacl#",
  "zeroOrMorePath",
  "zeroOrOnePath",
  "oneOrMorePath",
  "inversePath",
  "alternativePath",
  "deactivated",
  "minCount",
  "path",
  "node",
  "closed",
  "property",
  "and",
  "xone",
  "or",
  "NodeShape",
);


const getSubjects = function (store: RdfStore, predicate: Term|null, object: Term|null, graph?:Term|null) {
  return store.getQuads(null, predicate, object, graph).map((quad) => {
    return quad.subject;
  });
}

const getObjects = function (store: RdfStore, subject:Term|null, predicate: Term|null, graph?:Term|null) {
  return store.getQuads(subject, predicate, null, graph).map((quad) => {
    return quad.object;
  });
}

//TODO: split this file up between Shape functionality and SHACL to our Shape class conversion steps. Also introduce a ShEx to Shape Template
export class NodeLink {
  public pathPattern: Path;
  public link: Term;
  constructor(pathPattern: Path, link: Term) {
    this.pathPattern = pathPattern;
    this.link = link;
  }
}

export class ShapeError {
  type: "and" | "or";
  errors: (ShapeError | Path)[] = [];
  constructor(type: "and" | "or", errors: (ShapeError | Path)[] = []) {
    this.type = type;
    this.errors = errors;
  }

  toString(): string {
    if (this.errors.length === 1) {
      return this.errors[0].toString();
    } else {
      const sep = this.type == "and" ? " && " : " || ";
      return "(" + this.errors.map((x) => x.toString()).join(sep) + ")";
    }
  }
}

export class ShapeTemplate {
  closed: boolean;
  nodeLinks: Array<NodeLink>;
  requiredPaths: Array<Path>;
  optionalPaths: Array<Path>;
  atLeastOneLists: Array<Array<ShapeTemplate>>;

  constructor() {
    //All properties will be added, but if a required property is not available, then we need to further look it up
    this.requiredPaths = [];
    //If there’s a nodelink through one of the properties, I want to know what other shape to look up in the shapesgraph from there
    this.nodeLinks = [];
    this.atLeastOneLists = [];
    this.optionalPaths = [];
    this.closed = false; //default value
  }

  private invalidAtLeastOneLists(
    extract: CbdExtracted,
  ): ShapeError | undefined {
    const out = new ShapeError("and");

    for (let list of this.atLeastOneLists) {
      const sub = new ShapeError("or");

      let atLeastOne = false;
      for (let item of list) {
        const error = item.requiredAreNotPresent(extract);
        if (error) {
          sub.errors.push(error);
        } else {
          atLeastOne = true;
          break;
        }
      }
      if (!atLeastOne) {
        out.errors.push(sub);
      }
    }

    if (out.errors.length > 0) {
      return out;
    }
    return;
  }

  private requiredPathsAreNotPresent(
    extract: CbdExtracted,
  ): ShapeError | undefined {
    const errors = this.requiredPaths.filter((path) => !path.found(extract));
    if (errors.length > 0) {
      return new ShapeError("and", errors);
    } else {
      return;
    }
  }

  requiredAreNotPresent(extract: CbdExtracted): ShapeError | undefined {
    const required = this.requiredPathsAreNotPresent(extract);
    const atLeastOne = this.invalidAtLeastOneLists(extract);
    if (required && atLeastOne) {
      return new ShapeError("and", [...required.errors, ...atLeastOne.errors]);
    }

    if (required) return required;
    if (atLeastOne) return atLeastOne;
  }
}

export class RDFMap<T> {
  private namedNodes: Map<String, T> = new Map();
  private blankNodes: Map<String, T> = new Map();

  set(node: Term, item: T) {
    if (node.termType === "NamedNode") {
      this.namedNodes.set(node.value, item);
    }

    if (node.termType === "BlankNode") {
      this.blankNodes.set(node.value, item);
    }
  }

  get(node: Term): T | undefined {
    if (node.termType === "NamedNode") {
      return this.namedNodes.get(node.value);
    }

    if (node.termType === "BlankNode") {
      return this.blankNodes.get(node.value);
    }
  }
}

export class ShapesGraph {
  shapes: RDFMap<ShapeTemplate>;

  constructor(shapeStore: RdfStore) {
    this.shapes = this.initializeFromStore(shapeStore);
  }

  protected constructPathPattern(shapeStore: RdfStore, listItem: Term): Path {
    if (listItem.termType === 'BlankNode') {
      //Look for special types
      let zeroOrMorePathObjects = getObjects(shapeStore,
        listItem,
        SHACL.zeroOrMorePath,
        null,
      );
      let oneOrMorePathObjects = getObjects(shapeStore,
        listItem,
        SHACL.oneOrMorePath,
        null,
      );
      let zeroOrOnePathObjects = getObjects(shapeStore,
        listItem,
        SHACL.zeroOrOnePath,
        null,
      );
      let inversePathObjects = getObjects(shapeStore,
        listItem,
        SHACL.inversePath, null,
      );
      let alternativePathObjects = getObjects(shapeStore,
        listItem,
        SHACL.alternativePath,
        null,
      );
      if (zeroOrMorePathObjects[0]) {
        return new ZeroOrMorePath(
          this.constructPathPattern(shapeStore, zeroOrMorePathObjects[0]),
        );
      } else if (oneOrMorePathObjects[0]) {
        return new OneOrMorePath(
          this.constructPathPattern(shapeStore, oneOrMorePathObjects[0]),
        );
      } else if (zeroOrOnePathObjects[0]) {
        return new ZeroOrOnePath(
          this.constructPathPattern(shapeStore, zeroOrOnePathObjects[0]),
        );
      } else if (inversePathObjects[0]) {
        return new InversePath(
          this.constructPathPattern(shapeStore, inversePathObjects[0]),
        );
      } else if (alternativePathObjects[0]) {
        let alternativeListArray = this.rdfListToArray(
          shapeStore,
          alternativePathObjects[0],
        ).map((value: Term) => {
          return this.constructPathPattern(shapeStore, value);
        });
        return new AlternativePath(alternativeListArray);
      } else {
        const items = this.rdfListToArray(shapeStore, listItem);
        return new SequencePath(
          items.map((x) => this.constructPathPattern(shapeStore, x)),
        );
      }
    }

    return new PredicatePath(listItem);
  }

  /**
   * @param shapeStore
   * @param propertyShapeId
   * @param shape
   * @returns false if it wasn’t a property shape
   */
  protected preprocessPropertyShape(
    shapeStore: RdfStore,
    propertyShapeId: Term,
    shape: ShapeTemplate,
    required?: boolean,
  ): boolean {
    //Skip if shape has been deactivated
    let deactivated = getObjects(shapeStore,
      propertyShapeId,
      SHACL.deactivated,
      null,
    );
    if (deactivated.length > 0 && deactivated[0].value === "true") {
      return true; //Success: doesn’t matter what kind of thing it was, it’s deactivated so let’s just proceed
    }

    let path = getObjects(shapeStore,propertyShapeId, SHACL.path, null)[0];
    //Process the path now and make sure there’s a match function
    if (!path) {
      return false; //this isn’t a property shape...
    }

    let pathPattern = this.constructPathPattern(shapeStore, path);

    let minCount = getObjects(shapeStore,propertyShapeId, SHACL.minCount, null);

    if ((minCount[0] && minCount[0].value !== "0") || required) {
      shape.requiredPaths.push(pathPattern);
    } else {
      //TODO: don’t include node links?
      shape.optionalPaths.push(pathPattern);
    }
    // **TODO**: will the sh:or, sh:xone, sh:and, etc. be of use here? It won’t contain any more information about possible properties?
    // Maybe to potentially point to another node, xone a datatype?

    // Does it link to a literal or to a new node?
    let nodeLink = getObjects(shapeStore,propertyShapeId, SHACL.node, null);
    if (nodeLink[0]) {
      shape.nodeLinks.push(new NodeLink(pathPattern, nodeLink[0]));
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
  preprocessShape(shapeStore: RdfStore, shapeId: Term, shape: ShapeTemplate) {
    return this.preprocessPropertyShape(shapeStore, shapeId, shape)
      ? true
      : this.preprocessNodeShape(shapeStore, shapeId, shape);
  }

  /**
   * Processes a NodeShape
   * @param shapeStore
   * @param nodeShapeId
   * @param shape
   */
  protected preprocessNodeShape(
    shapeStore: RdfStore,
    nodeShapeId: Term,
    shape: ShapeTemplate,
  ) {
    //Check if it’s closed or open
    let closedIndicator: Term = getObjects(shapeStore,
      nodeShapeId,
      SHACL.closed,
      null,
    )[0];
    if (closedIndicator && closedIndicator.value === "true") {
      shape.closed = true;
    }

    //Process properties if it has any
    let properties = getObjects(shapeStore,nodeShapeId, SHACL.property, null);
    for (let prop of properties) {
      this.preprocessPropertyShape(shapeStore, prop, shape);
    }

    // process sh:and: just add all IDs to this array
    // Process everything you can find nested in AND clauses
    for (let andList of getObjects(shapeStore,nodeShapeId, SHACL.and, null)) {
      // Try to process it as a property shape
      //for every andList found, iterate through it and try to preprocess the property shape
      for (let and of this.rdfListToArray(shapeStore, andList)) {
        this.preprocessShape(shapeStore, and, shape);
      }
    }
    //Process zero or more sh:xone and sh:or lists in the same way -- explanation in README why they can be handled in the same way
    for (let xoneOrOrList of getObjects(shapeStore, nodeShapeId, SHACL.xone, null)
        .concat(getObjects(shapeStore,nodeShapeId, SHACL.or, null))) {
      let atLeastOneList: Array<ShapeTemplate> = this.rdfListToArray(
        shapeStore,
        xoneOrOrList,
      ).map((val): ShapeTemplate => {
        let newShape = new ShapeTemplate();
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
   * @param nodeShape is an N3.Store with the quads of the SHACL shape
   */
  initializeFromStore(shapeStore: RdfStore): RDFMap<ShapeTemplate> {
    //get all named nodes of entities that are sh:ShapeNodes which we’ll recognize through their use of sh:property (we’ll find other relevant shape nodes later on)
    //TODO: This is a limitation though: we only support NodeShapes with at least one sh:property set? Other NodeShapes in this context are otherwise just meaningless?
    const shapeNodes: Term[] = (<Term[]>[])
      .concat(getSubjects(shapeStore, SHACL.property, null, null))
      .concat(getSubjects(shapeStore, RDF.terms.type, SHACL.NodeShape, null))
      .concat(getObjects(shapeStore,null, SHACL.node, null))
      //DISTINCT
      .filter((value: Term, index: number, array: Array<Term>) => {
        return array.findIndex((x) => x.equals(value)) === index;
      });

    let shapes = new RDFMap<ShapeTemplate>();
    for (let shapeId of shapeNodes) {
      let shape = new ShapeTemplate();
      //Don’t process if shape is deactivated
      let deactivated = getObjects(shapeStore,shapeId, SHACL.deactivated, null);
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
  protected *rdfListToGenerator(
    shapeStore: RdfStore,
    item: Term,
  ): Generator<Term> {
    if (
      getObjects(shapeStore,
        item,
        df.namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#first"),
        null,
      )[0]
    ) {
      yield getObjects(shapeStore,
        item,
        df.namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#first"),
        null,
      )[0];
      let rest = getObjects(shapeStore,
        item,
        df.namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#rest"),
        null,
      )[0];
      while (
        rest &&
        rest.value !== "http://www.w3.org/1999/02/22-rdf-syntax-ns#nil"
      ) {
        yield getObjects(shapeStore,
          rest,
          df.namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#first"),
          null,
        )[0];
        rest = getObjects(shapeStore,
          rest,
          df.namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#rest"),
          null,
        )[0];
      }
    } else {
      //it’s not a list, it’s just one element
      yield item;
    }
    return;
  }

  protected rdfListToArray(shapeStore: RdfStore, item: Term): Array<Term> {
    return Array.from(this.rdfListToGenerator(shapeStore, item));
  }
}
