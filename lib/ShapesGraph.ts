import { RdfStore } from "rdf-stores";
import { Term } from "@rdfjs/types";
import {
  AlternativePath,
  InversePath,
  OneOrMorePath,
  Path,
  PredicatePath,
  SequencePath,
  ZeroOrMorePath,
  ZeroOrOnePath
} from "./Path";
import { createTermNamespace, RDF, RDFS } from "@treecg/types";
import { NodeLink, RDFMap, ShapeTemplate } from "./Shape";
import { DataFactory } from "rdf-data-factory";

const df = new DataFactory();

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

export class ShapesGraph {
  shapes: RDFMap<ShapeTemplate>;
  private counter: number;

  constructor(shapeStore: RdfStore) {
    this.shapes = this.initializeFromStore(shapeStore);
    this.counter = 0;
  }

  /**
   * This function returns a Mermaid representation of a shape identified by a given term.
   * @param term {Term} - The term of the Shape that is the start of the representation.
   */
  public toMermaid(term: Term): string {
    const startShape = this.shapes.get(term);
    this.counter = 0;

    if (!startShape) {
      throw new Error(`No shape found for term "${term.value}"`);
    }

    let mermaid = 'flowchart LR\n';
    mermaid += this.toMermaidSingleShape(startShape, '1', startShape.label || 'Shape');
    return mermaid;
  }

  /**
   * This function returns a Mermaid representation of a given shape.
   * @param shape - The shape for which to generate a representation.
   * @param id - The ID to identify the shape in the representation.
   * @param name - The name used for the shape in the representation.
   * @private
   */
  private toMermaidSingleShape(shape: ShapeTemplate, id: string, name: string): string {
    let mermaid = `  S${id}((${name}))\n`;
    let alreadyProcessedPaths: string[] = [];

    shape.nodeLinks.forEach(nodeLink => {
      let p = nodeLink.pathPattern.toString();
      const isPathRequired = this.isPathRequired(p, shape.requiredPaths);
      alreadyProcessedPaths.push(p);
      p = this.cleanPath(p);
      const linkedShape = this.shapes.get(nodeLink.link);

      if (!linkedShape) {
        throw new Error(`The linked shape "${nodeLink.link}" is not found`);
      }

      const linkedShapeId = `${id}_${this.counter}`;

      let link = '-->';

      if (!isPathRequired) {
        link = '-.->';
      }
      if (p.startsWith('^')) {
        p = p.substring(1);
        mermaid += `  S${linkedShapeId}[ ]${link}|"${p}"|S${id}\n`;
      } else {
        mermaid += `  S${id}${link}|"${p}"|S${linkedShapeId}[ ]\n`;
      }

      this.counter++;

      const linkedShapeMermaid = this.toMermaidSingleShape(linkedShape, linkedShapeId, linkedShape.label || 'Shape');
      mermaid += linkedShapeMermaid;
    });

    shape.atLeastOneLists.forEach(list => {
      if (list.length > 0) {
        const xId = `${id}_${this.counter}`;
        mermaid += `  S${id}---X${xId}{OR}\n`;

        list.forEach(shape => {
          const shapeId = `${id}_${this.counter}`;
          this.counter++;

          mermaid += `  X${xId}---S${shapeId}\n`;
          const linkedShapeMermaid = this.toMermaidSingleShape(shape, shapeId, shape.label || 'Shape');
          mermaid += linkedShapeMermaid;
        });
      }
    });

    mermaid += this.simplePathToMermaid(shape.requiredPaths, alreadyProcessedPaths, id, '-->');
    mermaid += this.simplePathToMermaid(shape.optionalPaths, alreadyProcessedPaths, id, '-.->');

    return mermaid;
  }

  /**
   * This function removes < and > from a path.
   * @param path - The path from which to remove the < and >.
   * @private
   */
  private cleanPath(path: string): string {
    path = path.replace(/</g, '');
    return path.replace(/>/g, '');
  }

  /**
   * This function returns true if the given path is required.
   * @param path - The path that needs to be checked.
   * @param requiredPaths - An array of all required paths.
   * @private
   */
  private isPathRequired(path: string, requiredPaths: Path[]): boolean {
    for (const requiredPath of requiredPaths) {
      if (path === requiredPath.toString()) {
        return true;
      }
    }

    return false;
  }

