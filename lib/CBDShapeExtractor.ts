import { rdfDereferencer, RdfDereferencer } from "rdf-dereference";
import { RDFMap, ShapeError, ShapeTemplate } from "./Shape";
import { GraphFilter, Path, PathResult } from "./Path";
import { DataFactory } from "rdf-data-factory";
import { Quad, Term, Store } from "@rdfjs/types";
import debug from "debug";
import { ShapesGraph } from "./ShapesGraph";
import { streamToArray, uniqueQuads } from "./Utils";

const log = debug("extract-cbd-shape");

const df = new DataFactory();
const EMPTY_GRAPH_FILTER: GraphFilter = {
   has: () => false,
};

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

      // One probe for the whole page beats one lookup per focus node
      const knownGraphs = graphNamesOf(store, ids.length);
      await this.loadShapesGraph();

      let nextIndex = 0;
      const worker = async () => {
         // A worker handles one member at a time, so it can carry its filter and
         // its extraction state from member to member instead of reallocating
         const ignoredGraphs = new MemberGraphFilter(
            explicitlyIgnoredGraphs,
            memberGraphs,
         );
         const instance = new ExtractInstance(
            store,
            this.dereferencer,
            ignoredGraphs,
            this.options,
            this.shapesGraph,
            knownGraphs,
         );

         while (true) {
            const index = nextIndex++;
            if (index >= ids.length) {
               return;
            }

            const id = ids[index];
            ignoredGraphs.member = id.value;
            instance.reset();
            const quads = await instance.extract(id, false, shapeId);
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
      const dontExtractFromGraph = graphsToIgnore?.length
         ? new Set(graphsToIgnore.map((item) => item.value))
         : EMPTY_GRAPH_FILTER;

      return this.extractWithIgnoredGraphs(
         store,
         id,
         shapeId,
         dontExtractFromGraph,
      );
   }

   private async loadShapesGraph(): Promise<void> {
      if (!this.shapesGraph && this.shapesGraphStore) {
         this.shapesGraphPromise ??= ShapesGraph.fromStore(this.shapesGraphStore);
         this.shapesGraph = await this.shapesGraphPromise;
      }
   }

   private async extractWithIgnoredGraphs(
      store: Store,
      id: Term,
      shapeId: Term | undefined,
      graphsToIgnore: GraphFilter,
      knownGraphs?: GraphNameHint,
   ): Promise<Array<Quad>> {
      await this.loadShapesGraph();

      const extractInstance = new ExtractInstance(
         store,
         this.dereferencer,
         graphsToIgnore,
         this.options,
         this.shapesGraph,
         knownGraphs,
      );

      return await extractInstance.extract(id, false, shapeId);
   }
}

/**
 * Keeps one member's quads out of another member's description: every other
 * member's graph is ignored, as are the graphs the caller asked us to skip.
 * Reused across the members a bulk worker handles, so that the hot loop does not
 * allocate a closure per member.
 */
class MemberGraphFilter implements GraphFilter {
   member = "";

   constructor(
      private readonly explicitlyIgnored: Set<string>,
      private readonly memberGraphs: Set<string>,
   ) { }

   has(graph: string): boolean {
      return (
         this.explicitlyIgnored.has(graph) ||
         (graph !== this.member && this.memberGraphs.has(graph))
      );
   }
}

/**
 * A probed answer, shared by every extraction of one bulk run so that a
 * dereference by any of them invalidates it for all.
 */
type GraphNameHint = { names?: Set<string> };

/**
 * Best effort list of the graph names a store holds, so focus nodes that cannot
 * name a graph are never looked up.
 *
 * Returns undefined when the store has no cheap way of telling us, or when the
 * answer would not pay for itself, in which case every candidate is looked up as
 * before. Building the list costs one entry per graph and saves at most one
 * lookup per focus node, so it is only worth it for a page whose members are not
 * each in their own graph.
 */
