import rdfDereference, { RdfDereferencer } from "rdf-dereference";
import { NodeLink, RDFMap, ShapesGraph, ShapeTemplate } from "./Shape";
import { Path, PathResult } from "./Path";
import { DataFactory } from "rdf-data-factory";
import { RdfStore } from "rdf-stores";
import { Quad, Term } from "@rdfjs/types";
import debug from "debug";

const log = debug("extract-cbd-shape");

const df = new DataFactory();

class DereferenceNeeded {
  target: string;
  msg?: string;
  constructor(target: string, msg?: string) {
    this.target = target;
    this.msg = msg;
  }
}

type CBDShapeExtractorOptions = {
  fetch?: typeof fetch;
};

/**
 * Usage:
 *  import {ShapeExtractor} from "extract-cbd-shape";
 *  ...
 *  let shapeExtractor = new ShapeExtractor(shape, dereferencer);
 *  let entityquads = await shapeExtractor.extract(store, entity);
 */
export class CBDShapeExtractor {
  dereferencer: RdfDereferencer;
  shapesGraph?: ShapesGraph;

  options: CBDShapeExtractorOptions;

  constructor(
    shapesGraphStore?: RdfStore,
    dereferencer?: RdfDereferencer<Quad>,
    options: Partial<CBDShapeExtractorOptions> = {},
  ) {
    // Assign with default options
    this.options = Object.assign({}, options);

    if (!dereferencer) {
      this.dereferencer = rdfDereference;
    } else {
      this.dereferencer = dereferencer;
    }

    //Pre-process shape
    if (shapesGraphStore) {
      this.shapesGraph = new ShapesGraph(shapesGraphStore);
    }
  }

  public async bulkExtract(
    store: RdfStore,
    ids: Array<Term>,
    shapeId?: Term,
    graphsToIgnore?: Array<Term>,
    itemExtracted?: (member: { subject: Term; quads: Quad[] }) => void,
  ): Promise<Array<{ subject: Term; quads: Quad[] }>> {
    const out: Array<{ subject: Term; quads: Quad[] }> = [];
    const idSet = new Set(ids.map((x) => x.value));

    const memberSpecificQuads: { [id: string]: Array<Quad> } = {};
    for (let id of ids) {
      memberSpecificQuads[id.value] = [];
    }
    const newStore = RdfStore.createDefault();
    for (let quad of store.readQuads(null, null, null, null)) {
      if (quad.graph.termType == "NamedNode" && idSet.has(quad.graph.value)) {
        memberSpecificQuads[quad.graph.value].push(quad);
      } else {
        newStore.addQuad(quad);
      }
    }

    const promises = [];
    for (let id of ids) {
      const promise = this.extract(
        newStore,
        id,
        shapeId,
        (graphsToIgnore || []).slice(),
      ).then((quads) => {
        quads.push(...memberSpecificQuads[id.value]);
        if (itemExtracted) {
          itemExtracted({ subject: id, quads });
        }

        out.push({ subject: id, quads });
      });
      promises.push(promise);
    }

    await Promise.all(promises);

    return out;
  }

  /**
   * Extracts:
   *  * first level quads,
   *  * their blank nodes with their quads (recursively),
   *  * all quads in the namedgraph of this entity,
   *  * all quads of required paths found in the shape
   *  * the same algorithm on top of all found node links
   * @param store The RdfStore loaded with a set of initial quads
   * @param id The entity to be described/extracted
   * @param shapeId The optional SHACL NodeShape identifier
   * @param graphsToIgnore The optional parameter of graph to ignore when other entities are mentioned in the current context
   * @returns Promise of a quad array of the described entity
   */
  public async extract(
    store: RdfStore,
    id: Term,
    shapeId?: Term,
    graphsToIgnore?: Array<Term>,
  ): Promise<Array<Quad>> {
    // First extract everything except for something within the graphs to ignore, or within the graph of the current entity, as that’s going to be added anyway later on
    if (!graphsToIgnore) {
      graphsToIgnore = [];
    }

    const extractInstance = new ExtractInstance(
      store,
      this.dereferencer,
      graphsToIgnore,
      this.options,
      this.shapesGraph,
    );

    return await extractInstance.extract(id, false, shapeId);
  }
}

export type Extracted = {
  forwards: {
    [node: string]: Extracted;
  };
  backwards: {
    [node: string]: Extracted;
  };
};