  /**
   * This function returns a Mermaid presentation for an array of simple paths.
   * This function is intended to be used with shape.requiredPaths and shape.optionalPaths.
   * @param paths - An array of paths.
   * @param alreadyProcessedPaths - An array of stringified paths that already have been processed.
   * @param shapedId - The id of the shape to which these paths belong.
   * @param link - The Mermaid link that needs to be used.
   * @private
   */
  private simplePathToMermaid(paths: Path[], alreadyProcessedPaths: string[], shapedId: string, link: string) {
    let mermaid = '';

    paths.forEach(path => {
      let p = path.toString();

      if (alreadyProcessedPaths.includes(p)) {
        return;
      }

      alreadyProcessedPaths.push(p);
      p = this.cleanPath(p);

      if (this.isRealInversePath(p)) {
        p = this.getRealPath(p);
        mermaid += `  S${shapedId}_${this.counter}[ ]${link}|"${p}"|S${shapedId}\n`;
      } else {
        p = this.getRealPath(p);
        mermaid += `  S${shapedId}${link}|"${p}"|S${shapedId}_${this.counter}[ ]\n`;
      }

      this.counter++;
    });

    return mermaid;
  }

  /**
   * This function returns true if a given path is real inverse path.
   * This means that the path is not a double, quadruple, ... inverse path.
   * @param path - The path that needs to be checked.
   * @private
   */
  private isRealInversePath(path: string): boolean {
    const found = path.match(/^(\^+)[^\^]+/);

    if (!found) {
      return false;
    }

    return found[1].length % 2 !== 0;
  }

  /**
   * This function removes all the ^ from the path.
   * @param path - The path from which to remove the ^.
   * @private
   */
  private getRealPath(path: string): string {
    const found = path.match(/^\^*([^\^]+)/);

    if (!found) {
      throw new Error(`No real path found in "${path}"`);
    }

    return found[1];
  }

