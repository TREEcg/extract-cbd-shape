import rdfDereference, { RdfDereferencer } from "rdf-dereference";
import { NodeLink, RDFMap, ShapesGraph, ShapeTemplate } from "./Shape";
import { Path, PathResult } from "./Path";
import { BlankNode, DefaultGraph } from "n3";
import { RdfStore } from "rdf-stores";
import { Quad, Term } from "@rdfjs/types";

class DereferenceNeeded {
  target: string;
  msg?: string;
  constructor(target: string, msg?: string) {
    this.target = target;
    this.msg = msg;
  }
}

type CBDShapeExtractorOptions = {
  cbdDefaultGraph: boolean;
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
    this.options = {
      cbdDefaultGraph: options.cbdDefaultGraph || false,
    };
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

  loadQuadStreamInStore(store: RdfStore, quadStream: any) {
    return new Promise((resolve, reject) => {
      store.import(quadStream).on("end", resolve).on("error", reject);
    });
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
    //First extract everything except for something within the graphs to ignore, or within the graph of the current entity, as that’s going to be added anyway later on
    let dontExtractFromGraph: Array<string> = (
      graphsToIgnore ? graphsToIgnore : []
    ).map((item) => {
      return item.value;
    });

    const dereferenced: string[] = [];
    const dereferenceAndRetry: (
      target: string,
      msg?: string,
    ) => Promise<Quad[]> = async (target: string, msg?: string) => {
      const ms = msg ? ` (${msg})` : "";
      console.error("Maybe dereferencing " + target + ms);
      if (dereferenced.indexOf(target) == -1) {
        dereferenced.push(target);
        await this.loadQuadStreamInStore(
          store,
          (await this.dereferencer.dereference(target)).data,
        );

        return await tryExtract();
      } else {
        throw "Already dereferenced " + target + " won't dereference again";
      }
    };

    const tryExtract: () => Promise<Quad[]> = async () => {
      const result: Quad[] = [];
      try {
        const cbdExtracted = new CbdExtracted();
        await this.extractRecursively(
          store,
          id,
          cbdExtracted,
          dontExtractFromGraph,
          result,
          false,
          shapeId,
        );

        // also add the quads where the named graph matches the current id
        result.push(...store.getQuads(null, null, null, id));

        if (result.length === 0) {
          return await dereferenceAndRetry(id.value, "no quads found at all");
        }
      } catch (ex) {
        if (ex instanceof DereferenceNeeded) {
          return await dereferenceAndRetry(ex.target, ex.msg);
        }
        throw ex;
      }
      return result;
    };

    const result = await tryExtract();

    //When returning the quad array, remove duplicate triples as CBD, required properties, etc. could have added multiple times the same triple
    return result.filter((value: Quad, index: number, array: Quad[]) => {
      return index === array.findIndex((x) => x.equals(value));
    });
  }

  /**
   * Fills the extraPaths and extraNodeLinks parameters with the ones from valid items in the atLeastOneLists
   */
  private recursivelyProcessAtLeastOneLists(
    extracted: CbdExtracted,
    shape: ShapeTemplate,
    extraPaths: Array<Path>,
    extraNodeLinks: Array<NodeLink>,
  ) {
    for (let list of shape.atLeastOneLists) {
      for (let item of list) {
        extraPaths.push(...item.requiredPaths);
        extraPaths.push(...item.optionalPaths);
        extraNodeLinks.push(...item.nodeLinks);
        this.recursivelyProcessAtLeastOneLists(
          extracted,
          item,
          extraPaths,
          extraNodeLinks,
        );
      }
    }
  }

  private async extractRecursively(
    store: RdfStore,
    id: Term,
    extracted: CbdExtracted,
    graphsToIgnore: Array<string>,
    result: Quad[],
    offline: boolean,
    shapeId?: Term | ShapeTemplate,
  ): Promise<void> {
    //If it has already been extracted, don’t extract it again: prevents cycles
    if (extracted.cbdExtracted(id)) {
      return;
    }
    extracted.addShapeTerm(id);

    let shape: ShapeTemplate | undefined;
    if (shapeId instanceof ShapeTemplate) {
      shape = shapeId;
    } else if (shapeId && this.shapesGraph) {
      shape = this.shapesGraph.shapes.get(shapeId);
    }

    //Perform CBD and we’re done, except on the condition there’s a shape defined and it’s closed
    if (!(shape && shape.closed)) {
      this.CBD(result, extracted, store, id, graphsToIgnore);
    }

    // First, let’s check whether we need to do an HTTP request:
    //  -- first, this id:Term needs to be an instanceof NamedNode - because otherwise we have nothing to dereference
    //  --- Next, we can check the required paths
    //  ----If all paths are set, only then we should also check the atLeastOneLists and check whether it contains a list where none items have set their required properties.

    // Next, on our newly fetched data,
    // we’ll need to process all paths of the shape. If the shape is open, we’re going to do CBD afterwards, so let’s omit paths with only a PredicatePath when the shape is open
    if (!!shape) {
      let visited: Quad[] = [];
      //For all valid items in the atLeastOneLists, process the required path, optional paths and nodelinks. Do the same for the atLeastOneLists inside these options.
      let extraPaths: Path[] = [];
      let extraNodeLinks: NodeLink[] = [];

      //Process atLeastOneLists in extraPaths and extra NodeLinks
      this.recursivelyProcessAtLeastOneLists(
        extracted,
        shape,
        extraPaths,
        extraNodeLinks,
      );

      for (let path of shape.requiredPaths.concat(
        shape.optionalPaths,
        extraPaths,
      )) {
        if (!path.found(extracted) || shape.closed) {
          let pathQuads = path
            .match(store, extracted, id, graphsToIgnore)
            .map((pathResult: PathResult) => {
              //if the shape is open and thus CBD is going to take place, remove the first element from the quads list of the matches, if the subject of that first item is the focusnode (otherwise the first element was a reverse path)
              if (
                !shape!.closed &&
                pathResult.path[0].subject.value === id.value
              ) {
                pathResult.path.shift();
              }
              return pathResult.path;
            })
            .flat()
            .filter((quad) => {
              //Make sure we don’t add quads multiple times
              if (!visited.find((x) => x.equals(quad))) {
                visited.push(quad);
                return true;
              }

              return false;
            });

          result.push(...pathQuads); //concat all quad paths in the results
        }
      }

      for (let nodeLink of shape.nodeLinks.concat(extraNodeLinks)) {
        let matches = nodeLink.pathPattern.match(
          store,
          extracted,
          id,
          graphsToIgnore,
        );

        // I don't know how to do this correctly, but this is not the way
        for (let match of matches) {
          await this.extractRecursively(
            store,
            match.target,
            match.cbdExtracted,
            graphsToIgnore,
            result,
            offline,
            nodeLink.link,
          );
        }

        let pathQuads = Array.from(
          nodeLink.pathPattern.match(store, extracted, id, graphsToIgnore),
        )
          .map((pathResult: PathResult) => {
            //if the shape is open and thus CBD is going to take place, remove the first element from the quads list of the matches, if the subject of that first item is the focusnode (otherwise the first element was a reverse path)
            if (
              !shape?.closed &&
              pathResult.path[0].subject.value === id.value
            ) {
              pathResult.path.shift();
            }
            return pathResult.path;
          })
          .flat()
          .filter((quad) => {
            //Make sure we don’t add quads multiple times
            //There must be a more efficient solution to making sure there’s only one of each triple...
            if (!visited.find((x) => x.equals(quad))) {
              visited.push(quad);
              return true;
            }
            return false;
          });

        result.push(...pathQuads); //concat all quad paths in the results
      }
    }

    if (!offline && id.termType === "NamedNode" && shape) {
      //Check required paths and lazy evaluate the atLeastOneLists
      const problems = shape.requiredAreNotPresent(extracted);
      if (problems) {
        throw new DereferenceNeeded(
          id.value,
          `not all paths are found (${problems.toString()})`,
        );
      }
    }
  }

  /**
   * Performs Concise Bounded Description: extract star-shape and recurses over the blank nodes
   * @param result
   * @param store
   * @param id
   * @param extracted
   */
  public async CBD(
    result: Quad[],
    extractedStar: CbdExtracted,
    store: RdfStore,
    id: Term,
    graphsToIgnore: Array<string>,
  ) {
    extractedStar.addCBDTerm(id);
    const graph = this.options.cbdDefaultGraph ? new DefaultGraph() : null;
    const quads = store.getQuads(id, null, null, graph);

    //Iterate over the quads, add them to the result and check whether we should further get other quads based on blank nodes or the SHACL shape
    for (const q of quads) {
      //ignore quads in the graphs to ignore
      if (graphsToIgnore?.includes(q.graph.value)) {
        continue;
      }
      result.push(q);

      const next = extractedStar.push(q.predicate, false);

      // Conditionally get more quads: if it’s a not yet extracted blank node
      if (
        q.object instanceof BlankNode &&
        !extractedStar.cbdExtracted(q.object)
      ) {
        //only perform CBD again recursively on the blank node
        await this.CBD(result, next, store, q.object, graphsToIgnore);
      }
    }

    //Should we also take into account RDF* and/or RDF reification systems here?
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