function graphNamesOf(store: Store, focusNodes: number): GraphNameHint | undefined {
   const indexed = store as Store & {
      getDistinctTerms?: (terms: string[]) => Term[][];
      countDistinctTerms?: (terms: string[]) => number;
   };
   if (
      typeof indexed.getDistinctTerms !== "function" ||
      typeof indexed.countDistinctTerms !== "function"
   ) {
      return undefined;
   }
   try {
      // Counting is near free, listing is not
      if (indexed.countDistinctTerms(["graph"]) * 8 > focusNodes) {
         return undefined;
      }
      const names = new Set<string>();
      for (const terms of indexed.getDistinctTerms(["graph"])) {
         const graph = terms[0];
         if (graph && graph.termType !== "DefaultGraph") {
            names.add(graph.termType + ":" + graph.value);
         }
      }
      return { names };
   } catch {
      // A store that does not support the probe just keeps the old behaviour
      return undefined;
   }
}

export type Extracted = {
   forwards: {
      [node: string]: Extracted;
   };
   backwards: {
      [node: string]: Extracted;
   };
   /**
    * The CbdExtracted that wraps this node, cached so that walking the topology
    * does not allocate. Safe because a topology belongs to a single extraction,
    * and therefore to a single cbdExtractedMap.
    */
   wrapper?: CbdExtracted;
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
      this.topology.wrapper ??= this;
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

   private wrap(node: Extracted): CbdExtracted {
      return (node.wrapper ??= new CbdExtracted(node, this.cbdExtractedMap));
   }

   push(term: Term, inverse: boolean): CbdExtracted {
      const from = inverse ? this.topology.backwards : this.topology.forwards;
      let next = from[term.value];
      if (!next) {
         next = { forwards: {}, backwards: {} };
         (inverse ? next.forwards : next.backwards)[term.value] = this.topology;
         from[term.value] = next;
      }
      return this.wrap(next);
   }

   enter(term: Term, inverse: boolean): CbdExtracted | undefined {
      const out =
         (inverse ? this.topology.backwards : this.topology.forwards)[term.value];
      if (out) {
         return this.wrap(out);
      }
   }
}

class ExtractInstance {
   dereferenced: Set<string> = new Set();
   includedGraphs: Set<string> = new Set();
   store: Store;

   dereferencer: RdfDereferencer;
   options: CBDShapeExtractorOptions;
   graphsToIgnore: GraphFilter;

   shapesGraph?: ShapesGraph;

   /**
    * The graph names the store is known to contain, when the store could tell
    * us cheaply. Undefined means: look it up for every candidate.
    */
   knownGraphs?: GraphNameHint;

   constructor(
      store: Store,
      dereferencer: RdfDereferencer,
      graphsToIgnore: GraphFilter,
      options: CBDShapeExtractorOptions,
      shapesGraph?: ShapesGraph,
      knownGraphs?: GraphNameHint,
   ) {
      this.store = store;
      this.dereferencer = dereferencer;
      this.shapesGraph = shapesGraph;
      this.graphsToIgnore = graphsToIgnore;
      this.options = options;
      this.knownGraphs = knownGraphs;
   }

   /**
    * Forgets what was extracted for the previous entity, so that the instance
    * can be reused for the next one.
    */
   reset() {
      this.dereferenced.clear();
      this.includedGraphs.clear();
   }