export type ExtractReasons = {
  cbd: boolean;
  shape: boolean;
};

export class CbdExtracted {
  topology: Extracted;
  cbdExtractedMap: RDFMap<ExtractReasons>;

  constructor(
    topology?: Extracted,
    cbdExtracted: RDFMap<ExtractReasons> = new RDFMap(),
  ) {
    if (topology) {
      this.topology = topology;
    } else {
      this.topology = { forwards: {}, backwards: {} };
    }
    this.cbdExtractedMap = cbdExtracted;
  }

  addCBDTerm(term: Term) {
    const t = this.cbdExtractedMap.get(term);
    if (t) {
      t.cbd = true;
    } else {
      this.cbdExtractedMap.set(term, { cbd: true, shape: false });
    }
  }

  addShapeTerm(term: Term) {
    const t = this.cbdExtractedMap.get(term);
    if (t) {
      t.shape = true;
    } else {
      this.cbdExtractedMap.set(term, { cbd: true, shape: false });
    }
  }

  cbdExtracted(term: Term): boolean {
    return !!this.cbdExtractedMap.get(term)?.shape;
  }

  push(term: Term, inverse: boolean): CbdExtracted {
    if (inverse) {
      if (!this.topology.backwards[term.value]) {
        const ne: Extracted = {
          forwards: {},
          backwards: {},
        };
        ne.forwards[term.value] = this.topology;
        this.topology.backwards[term.value] = ne;
      }
      return new CbdExtracted(
        this.topology.backwards[term.value],
        this.cbdExtractedMap,
      );
    } else {
      if (!this.topology.forwards[term.value]) {
        const ne: Extracted = {
          forwards: {},
          backwards: {},
        };
        ne.backwards[term.value] = this.topology;
        this.topology.forwards[term.value] = ne;
      }
      return new CbdExtracted(
        this.topology.forwards[term.value],
        this.cbdExtractedMap,
      );
    }
  }

  enter(term: Term, inverse: boolean): CbdExtracted | undefined {
    const out = inverse
      ? this.topology.backwards[term.value]
      : this.topology.forwards[term.value];
    if (out) {
      return new CbdExtracted(out, this.cbdExtractedMap);
    }
  }
}

class ExtractInstance {
  dereferenced: Set<string> = new Set();
  store: RdfStore;

  dereferencer: RdfDereferencer;
  options: CBDShapeExtractorOptions;
  graphs: Term [];

  shapesGraph?: ShapesGraph;

  constructor(
    store: RdfStore,
    dereferencer: RdfDereferencer,
    graphsToIgnore: Term[],
    options: CBDShapeExtractorOptions,
    shapesGraph?: ShapesGraph,
  ) {
    this.store = store;
    this.dereferencer = dereferencer;
    this.shapesGraph = shapesGraph;
    //Turn graphs To Ignore into graphs
    this.graphs = store.getQuads()
            //only interested in the graph
            .map((quad) => { return quad.graph })
            // distinct graphs
            .filter((graph, index, array) => {
              return array.indexOf(graph) === index;
            })
            // Now filter on graphs that are not in the graphsToIgnore list
            .filter((graph) => {
              return graphsToIgnore.find((graphToIgnore) => { return graphToIgnore.equals(graph) }) === undefined;
            });
    this.options = options;
  }

  private async dereference(url: string): Promise<boolean> {
    if (this.dereferenced.has(url)) {
      log("Will not dereference " + url + " again");

      return false;
    }
    this.dereferenced.add(url);

    await this.loadQuadStreamInStore(
      (
        await this.dereferencer.dereference(url, {
          fetch: this.options.fetch,
        })
      ).data,
    );
    return true;
  }

  public async extract(
    id: Term,
    offline: boolean,
    shapeId?: Term | ShapeTemplate,
  ) {
    const result = await this.maybeExtractRecursively(
      id,
      new CbdExtracted(),
      offline,
      shapeId,
    );

    result.push(...this.store.getQuads(null, null, null, id));

    if (result.length === 0) {
      if (await this.dereference(id.value)) {
        // retry
        const result = await this.maybeExtractRecursively(
          id,
          new CbdExtracted(),
          offline,
          shapeId,
        );

        return result.filter((value: Quad, index: number, array: Quad[]) => {
          return index === array.findIndex((x) => x.equals(value));
        });
      }
    }

    return result.filter((value: Quad, index: number, array: Quad[]) => {
      return index === array.findIndex((x) => x.equals(value));
    });
  }

