import rdfDereference, { RdfDereferencer } from "rdf-dereference";
import { NodeLink, ShapesGraph, ShapeTemplate } from "./Shape";
import { Path, PathResult } from "./Path";
import { BlankNode, Quad, Store, Term } from "n3";

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

  constructor(shapesGraphStore?: Store, dereferencer?: RdfDereferencer) {
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

  loadQuadStreamInStore(store: Store, quadStream: any) {
    return new Promise((resolve, reject) => {
      store.import(quadStream).on("end", resolve).on("error", reject);
    });
  }

  /**
   * Extracts:
   *  * first level quads,
   *  * their blank nodes with their quads (recursively),
   *  * all quads in the namedgraph of this entity,
   *  * all quads of required paths found in the shape
   *  * the same algorithm on top of all found node links
   * @param store The N3 Store loaded with a set of initial quads
   * @param id The entity to be described/extracted
   * @param shapeId The optional SHACL NodeShape identifier
   * @returns Promise of a quad array of the described entity
   */
  public async extract(
    store: Store,
    id: Term,
    shapeId?: Term,
  ): Promise<Array<Quad>> {
    let result = (
      await this.extractRecursively(store, id, [], [], shapeId)
    ).concat(store.getQuads(null, null, null, id)); // also add the quads where the named graph matches the current id
    if (result.length === 0) {
      //Dereference and try again to extract them from the store
      console.error(
        "Dereferencing " + id.value + " as there were no quads found at all",
      );
      await this.loadQuadStreamInStore(
        store,
        (await this.dereferencer.dereference(id.value)).data,
      );
      result = (
        await this.extractRecursively(store, id, [], [id.value], shapeId)
      ).concat(store.getQuads(null, null, null, id));
    }

    //When returning the quad array, remove duplicate triples as CBD, required properties, etc. could have added multiple times the same triple
    return result.filter((value: Quad, index: number, array: Quad[]) => {
      return index === array.findIndex((x) => x.equals(value));
    });
  }

  /**
   * Will check whether all required paths work
   */
  private validRequiredPaths(
    store: Store,
    shape: ShapeTemplate,
    focusNode: Term,
  ): boolean {
    for (let path of shape.requiredPaths) {
      let matchIterator = path.match(store, focusNode);
      if (matchIterator.next().done) {
        return false;
      }
    }
    return true;
  }

  /**
   * Given a shape, it will check whether all atLeastOneLists validate
   */
  private validAtLeastOneLists(
    store: Store,
    shape: ShapeTemplate,
    focusNode: Term,
  ): boolean {
    for (let list of shape.atLeastOneLists) {
      let atLeastOne = false;
      for (let item of list) {
        if (
          this.validRequiredPaths(store, item, focusNode) &&
          this.validAtLeastOneLists(store, item, focusNode)
        ) {
          atLeastOne = true;
          break;
        }
      }
      if (!atLeastOne) {
        return false;
      }
    }
    return true;
  }

  /**
   * Fills the extraPaths and extraNodeLinks parameters with the ones from valid items in the atLeastOneLists
   */
  private recursivelyProcessAtLeastOneLists(
    store: Store,
    shape: ShapeTemplate,
    id: Term,
    extraPaths: Array<Path>,
    extraNodeLinks: Array<NodeLink>,
  ) {
    for (let list of shape.atLeastOneLists) {
      for (let item of list) {
        if (
          this.validRequiredPaths(store, item, id) &&
          this.validAtLeastOneLists(store, item, id)
        ) {
          extraPaths.push(...item.requiredPaths);
          extraPaths.push(...item.optionalPaths);
          extraNodeLinks.push(...item.nodeLinks);
          this.recursivelyProcessAtLeastOneLists(
            store,
            item,
            id,
            extraPaths,
            extraNodeLinks,
          );
        }
      }
    }
  }

  private async extractRecursively(
    store: Store,
    id: Term,
    extracted: Array<Term>,
    dereferenced: Array<string>,
    shapeId?: Term | ShapeTemplate,
  ): Promise<Array<Quad>> {
    //If it has already been extracted, don’t extract it again: prevents cycles
    if (extracted.find((x) => x.equals(id))) {
      return [];
    }
    extracted.push(id);

    let result: Quad[] = [];
    let shape: ShapeTemplate | undefined;
    if (shapeId instanceof ShapeTemplate) {
      shape = shapeId;
    } else if (shapeId && this.shapesGraph) {
      shape = this.shapesGraph.shapes.get(shapeId);
    }

    // First, let’s check whether we need to do an HTTP request:
    //  -- first, this id:Term needs to be an instanceof NamedNode - because otherwise we have nothing to dereference
    //  --- Next, we can check the required paths
    //  ----If all paths are set, only then we should also check the atLeastOneLists and check whether it contains a list where none items have set their required properties.
    if (id.termType === "NamedNode" && shape) {
      //Check required paths and lazy evaluate the atLeastOneLists
      if (
        !(
          this.validRequiredPaths(store, shape, id) &&
          this.validAtLeastOneLists(store, shape, id)
        )
      ) {
        //Need to do an extra HTTP request, probably want to log this somehow (TODO)
        console.error(
          "Dereferencing " +
            id.value +
            " as required paths were not set (or all conditionals were not met)",
        );
        await this.loadQuadStreamInStore(
          store,
          (await this.dereferencer.dereference(id.value)).data,
        );
        dereferenced.push(id.value);
      }
    }

    // Next, on our newly fetched data,
    // we’ll need to process all paths of the shape. If the shape is open, we’re going to do CBD afterwards, so let’s omit paths with only a PredicatePath when the shape is open
    if (!!shape) {
      let visited: Quad[] = [];
      //For all valid items in the atLeastOneLists, process the required path, optional paths and nodelinks. Do the same for the atLeastOneLists inside these options.
      let extraPaths: Path[] = [];
      let extraNodeLinks: NodeLink[] = [];

      //Process atLeastOneLists in extraPaths and extra NodeLinks
      this.recursivelyProcessAtLeastOneLists(
        store,
        shape,
        id,
        extraPaths,
        extraNodeLinks,
      );

      for (let path of shape.requiredPaths.concat(
        shape.optionalPaths,
        extraPaths,
      )) {
        let pathQuads = Array.from(path.match(store, id))
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
        result = result.concat(pathQuads); //concat all quad paths in the results
      }

      for (let nodeLink of shape.nodeLinks.concat(extraNodeLinks)) {
        let matches = Array.from(nodeLink.pathPattern.match(store, id));
        for (let match of matches) {
          result.push(
            ...(await this.extractRecursively(
              store,
              match.target,
              extracted,
              dereferenced,
              nodeLink.link,
            )),
          );
        }

        let pathQuads = Array.from(nodeLink.pathPattern.match(store, id))
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
        result = result.concat(...pathQuads); //concat all quad paths in the results
      }
    }

    //Perform CBD and we’re done, except on the condition there’s a shape defined and it’s closed
    if (!(shape && shape.closed)) {
      this.CBD(result, store, id, extracted);
    }
    return result;
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
    store: Store,
    id: Term,
    extracted: Array<Term>,
  ) {
    const quads = store.getQuads(id, null, null, null);
    //Iterate over the quads, add them to the result and check whether we should further get other quads based on blank nodes or the SHACL shape
    for (const q of quads) {
      result.push(q);
      // Conditionally get more quads: if it’s a not yet extracted blank node
      if (
        q.object instanceof BlankNode &&
        !extracted.find((x) => x.equals(q.object))
      ) {
        //only perform CBD again recursively on the blank node
        await this.CBD(result, store, q.object, extracted);
        extracted.push(q.object);
      }
    }
    //Should we also take into account RDF* and/or RDF reification systems here?
  }
}
