import { rdfDereferencer, RdfDereferencer } from "rdf-dereference";
import { NodeLink, RDFMap, ShapeTemplate } from "./Shape";
import { GraphFilter, Path, PathResult } from "./Path";
import { DataFactory } from "rdf-data-factory";
import { Quad, Term, Store } from "@rdfjs/types";
import debug from "debug";
import { ShapesGraph } from "./ShapesGraph";
import { streamToArray, uniqueQuads } from "./Utils";

const log = debug("extract-cbd-shape");

const df = new DataFactory();

// As in { RdfStore } from "rdf-stores" 
export interface SyncStore extends Store {
   getQuads(subject?: Term | null, predicate?: Term | null, object?: Term | null, graph?: Term | null): Quad[];
}

// As in { Quadstore } from "quadstore"
export interface AsyncStore extends Store {
   get(pattern: { subject?: Term | null, predicate?: Term | null, object?: Term | null, graph?: Term | null }): Promise<{ items: Quad[] }>;
}

type CBDShapeExtractorOptions = {
   cbdDefaultGraph: boolean;
   bulkConcurrency?: number;
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
   shapesGraphStore?: Store;
   private shapesGraph?: ShapesGraph;
   private shapesGraphPromise?: Promise<ShapesGraph>;

   options: CBDShapeExtractorOptions;

   constructor(
      shapesGraphStore?: Store,
      dereferencer?: RdfDereferencer<Quad>,
      options: Partial<CBDShapeExtractorOptions> = {},
   ) {
      // Assign with default options
      this.options = Object.assign({ cbdDefaultGraph: false }, options);

      if (!dereferencer) {
         this.dereferencer = rdfDereferencer;
      } else {
         this.dereferencer = dereferencer;
      }

      //Pre-process shape
      if (shapesGraphStore) {
         this.shapesGraphStore = shapesGraphStore;
      }
   }

   public async bulkExtract(
      store: Store,
      ids: Array<Term>,
      shapeId?: Term,
      graphsToIgnore?: Array<Term>,
      itemExtracted?: (member: { subject: Term; quads: Quad[] }) => void,
   ): Promise<Array<{ subject: Term; quads: Quad[] }>> {
      const out = new Array<{ subject: Term; quads: Quad[] }>(ids.length);
      const explicitlyIgnoredGraphs = new Set(
         (graphsToIgnore || []).map((term) => term.value),
      );
      const memberGraphs = new Set<string>();
      for (const id of ids) {
         if (id.termType === "NamedNode") {
            memberGraphs.add(id.value);
         }
      }

      let nextIndex = 0;
      const worker = async () => {
         while (true) {
            const index = nextIndex++;
            if (index >= ids.length) {
               return;
            }

            const id = ids[index];
            const ignoredGraphs: GraphFilter = {
               has: (graph) =>
                  explicitlyIgnoredGraphs.has(graph) ||
                  (graph !== id.value && memberGraphs.has(graph)),
            };
            const quads = await this.extractWithIgnoredGraphs(
               store,
               id,
               shapeId,
               ignoredGraphs,
            );
            if (itemExtracted) {
               itemExtracted({ subject: id, quads });
            }
            out[index] = { subject: id, quads };
         }
      };

      const requestedConcurrency = this.options.bulkConcurrency ??
         ("getQuads" in store ? 1 : 8);
      const concurrency = requestedConcurrency === Number.POSITIVE_INFINITY
         ? ids.length
         : Number.isFinite(requestedConcurrency) && requestedConcurrency > 0
            ? Math.max(1, Math.floor(requestedConcurrency))
            : 1;
      const workerCount = Math.min(
         ids.length,
         concurrency,
      );
      await Promise.all(Array.from({ length: workerCount }, worker));

      return out;
   }

   /**
    * Extracts:
    *  * first level quads,
    *  * their blank nodes with their quads (recursively),
    *  * all quads in the namedgraph of this entity,
    *  * all quads of required paths found in the shape
    *  * the same algorithm on top of all found node links
    * @param store The Store loaded with a set of initial quads
    * @param id The entity to be described/extracted
    * @param shapeId The optional SHACL NodeShape identifier
    * @param graphsToIgnore The optional parameter of graph to ignore when other entities are mentioned in the current context
    * @returns Promise of a quad array of the described entity
    */
   public async extract(
      store: Store,
      id: Term,
      shapeId?: Term,
      graphsToIgnore?: Array<Term>,
   ): Promise<Array<Quad>> {
      // First extract everything except for something within the graphs to ignore, or within the graph of the current entity, as that’s going to be added anyway later on
      const dontExtractFromGraph = new Set(
         (graphsToIgnore || []).map((item) => item.value),
      );

      return this.extractWithIgnoredGraphs(
         store,
         id,
         shapeId,
         dontExtractFromGraph,
      );
   }

   private async extractWithIgnoredGraphs(
      store: Store,
      id: Term,
      shapeId: Term | undefined,
      graphsToIgnore: GraphFilter,
   ): Promise<Array<Quad>> {

      if (!this.shapesGraph && this.shapesGraphStore) {
         this.shapesGraphPromise ??= ShapesGraph.fromStore(this.shapesGraphStore);
         this.shapesGraph = await this.shapesGraphPromise;
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
         this.cbdExtractedMap.set(term, { cbd: false, shape: true });
      }
   }

   cbdExtracted(term: Term): boolean {
      return !!this.cbdExtractedMap.get(term)?.cbd;
   }

   shapeExtracted(term: Term): boolean {
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
   store: Store;

   dereferencer: RdfDereferencer;
   options: CBDShapeExtractorOptions;
   graphsToIgnore: GraphFilter;

   shapesGraph?: ShapesGraph;

   constructor(
      store: Store,
      dereferencer: RdfDereferencer,
      graphsToIgnore: GraphFilter,
      options: CBDShapeExtractorOptions,
      shapesGraph?: ShapesGraph,
   ) {
      this.store = store;
      this.dereferencer = dereferencer;
      this.shapesGraph = shapesGraph;
      this.graphsToIgnore = graphsToIgnore;
      this.options = options;
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

      const store = this.store as Store | SyncStore | AsyncStore;
      if ('getQuads' in store) {
         result.push(...store.getQuads(null, null, null, id));
      } else if ('get' in store) {
         result.push(...(await store.get({ graph: id })).items);
      } else {
         result.push(...await streamToArray(store.match(null, null, null, id)));
      }

      if (result.length === 0) {
         if (await this.dereference(id.value)) {
            // retry
            const result = await this.maybeExtractRecursively(
               id,
               new CbdExtracted(),
               offline,
               shapeId,
            );

            return uniqueQuads(result);
         }
      }

      return uniqueQuads(result);
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

   private async maybeExtractRecursively(
      id: Term,
      extracted: CbdExtracted,
      offline: boolean,
      shapeId?: Term | ShapeTemplate,
   ): Promise<Array<Quad>> {
      if (extracted.shapeExtracted(id)) {
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
         await this.CBD(id, result, extracted, this.graphsToIgnore);
      }

      // Next, on our newly fetched data,
      // we’ll need to process all paths of the shape. If the shape is open, we’re going to do CBD afterwards, so let’s omit paths with only a PredicatePath when the shape is open
      if (!!shape) {
         //For all valid items in the atLeastOneLists, process the required path, optional paths and nodelinks. Do the same for the atLeastOneLists inside these options.
         let extraPaths: Path[] = [];
         let extraNodeLinks: NodeLink[] = [];
         const pathMatches = new Map<Path, PathResult[]>();

         // Process atLeastOneLists in extraPaths and extra NodeLinks
         shape.fillPathsAndLinks(extraPaths, extraNodeLinks);

         for (let path of shape.requiredPaths.concat(
            shape.optionalPaths,
            extraPaths,
         )) {
            if (!path.found(extracted) || shape.closed) {
               let pathResult = await path.match(this.store, extracted, id, this.graphsToIgnore);
               pathMatches.set(path, pathResult);
               let pathQuads = pathResult.flatMap((pathRes: any) => {
                  return pathRes.path;
               });

               result.push(...pathQuads);
            }
         }

         for (let nodeLink of shape.nodeLinks.concat(extraNodeLinks)) {
            let matches = pathMatches.get(nodeLink.pathPattern);
            if (!matches) {
               matches = await nodeLink.pathPattern.match(
                  this.store,
                  extracted,
                  id,
                  this.graphsToIgnore,
               );
            }

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
                     `${id.value
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
      graphsToIgnore: GraphFilter,
   ) {
      extractedStar.addCBDTerm(id);
      const graph = this.options.cbdDefaultGraph ? df.defaultGraph() : null;

      const store = this.store as Store | SyncStore | AsyncStore;
      let quads: Quad[];
      if ('getQuads' in store) {
         quads = store.getQuads(id, null, null, graph);
      } else if ('get' in store) {
         quads = (await store.get({ subject: id, graph })).items;
      } else {
         quads = await streamToArray(store.match(id, null, null, graph));
      }

      for (const q of quads) {
         // Ignore quads in the graphs to ignore
         if (graphsToIgnore.has(q.graph.value)) {
            continue;
         }
         result.push(q);

         const next = extractedStar.push(q.predicate, false);

         // Conditionally get more quads: if it’s a not yet extracted blank node
         if (
            q.object.termType === "BlankNode" &&
            !extractedStar.cbdExtracted(q.object)
         ) {
            await this.CBD(q.object, result, next, graphsToIgnore);
         }
      }
   }

   private loadQuadStreamInStore(quadStream: any) {
      return new Promise((resolve, reject) => {
         this.store.import(quadStream).on("end", resolve).on("error", reject);
      });
   }
}
