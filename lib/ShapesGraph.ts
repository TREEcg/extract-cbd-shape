import { Term, Store } from "@rdfjs/types";
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
import { clean, streamToArray } from "./Utils";

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
  "targetClass",
  "datatype",
  "NodeShape",
);

export class ShapesGraph {
  shapes: RDFMap<ShapeTemplate>;
  private counter: number;

  private constructor(shapes: RDFMap<ShapeTemplate>) {
    this.shapes = shapes;
    this.counter = 0;
  }

  /**
   * @param shapeStore
   */
  public static async fromStore(shapeStore: Store): Promise<ShapesGraph> {
    // Get all named nodes of entities that are sh:NodeShapes which we'll recognize through their use 
    // of sh:property (we'll find other relevant shape nodes later on)

    // TODO: This is a limitation though: we only support NodeShapes with at least one sh:property set? 
    // Other NodeShapes in this context are otherwise just meaningless?
    const shapeNodes: Term[] = (<Term[]>[])
      .concat(await getSubjects(shapeStore, SHACL.property, null, null))
      .concat(await getSubjects(shapeStore, RDF.terms.type, SHACL.NodeShape, null))
      .concat(await getObjects(shapeStore, null, SHACL.node, null))
      // DISTINCT
      .filter((value: Term, index: number, array: Array<Term>) => {
        return array.findIndex((x) => x.equals(value)) === index;
      });

    let shapesGraph = new ShapesGraph(new RDFMap<ShapeTemplate>());
    for (let shapeId of shapeNodes) {
      let shape = new ShapeTemplate();
      // Don't process if shape is deactivated
      let deactivated = await getObjects(
        shapeStore,
        shapeId,
        SHACL.deactivated,
        null,
      );
      if (!(deactivated.length > 0 && deactivated[0].value === "true")) {
        await shapesGraph.preprocessNodeShape(shapeStore, shapeId, shape);
        shapesGraph.shapes.set(shapeId, shape);
      }
    }
    return shapesGraph;
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

    shape.nodeLinks.forEach((nodeLink: any) => {
      let p = nodeLink.pathPattern.toString();
      const isPathRequired = this.isPathRequired(p, shape.requiredPaths);
      alreadyProcessedPaths.push(p);
      p = clean(p);
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

    shape.atLeastOneLists.forEach((list: any) => {
      if (list.length > 0) {
        const xId = `${id}_${this.counter}`;
        mermaid += `  S${id}---X${xId}{OR}\n`;

        list.forEach((shape: any) => {
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
      const literalType = path.literalType ? clean(path.literalType.value) : null;
      let p = path.toString();

      if (alreadyProcessedPaths.includes(p)) {
        return;
      }

      alreadyProcessedPaths.push(p);
      p = clean(p);

      if (this.isRealInversePath(p)) {
        p = this.getRealPath(p);
        mermaid += `  S${shapedId}_${this.counter}[${literalType || " "}]${link}|"${p}"|S${shapedId}\n`;
      } else {
        p = this.getRealPath(p);
        mermaid += `  S${shapedId}${link}|"${p}"|S${shapedId}_${this.counter}[${literalType || " "}]\n`;
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

  protected async constructPathPattern(shapeStore: Store, listItem: Term, literalType?: Term): Promise<Path> {

    if (listItem.termType === "BlankNode") {
      //Look for special types
      let zeroOrMorePathObjects = await getObjects(
        shapeStore,
        listItem,
        SHACL.zeroOrMorePath,
        null,
      );
      let oneOrMorePathObjects = await getObjects(
        shapeStore,
        listItem,
        SHACL.oneOrMorePath,
        null,
      );
      let zeroOrOnePathObjects = await getObjects(
        shapeStore,
        listItem,
        SHACL.zeroOrOnePath,
        null,
      );
      let inversePathObjects = await getObjects(
        shapeStore,
        listItem,
        SHACL.inversePath,
        null,
      );
      let alternativePathObjects = await getObjects(
        shapeStore,
        listItem,
        SHACL.alternativePath,
        null,
      );
      if (zeroOrMorePathObjects[0]) {
        return new ZeroOrMorePath(
          await this.constructPathPattern(shapeStore, zeroOrMorePathObjects[0], literalType),
        );
      } else if (oneOrMorePathObjects[0]) {
        return new OneOrMorePath(
          await this.constructPathPattern(shapeStore, oneOrMorePathObjects[0], literalType),
        );
      } else if (zeroOrOnePathObjects[0]) {
        return new ZeroOrOnePath(
          await this.constructPathPattern(shapeStore, zeroOrOnePathObjects[0], literalType),
        );
      } else if (inversePathObjects[0]) {
        return new InversePath(
          await this.constructPathPattern(shapeStore, inversePathObjects[0], literalType),
        );
      } else if (alternativePathObjects[0]) {
        let alternativeListArray = await Promise.all((await this.rdfListToArray(
          shapeStore,
          alternativePathObjects[0],
        )).map((value: Term) => {
          return this.constructPathPattern(shapeStore, value, literalType);
        }));
        return new AlternativePath(alternativeListArray);
      } else {
        const items = await this.rdfListToArray(shapeStore, listItem);
        return new SequencePath(
          await Promise.all(items.map((x) => this.constructPathPattern(shapeStore, x, literalType))),
        );
      }
    }

    return new PredicatePath(listItem, literalType);
  }

  /**
   * @param shapeStore
   * @param propertyShapeId
   * @param shape
   * @param required
   * @returns false if it wasn't a property shape
   */
  protected async preprocessPropertyShape(
    shapeStore: Store,
    propertyShapeId: Term,
    shape: ShapeTemplate,
    required?: boolean,
  ): Promise<boolean> {
    //Skip if shape has been deactivated
    let deactivated = await getObjects(
      shapeStore,
      propertyShapeId,
      SHACL.deactivated,
      null,
    );
    if (deactivated.length > 0 && deactivated[0].value === "true") {
      return true; //Success: doesn't matter what kind of thing it was, it's deactivated so let's just proceed
    }

    // Check if sh:datatype is defined
    const literalType = (await getObjects(
      shapeStore,
      propertyShapeId,
      SHACL.datatype,
      null,
    ))[0];

    let path = (await getObjects(shapeStore, propertyShapeId, SHACL.path, null))[0];
    //Process the path now and make sure there's a match function
    if (!path) {
      return false; //this isn't a property shape...
    }

    let pathPattern = await this.constructPathPattern(shapeStore, path, literalType);

    let minCount = await getObjects(
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
    let nodeLink = await getObjects(shapeStore, propertyShapeId, SHACL.node, null);
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
  async preprocessShape(shapeStore: Store, shapeId: Term, shape: ShapeTemplate) {
    return (await this.preprocessPropertyShape(shapeStore, shapeId, shape))
      ? true
      : await this.preprocessNodeShape(shapeStore, shapeId, shape);
  }

  /**
   * Processes a NodeShape
   * @param shapeStore
   * @param nodeShapeId
   * @param shape
   */
  protected async preprocessNodeShape(
    shapeStore: Store,
    nodeShapeId: Term,
    shape: ShapeTemplate,
  ) {
    // Extract label following this strategy:
    // first look for rdfs:label
    // fallback to sh:targetClass (if any)
    // fallback to last part of the node shape ID or the ID itself if it's a blank node
    const rdfsLabel = (await getObjects(shapeStore, nodeShapeId, RDFS.terms.label))[0];
    if (rdfsLabel) {
      shape.label = rdfsLabel.value;
    } else {
      const targetClass = (await getObjects(
        shapeStore,
        nodeShapeId,
        SHACL.targetClass,
        null,
      ))[0];
      if (targetClass) {
        // Make sure that IRIs are visible as node labels in mermaid diagrams
        shape.label = clean(targetClass.value);
      } else {
        shape.label = nodeShapeId.termType === "BlankNode" ?
          nodeShapeId.value :
          nodeShapeId.value.split("/")[nodeShapeId.value.split("/").length - 1];
      }
    }

    //Check if it's closed or open
    let closedIndicator: Term = (await getObjects(
      shapeStore,
      nodeShapeId,
      SHACL.closed,
      null,
    ))[0];
    if (closedIndicator && closedIndicator.value === "true") {
      shape.closed = true;
    }

    //Process properties if it has any
    let properties = await getObjects(shapeStore, nodeShapeId, SHACL.property, null);
    for (let prop of properties) {
      await this.preprocessPropertyShape(shapeStore, prop, shape);
    }

    // process sh:and: just add all IDs to this array
    // Process everything you can find nested in AND clauses
    for (let andList of await getObjects(shapeStore, nodeShapeId, SHACL.and, null)) {
      // Try to process it as a property shape
      //for every andList found, iterate through it and try to preprocess the property shape
      for (let and of await this.rdfListToArray(shapeStore, andList)) {
        await this.preprocessShape(shapeStore, and, shape);
      }
    }
    //Process zero or more sh:xone and sh:or lists in the same way -- explanation in README why they can be handled in the same way
    for (let xoneOrOrList of (await getObjects(
      shapeStore,
      nodeShapeId,
      SHACL.xone,
      null,
    )).concat(await getObjects(shapeStore, nodeShapeId, SHACL.or, null))) {
      let atLeastOneList: Array<ShapeTemplate> = await Promise.all((await this.rdfListToArray(
        shapeStore,
        xoneOrOrList,
      )).map(async (val): Promise<ShapeTemplate> => {
        let newShape = new ShapeTemplate();
        //Create a new shape and process as usual -- but mind that we don't trigger a circular shape here...
        await this.preprocessShape(shapeStore, val, newShape);
        return newShape;
        //Add this one to the shapesgraph
      }));
      shape.atLeastOneLists.push(atLeastOneList);
    }
    //And finally, we're just ignoring sh:not. Don't process this one
  }

  /**
   * Processes all element from an RDF List, or detects it wasn't a list after all and it's just one element.
   * @param shapeStore
   * @param item
   * @returns
   */
  protected async * rdfListToGenerator(
    shapeStore: Store,
    item: Term,
  ): AsyncGenerator<Term> {
    if (
      (await getObjects(
        shapeStore,
        item,
        df.namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#first"),
        null,
      ))[0]
    ) {
      yield (await getObjects(
        shapeStore,
        item,
        df.namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#first"),
        null,
      ))[0];
      let rest = (await getObjects(
        shapeStore,
        item,
        df.namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#rest"),
        null,
      ))[0];
      while (
        rest &&
        rest.value !== "http://www.w3.org/1999/02/22-rdf-syntax-ns#nil"
      ) {
        yield (await getObjects(
          shapeStore,
          rest,
          df.namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#first"),
          null,
        ))[0];
        rest = (await getObjects(
          shapeStore,
          rest,
          df.namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#rest"),
          null,
        ))[0];
      }
    } else {
      // It's not a list. It's just one element.
      yield item;
    }
    return;
  }

  protected async rdfListToArray(shapeStore: Store, item: Term): Promise<Array<Term>> {
    const list: Array<Term> = [];
    for await (const t of this.rdfListToGenerator(shapeStore, item)) {
      list.push(t);
    }
    return list;
  }
}

const getSubjects = async (
  store: Store,
  predicate: Term | null,
  object: Term | null,
  graph?: Term | null,
) => {
  const quadStream = store.match(null, predicate, object, graph);

  return (await streamToArray(quadStream)).map((quad: any) => {
    return quad.subject;
  });
};

const getObjects = async (
  store: Store,
  subject: Term | null,
  predicate: Term | null,
  graph?: Term | null,
) => {
  const quadStream = store.match(subject, predicate, null, graph);
  return (await streamToArray(quadStream)).map((quad: any) => {
    return quad.object;
  });
};