  private async maybeExtractRecursively(
    id: Term,
    extracted: CbdExtracted,
    offline: boolean,
    shapeId?: Term | ShapeTemplate,
  ): Promise<Array<Quad>> {
    if (extracted.cbdExtracted(id)) {
      return [];
    }
    extracted.addShapeTerm(id);
    return this.extractRecursively(id, extracted, offline, shapeId);
  }

  private async extractRecursively(
    id: Term,
    extracted: CbdExtracted,
    offline: boolean,
    shapeId?: Term | ShapeTemplate,
  ): Promise<Array<Quad>> {
    const result: Quad[] = [];

    let shape: ShapeTemplate | undefined;
    if (shapeId instanceof ShapeTemplate) {
      shape = shapeId;
    } else if (shapeId && this.shapesGraph) {
      shape = this.shapesGraph.shapes.get(shapeId);
    }

    if (!shape?.closed) {
      this.CBD(id, result, extracted, this.graphs);
    }

    // Next, on our newly fetched data,
    // we’ll need to process all paths of the shape. If the shape is open, we’re going to do CBD afterwards, so let’s omit paths with only a PredicatePath when the shape is open
    if (!!shape) {
      //For all valid items in the atLeastOneLists, process the required path, optional paths and nodelinks. Do the same for the atLeastOneLists inside these options.
      let extraPaths: Path[] = [];
      let extraNodeLinks: NodeLink[] = [];

      // Process atLeastOneLists in extraPaths and extra NodeLinks
      shape.fillPathsAndLinks(extraPaths, extraNodeLinks);

      for (let path of shape.requiredPaths.concat(
        shape.optionalPaths,
        extraPaths,
      )) {
        if (!path.found(extracted) || shape.closed) {
          let pathQuads = path
            .match(this.store, extracted, id, this.graphs)
            .flatMap((pathResult) => {
              return pathResult.path;
            });

          result.push(...pathQuads);
        }
      }

      for (let nodeLink of shape.nodeLinks.concat(extraNodeLinks)) {
        let matches = nodeLink.pathPattern.match(
          this.store,
          extracted,
          id,
          this.graphs,
        );

        // I don't know how to do this correctly, but this is not the way
        for (let match of matches) {
          result.push(
            ...(await this.maybeExtractRecursively(
              match.target,
              match.cbdExtracted,
              offline,
              nodeLink.link,
            )),
          );
        }
      }
    }

    if (!offline && id.termType === "NamedNode") {
      if (shape) {
        const problems = shape.requiredAreNotPresent(extracted);
        if (problems) {
          if (await this.dereference(id.value)) {
            // retry
            return this.extractRecursively(id, extracted, offline, shapeId);
          } else {
            log(
              `${
                id.value
              } does not adhere to the shape (${problems.toString()})`,
            );
          }
        }
      }
    }

    return result;
  }

  /**
   * Performs Concise Bounded Description: extract star-shape and recurses over the blank nodes
   * @param result list of quads
   * @param extractedStar topology object to keep track of already found properties
   * @param store store to use for cbd
   * @param id starting subject
   * @param graphsToIgnore
   */
  private async CBD(
    id: Term,
    result: Quad[],
    extractedStar: CbdExtracted,
    graphs: Array<Term>,
  ) {
    extractedStar.addCBDTerm(id);
    let quads : Quad[] = [];
    if (graphs) {
      for (const graph of graphs) { 
        quads = quads.concat(this.store.getQuads(id, null, null, graph));
      }
    } else {
      //search all graphs if graphs is not set
      quads = this.store.getQuads(id, null, null, null)
    }

    for (const q of quads) {
      result.push(q);

      const next = extractedStar.push(q.predicate, false);

      // Conditionally get more quads: if it’s a not yet extracted blank node
      if (
        q.object.termType === "BlankNode" &&
        !extractedStar.cbdExtracted(q.object)
      ) {
        await this.CBD(q.object, result, next, graphs);
      }
    }
  }

  private loadQuadStreamInStore(quadStream: any) {
    return new Promise((resolve, reject) => {
      this.store.import(quadStream).on("end", resolve).on("error", reject);
    });
  }
}