   public async extract(
      id: Term,
      offline: boolean,
      shapeId?: Term | ShapeTemplate,
   ) {
      const extracted = new CbdExtracted();
      const result: Quad[] = [];
      // Each step returns undefined when it finished synchronously; awaiting that
      // would still cost a microtask, so only a real promise is awaited
      const walk = this.maybeExtractRecursively(
         id,
         result,
         extracted,
         offline,
         shapeId,
      );
      if (walk) {
         await walk;
      }

      // The named graph of the entity itself is always part of the description,
      // even when a closed shape prevented CBD from running.
      const graphQuads = this.includeNamedGraph(
         id,
         result,
         extracted,
         EMPTY_GRAPH_FILTER,
      );
      if (graphQuads) {
         await graphQuads;
      }

      if (result.length === 0) {
         if (await this.dereference(id.value)) {
            // retry, now that the store holds the dereferenced data
            const retry = this.maybeExtractRecursively(
               id,
               result,
               new CbdExtracted(),
               offline,
               shapeId,
            );
            if (retry) {
               await retry;
            }
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
      // The store grew, so what we knew about its graphs no longer holds. The
      // hint is shared, so every member of a bulk run stops trusting it too.
      if (this.knownGraphs) {
         this.knownGraphs.names = undefined;
      }
      this.includedGraphs.clear();
      return true;
   }

   private maybeExtractRecursively(
      id: Term,
      result: Quad[],
      extracted: CbdExtracted,
      offline: boolean,
      shapeId?: Term | ShapeTemplate,
   ): Promise<void> | undefined {
      if (extracted.shapeExtracted(id)) {
         return;
      }
      extracted.addShapeTerm(id);
      return this.extractRecursively(id, result, extracted, offline, shapeId);
   }

   private extractRecursively(
      id: Term,
      result: Quad[],
      extracted: CbdExtracted,
      offline: boolean,
      shapeId?: Term | ShapeTemplate,
   ): Promise<void> | undefined {
      let shape: ShapeTemplate | undefined;
      if (shapeId instanceof ShapeTemplate) {
         shape = shapeId;
      } else if (shapeId && this.shapesGraph) {
         shape = this.shapesGraph.shapes.get(shapeId);
      }

      if (!shape?.closed) {
         // Without a shape nothing ever reads the topology, so do not build it
         const cbd = this.CBD(
            id,
            result,
            extracted,
            this.graphsToIgnore,
            !!shape,
         );
         if (cbd) {
            return cbd.then(() =>
               this.applyShape(id, result, extracted, offline, shape, shapeId),
            );
         }
      }
      return this.applyShape(id, result, extracted, offline, shape, shapeId);
   }

   /**
    * Everything the shape adds on top of CBD. Returns undefined when the shape
    * asks nothing that is not already extracted, which is the common case once
    * CBD has run and is what keeps a synchronous store on a synchronous path.
    */
   private applyShape(
      id: Term,
      result: Quad[],
      extracted: CbdExtracted,
      offline: boolean,
      shape: ShapeTemplate | undefined,
      shapeId?: Term | ShapeTemplate,
   ): Promise<void> | undefined {
      if (!shape) {
         return;
      }

      let matchingNeeded = shape.selectedNodeLinks().length > 0;
      if (!matchingNeeded) {
         for (const path of shape.selectedPaths()) {
            if (!path.found(extracted) || shape.closed) {
               matchingNeeded = true;
               break;
            }
         }
      }
      if (matchingNeeded) {
         return this.matchShape(id, result, extracted, offline, shape, shapeId);
      }

      // Nothing left to walk, only the conformance check
      if (offline || id.termType !== "NamedNode") {
         return;
      }
      const problems = shape.requiredAreNotPresent(extracted);
      if (!problems) {
         return;
      }
      return this.retryAfterDereference(
         id,
         result,
         extracted,
         offline,
         shapeId,
         problems,
      );
   }

   private async matchShape(
      id: Term,
      result: Quad[],
      extracted: CbdExtracted,
      offline: boolean,
      shape: ShapeTemplate,
      shapeId?: Term | ShapeTemplate,
   ): Promise<void> {
      //For all valid items in the atLeastOneLists, process the required path, optional paths and nodelinks. Do the same for the atLeastOneLists inside these options.
      const pathMatches = new Map<Path, PathResult[]>();

      for (const path of shape.selectedPaths()) {
         if (!path.found(extracted) || shape.closed) {
            const pathResult = await path.match(
               this.store,
               extracted,
               id,
               this.graphsToIgnore,
            );
            pathMatches.set(path, pathResult);
            for (const pathRes of pathResult) {
               for (const quad of pathRes.path) {
                  result.push(quad);
               }
            }
         }
      }

      for (const nodeLink of shape.selectedNodeLinks()) {
         let matches = pathMatches.get(nodeLink.pathPattern);
         if (!matches) {
            matches = await nodeLink.pathPattern.match(
               this.store,
               extracted,
               id,
               this.graphsToIgnore,
            );
         }

         for (const match of matches) {
            const linked = this.maybeExtractRecursively(
               match.target,
               result,
               match.cbdExtracted,
               offline,
               nodeLink.link,
            );
            if (linked) {
               await linked;
            }
         }
      }

      if (!offline && id.termType === "NamedNode") {
         const problems = shape.requiredAreNotPresent(extracted);
         if (problems) {
            await this.retryAfterDereference(
               id,
               result,
               extracted,
               offline,
               shapeId,
               problems,
            );
         }
      }
   }

   private async retryAfterDereference(
      id: Term,
      result: Quad[],
      extracted: CbdExtracted,
      offline: boolean,
      shapeId: Term | ShapeTemplate | undefined,
      problems: ShapeError,
   ): Promise<void> {
      if (await this.dereference(id.value)) {
         const retry = this.extractRecursively(
            id,
            result,
            extracted,
            offline,
            shapeId,
         );
         if (retry) {
            await retry;
         }
      } else {
         log(`${id.value} does not adhere to the shape (${problems.toString()})`);
      }
   }

   /**
    * Performs Concise Bounded Description: extract star-shape and recurses over the blank nodes
    * @param result list of quads
    * @param extractedStar topology object to keep track of already found properties
    * @param store store to use for cbd
    * @param id starting subject
    * @param graphsToIgnore
    */
   private CBD(
      id: Term,
      result: Quad[],
      extractedStar: CbdExtracted,
      graphsToIgnore: GraphFilter,
      trackTopology: boolean,
   ): Promise<void> | undefined {
      extractedStar.addCBDTerm(id);
      const graph = this.options.cbdDefaultGraph ? df.defaultGraph() : null;

      const matched = this.matchQuads(id, graph);
      if (Array.isArray(matched)) {
         return this.cbdQuads(
            matched,
            0,
            id,
            result,
            extractedStar,
            graphsToIgnore,
            trackTopology,
         );
      }
      return matched.then((quads) =>
         this.cbdQuads(
            quads,
            0,
            id,
            result,
            extractedStar,
            graphsToIgnore,
            trackTopology,
         ),
      );
   }

   /**
    * The body of CBD, resumable from an index so that an asynchronous store can
    * pick the loop back up where it left off without the whole walk being async.
    */
   private cbdQuads(
      quads: Quad[],
      from: number,
      id: Term,
      result: Quad[],
      extractedStar: CbdExtracted,
      graphsToIgnore: GraphFilter,
      trackTopology: boolean,
   ): Promise<void> | undefined {
      for (let i = from; i < quads.length; i++) {
         const q = quads[i];
         // Ignore quads in the graphs to ignore
         if (graphsToIgnore.has(q.graph.value)) {
            continue;
         }
         result.push(q);

         const next = trackTopology
            ? extractedStar.push(q.predicate, false)
            : extractedStar;

         // Conditionally get more quads: if it’s a not yet extracted blank node
         if (
            q.object.termType === "BlankNode" &&
            !extractedStar.cbdExtracted(q.object)
         ) {
            const pending = this.CBD(
               q.object,
               result,
               next,
               graphsToIgnore,
               trackTopology,
            );
            if (pending) {
               const resume = i + 1;
               return pending.then(() =>
                  this.cbdQuads(
                     quads,
                     resume,
                     id,
                     result,
                     extractedStar,
                     graphsToIgnore,
                     trackTopology,
                  ),
               );
            }
         }
      }

      // Every focus node – including a blank node we recursed into – also brings
      // along the named graph it names.
      return this.includeNamedGraph(id, result, extractedStar, graphsToIgnore);
   }

   /**
    * Adds all quads of the named graph identified by the focus node, and
    * recurses over the blank nodes mentioned in there. The graph identifier can
    * be a blank node as well.
    *
    * Returns undefined when there is nothing to do, so that callers can skip the
    * await: most focus nodes do not name a graph, and this runs for every one.
    * @param id the focus node, which doubles as the graph name
    * @param result list of quads
    * @param extractedStar topology object to keep track of already found properties
    * @param graphsToIgnore
    */
   private includeNamedGraph(
      id: Term,
      result: Quad[],
      extractedStar: CbdExtracted,
      graphsToIgnore: GraphFilter,
   ): Promise<void> | undefined {
      if (id.termType !== "NamedNode" && id.termType !== "BlankNode") {
         return;
      }
      const known = this.knownGraphs?.names;
      if (known !== undefined && known.size === 0) {
         // The store holds no named graphs, so no focus node can name one. Worth
         // checking before the key below, which would otherwise build a string
         // for every focus node on the page.
         return;
      }
      const key = id.termType + ":" + id.value;
      // Memoizing the attempt – not just a hit – keeps the top level entity from
      // being looked up both by CBD and by extract(). A dereference clears this.
      if (this.includedGraphs.has(key)) {
         return;
      }
      if (known && !known.has(key)) {
         return;
      }
      if (graphsToIgnore.has(id.value)) {
         return;
      }
      this.includedGraphs.add(key);

      const matched = this.matchQuads(null, id);
      if (Array.isArray(matched)) {
         return matched.length === 0
            ? undefined
            : this.namedGraphQuads(
               matched,
               0,
               id,
               result,
               extractedStar,
               graphsToIgnore,
            );
      }
      return matched.then((quads) =>
         quads.length === 0
            ? undefined
            : this.namedGraphQuads(
               quads,
               0,
               id,
               result,
               extractedStar,
               graphsToIgnore,
            ),
      );
   }

   /**
    * The body of includeNamedGraph, resumable from an index for the same reason
    * as cbdQuads.
    */
   private namedGraphQuads(
      quads: Quad[],
      from: number,
      id: Term,
      result: Quad[],
      extractedStar: CbdExtracted,
      graphsToIgnore: GraphFilter,
   ): Promise<void> | undefined {
      for (let i = from; i < quads.length; i++) {
         const q = quads[i];
         result.push(q);

         // Conditionally get more quads: if it’s a not yet extracted blank node
         if (
            q.object.termType === "BlankNode" &&
            !extractedStar.cbdExtracted(q.object)
         ) {
            // Only quads about the focus node itself say something about the
            // paths of the focus node, so only those advance the topology
            const next = q.subject.equals(id)
               ? extractedStar.push(q.predicate, false)
               : new CbdExtracted(undefined, extractedStar.cbdExtractedMap);
            // Tracked unconditionally: a named graph is also walked from
            // extract(), which does not know whether a shape is in play
            const pending = this.CBD(
               q.object,
               result,
               next,
               graphsToIgnore,
               true,
            );
            if (pending) {
               const resume = i + 1;
               return pending.then(() =>
                  this.namedGraphQuads(
                     quads,
                     resume,
                     id,
                     result,
                     extractedStar,
                     graphsToIgnore,
                  ),
               );
            }
         }
      }
      return undefined;
   }

   /**
    * Queries the store irrespective of the store implementation at hand.
    * Synchronous stores answer synchronously, so that the hot path does not pay
    * for a promise and a microtask per lookup.
    */
   private matchQuads(
      subject: Term | null,
      graph: Term | null,
   ): Quad[] | Promise<Quad[]> {
      const store = this.store as Store | SyncStore | AsyncStore;
      if ('getQuads' in store) {
         return store.getQuads(subject, null, null, graph);
      } else if ('get' in store) {
         const pattern: { subject?: Term; graph?: Term } = {};
         if (subject) {
            pattern.subject = subject;
         }
         if (graph) {
            pattern.graph = graph;
         }
         return store.get(pattern).then((result) => result.items);
      } else {
         return streamToArray(store.match(subject, null, null, graph));
      }
   }

   private loadQuadStreamInStore(quadStream: any) {
      return new Promise((resolve, reject) => {
         this.store.import(quadStream).on("end", resolve).on("error", reject);
      });
   }
}