  protected constructPathPattern(shapeStore: RdfStore, listItem: Term): Path {
    if (listItem.termType === "BlankNode") {
      //Look for special types
      let zeroOrMorePathObjects = getObjects(
        shapeStore,
        listItem,
        SHACL.zeroOrMorePath,
        null,
      );
      let oneOrMorePathObjects = getObjects(
        shapeStore,
        listItem,
        SHACL.oneOrMorePath,
        null,
      );
      let zeroOrOnePathObjects = getObjects(
        shapeStore,
        listItem,
        SHACL.zeroOrOnePath,
        null,
      );
      let inversePathObjects = getObjects(
        shapeStore,
        listItem,
        SHACL.inversePath,
        null,
      );
      let alternativePathObjects = getObjects(
        shapeStore,
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
   * @param required
   * @returns false if it wasn't a property shape
   */
  protected preprocessPropertyShape(
    shapeStore: RdfStore,
    propertyShapeId: Term,
    shape: ShapeTemplate,
    required?: boolean,
  ): boolean {
    //Skip if shape has been deactivated
    let deactivated = getObjects(
      shapeStore,
      propertyShapeId,
      SHACL.deactivated,
      null,
    );
    if (deactivated.length > 0 && deactivated[0].value === "true") {
      return true; //Success: doesn't matter what kind of thing it was, it's deactivated so let's just proceed
    }

    let path = getObjects(shapeStore, propertyShapeId, SHACL.path, null)[0];
    //Process the path now and make sure there's a match function
    if (!path) {
      return false; //this isn't a property shape...
    }

    let pathPattern = this.constructPathPattern(shapeStore, path);

    let minCount = getObjects(
      shapeStore,
      propertyShapeId,
      SHACL.minCount,
      null,
    );

    if ((minCount[0] && minCount[0].value !== "0") || required) {
      shape.requiredPaths.push(pathPattern);
    } else {
      //TODO: don't include node links?
      shape.optionalPaths.push(pathPattern);
    }
    // **TODO**: will the sh:or, sh:xone, sh:and, etc. be of use here? It won't contain any more information about possible properties?
    // Maybe to potentially point to another node, xone a datatype?

    // Does it link to a literal or to a new node?
    let nodeLink = getObjects(shapeStore, propertyShapeId, SHACL.node, null);
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
    // Extract label
    const rdfsLabel = getObjects(shapeStore, nodeShapeId, RDFS.terms.label)[0];
    if (rdfsLabel) {
      shape.label = rdfsLabel.value;
    } else {
      shape.label = nodeShapeId.termType === "BlankNode" ?
        nodeShapeId.value :
        nodeShapeId.value.split("/")[nodeShapeId.value.split("/").length - 1];
    }

    //Check if it's closed or open
    let closedIndicator: Term = getObjects(
      shapeStore,
      nodeShapeId,
      SHACL.closed,
      null,
    )[0];
    if (closedIndicator && closedIndicator.value === "true") {
      shape.closed = true;
    }

    //Process properties if it has any
    let properties = getObjects(shapeStore, nodeShapeId, SHACL.property, null);
    for (let prop of properties) {
      this.preprocessPropertyShape(shapeStore, prop, shape);
    }

    // process sh:and: just add all IDs to this array
    // Process everything you can find nested in AND clauses
    for (let andList of getObjects(shapeStore, nodeShapeId, SHACL.and, null)) {
      // Try to process it as a property shape
      //for every andList found, iterate through it and try to preprocess the property shape
      for (let and of this.rdfListToArray(shapeStore, andList)) {
        this.preprocessShape(shapeStore, and, shape);
      }
    }
    //Process zero or more sh:xone and sh:or lists in the same way -- explanation in README why they can be handled in the same way
    for (let xoneOrOrList of getObjects(
      shapeStore,
      nodeShapeId,
      SHACL.xone,
      null,
    ).concat(getObjects(shapeStore, nodeShapeId, SHACL.or, null))) {
      let atLeastOneList: Array<ShapeTemplate> = this.rdfListToArray(
        shapeStore,
        xoneOrOrList,
      ).map((val): ShapeTemplate => {
        let newShape = new ShapeTemplate();
        //Create a new shape and process as usual -- but mind that we don't trigger a circular shape here...
        this.preprocessShape(shapeStore, val, newShape);
        return newShape;
        //Add this one to the shapesgraph
      });
      shape.atLeastOneLists.push(atLeastOneList);
    }
    //And finally, we're just ignoring sh:not. Don't process this one
  }

  /**
   * @param shapeStore
   */
  initializeFromStore(shapeStore: RdfStore): RDFMap<ShapeTemplate> {
    //get all named nodes of entities that are sh:NodeShapes which we'll recognize through their use of sh:property (we'll find other relevant shape nodes later on)
    //TODO: This is a limitation though: we only support NodeShapes with at least one sh:property set? Other NodeShapes in this context are otherwise just meaningless?
    const shapeNodes: Term[] = (<Term[]>[])
      .concat(getSubjects(shapeStore, SHACL.property, null, null))
      .concat(getSubjects(shapeStore, RDF.terms.type, SHACL.NodeShape, null))
      .concat(getObjects(shapeStore, null, SHACL.node, null))
      //DISTINCT
      .filter((value: Term, index: number, array: Array<Term>) => {
        return array.findIndex((x) => x.equals(value)) === index;
      });

    let shapes = new RDFMap<ShapeTemplate>();
    for (let shapeId of shapeNodes) {
      let shape = new ShapeTemplate();
      //Don't process if shape is deactivated
      let deactivated = getObjects(
        shapeStore,
        shapeId,
        SHACL.deactivated,
        null,
      );
      if (!(deactivated.length > 0 && deactivated[0].value === "true")) {
        this.preprocessNodeShape(shapeStore, shapeId, shape);
        shapes.set(shapeId, shape);
      }
    }
    return shapes;
  }

  /**
   * Processes all element from an RDF List, or detects it wasn't a list after all and it's just one element.
   * @param shapeStore
   * @param item
   * @returns
   */
  protected* rdfListToGenerator(
    shapeStore: RdfStore,
    item: Term,
  ): Generator<Term> {
    if (
      getObjects(
        shapeStore,
        item,
        df.namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#first"),
        null,
      )[0]
    ) {
      yield getObjects(
        shapeStore,
        item,
        df.namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#first"),
        null,
      )[0];
      let rest = getObjects(
        shapeStore,
        item,
        df.namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#rest"),
        null,
      )[0];
      while (
        rest &&
        rest.value !== "http://www.w3.org/1999/02/22-rdf-syntax-ns#nil"
      ) {
        yield getObjects(
          shapeStore,
          rest,
          df.namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#first"),
          null,
        )[0];
        rest = getObjects(
          shapeStore,
          rest,
          df.namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#rest"),
          null,
        )[0];
      }
    } else {
      // It's not a list. It's just one element.
      yield item;
    }
    return;
  }

  protected rdfListToArray(shapeStore: RdfStore, item: Term): Array<Term> {
    return Array.from(this.rdfListToGenerator(shapeStore, item));
  }
}

const getSubjects = function (
  store: RdfStore,
  predicate: Term | null,
  object: Term | null,
  graph?: Term | null,
) {
  return store.getQuads(null, predicate, object, graph).map((quad) => {
    return quad.subject;
  });
};

const getObjects = function (
  store: RdfStore,
  subject: Term | null,
  predicate: Term | null,
  graph?: Term | null,
) {
  return store.getQuads(subject, predicate, null, graph).map((quad) => {
    return quad.object;
  });
};
