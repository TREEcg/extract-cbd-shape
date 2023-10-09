import { BlankNode, NamedNode, Quad, Store, Term } from "n3";
import { ShapeTemplate } from "./Shape";

export abstract class PathItem {
  value: PathPattern | NamedNode | Array<PathPattern>;
  constructor(value: PathPattern | NamedNode | Array<PathPattern>) {
    this.value = value;
  }
}

export class PredicateItem extends PathItem {
  constructor(value: NamedNode) {
    super(value);
  }
}
export class AlternativePathItem extends PathItem {
  constructor(value: Array<PathPattern>) {
    super(value);
  }
}
export class InversePathItem extends PathItem {
  constructor(value: PathPattern | NamedNode) {
    super(value);
  }
}

export class ZeroOrMorePathItem extends PathItem {}

export class OneOrMorePathItem extends PathItem {}

export class ZeroOrOnePathItem extends PathItem {}

export class PathResult {
  path: Array<Quad>;
  target: Term;
  constructor(path: Array<Quad>, target: Term) {
    this.path = path;
    this.target = target;
  }
}

export class PathPattern {
  pathItems: Array<PathItem>;
  constructor(pathItems: Array<PathItem>) {
    this.pathItems = pathItems;
  }

  /**
   * Converts it to a SPARQL property path for easy output
   * @returns SPARQL property path string
   */
  public toString() {
    let str = "";
    let i = 0;
    if (this.pathItems.length > 1) {
      str += "(";
    }
    for (let item of this.pathItems) {
      if (item instanceof PredicateItem) {
        str += "<" + item.value.value + ">";
      } else if (item instanceof InversePathItem) {
        str += "^" + item.value.toString();
      } else if (item instanceof AlternativePathItem) {
        for (let alternate of item.value) {
          str += alternate.value.toString() + "|";
        }
      } else if (item instanceof ZeroOrOnePathItem) {
        str += item.value.toString() + "? ";
      } else if (item instanceof ZeroOrMorePathItem) {
        str += item.value.toString() + "* ";
      } else if (item instanceof OneOrMorePathItem) {
        str += item.value.toString() + "+ ";
      }
      //if this is not the last item, we’re dealing with a sequence path, so add a slash for the next item
      if (i !== this.pathItems.length - 1) {
        str += "/";
      }
      i++;
    }
    if (this.pathItems.length > 1) {
      str += ")";
    }
    return str;
  }

  public *match(
    store: Store,
    focusNode: Term,
    pathItems?: Array<PathItem>,
    currentPath?: Array<Quad>,
    inverse?: boolean,
  ): Generator<PathResult> {
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
      if (!inverse) {
        quads = store.getQuads(focusNode, pathItem.value);
      } else {
        quads = store.getQuads(null, pathItem.value, focusNode);
      }
      for (let quad of quads) {
        //Each of these is a possibility for more matches
        let newCurrentPath = [...currentPath];

        newCurrentPath.push(quad);
        // console.log(newCurrentPath, currentPath);
        //If there are no elements left, we are yielding our result
        let newFocusNode = inverse ? quad.subject : quad.object;
        if (pathItems.length === 1) {
          yield new PathResult(newCurrentPath, newFocusNode);
        } else {
          //Go deeper and yield the results of the function in here
          let restMatches = this.match(
            store,
            newFocusNode,
            pathItems.slice(1),
            newCurrentPath,
          );
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
      let inverseMatches = this.match(
        store,
        focusNode,
        pathItem.value.pathItems,
        currentPath,
        !inverse,
      ); //!inverse → change the inversion as a double inverse should also work
      //For every match, add it to a currentPath and continue the sequence
      for (let match of Array.from(inverseMatches)) {
        let newFocusNode = match.target;
        let newCurrentPath = [...currentPath, ...match.path]; // create a copy and concat with the path from the matches
        //If there are no elements left in the rest of the sequence path, we are yielding our result
        if (pathItems.length === 1) {
          yield new PathResult(newCurrentPath, match.target);
        } else {
          //Otherwise, we need to handle the rest of the sequence path by starting from our last focusnode and path
          //Also pass the current inverse in case we’re already in an inverse. Would be really weird, but hey, who are we to judge anyone’s shape
          let restMatches = this.match(
            store,
            match.target,
            pathItems.slice(1),
            newCurrentPath,
            inverse,
          ); //inverse?match.path[match.path.length-1].object:match.path[match.path.length-1].subject, pathItems.slice(1), newCurrentPath, inverse);
          let restMatch = restMatches.next();
          while (!restMatch.done) {
            yield restMatch.value;
            restMatch = restMatches.next();
          }
        }
      }
    } else if (pathItem instanceof ZeroOrOnePathItem) {
      //Already add one of the certain matches: the current path with the current focusnode
      let matches = [new PathResult(currentPath, focusNode)];
      //Now also add more matches based on the results from the inner zerooronepaths value pathItems
      let onePathMatches = this.match(
        store,
        focusNode,
        pathItem.value.pathItems,
        currentPath,
        inverse,
      );
      for (let match of matches.concat(Array.from(onePathMatches))) {
        let newCurrentPath = [...currentPath, ...match.path]; // create a copy and concat with the path from the matches
        //If there are no elements left in the rest of the sequence path, we are yielding our result
        if (pathItems.length === 1) {
          if (newCurrentPath.length > 0) {
            yield new PathResult(newCurrentPath, match.target);
          }
        } else {
          //Otherwise, we need to handle the rest of the sequence path by starting from our last focusnode and path
          let restMatches = this.match(
            store,
            match.target,
            pathItems.slice(1),
            newCurrentPath,
            inverse,
          );
          let restMatch = restMatches.next();
          while (!restMatch.done) {
            if (restMatch.value.path.length > 0) {
              yield restMatch.value;
            }
            restMatch = restMatches.next();
          }
        }
      }
    } else if (pathItem instanceof OneOrMorePathItem) {
      let onePathMatchesArray = Array.from(
        this.match(
          store,
          focusNode,
          pathItem.value.pathItems,
          currentPath,
          inverse,
        ),
      );
      while (onePathMatchesArray.length > 0) {
        for (let match of onePathMatchesArray) {
          let newCurrentPath = [...currentPath, ...match.path]; // create a copy and concat with the path from the matches
          //If there are no elements left in the rest of the sequence path, we are yielding our result
          if (pathItems.length === 1) {
            yield new PathResult(newCurrentPath, match.target);
          } else {
            //Otherwise, we need to handle the rest of the sequence path by starting from our last focusnode and path
            let restMatches = this.match(
              store,
              match.target,
              pathItems.slice(1),
              newCurrentPath,
              inverse,
            );
            let restMatch = restMatches.next();
            while (!restMatch.done) {
              yield restMatch.value;
              restMatch = restMatches.next();
            }
          }
          onePathMatchesArray = Array.from(
            this.match(
              store,
              match.target,
              pathItem.value.pathItems,
              newCurrentPath,
              inverse,
            ),
          );
        }
      }
    } else if (pathItem instanceof ZeroOrMorePathItem) {
      let matches = [new PathResult(currentPath, focusNode)];
      let onePathMatchesArray = Array.from(
        this.match(
          store,
          focusNode,
          pathItem.value.pathItems,
          currentPath,
          inverse,
        ),
      ).concat(matches); //And concat the zero possibility to the first run
      while (onePathMatchesArray.length > 0) {
        for (let match of onePathMatchesArray) {
          let newCurrentPath = [...currentPath, ...match.path]; // create a copy and concat with the path from the matches
          //If there are no elements left in the rest of the sequence path, we are yielding our result
          if (pathItems.length === 1) {
            if (newCurrentPath.length > 0) {
              yield new PathResult(newCurrentPath, match.target);
            }
          } else {
            //Otherwise, we need to handle the rest of the sequence path by starting from our last focusnode and path
            let restMatches = this.match(
              store,
              match.target,
              pathItems.slice(1),
              newCurrentPath,
              inverse,
            );
            let restMatch = restMatches.next();
            while (!restMatch.done) {
              if (restMatch.value.path.length > 0) {
                yield restMatch.value;
              }
              restMatch = restMatches.next();
            }
          }
          onePathMatchesArray = Array.from(
            this.match(
              store,
              match.target,
              pathItem.value.pathItems,
              newCurrentPath,
              inverse,
            ),
          );
        }
      }
    } else if (pathItem instanceof AlternativePathItem) {
      //This forks the thing to everything in the list of the alternativePathItem
      for (let pathPattern of pathItem.value) {
        let subMatchesArray = Array.from(
          this.match(
            store,
            focusNode,
            pathPattern.pathItems,
            currentPath,
            inverse,
          ),
        ); //And concat the zero possibility to the first run
        for (let match of subMatchesArray) {
          let newCurrentPath = [...currentPath, ...match.path];
          if (pathItems.length === 1) {
            if (newCurrentPath.length > 0) {
              yield new PathResult(newCurrentPath, match.target);
            } else {
              //Otherwise, we need to handle the rest of the sequence path by starting from our last focusnode and path
              let restMatches = this.match(
                store,
                match.target,
                pathItems.slice(1),
                newCurrentPath,
                inverse,
              );
              let restMatch = restMatches.next();
              while (!restMatch.done) {
                if (restMatch.value.path.length > 0) {
                  yield restMatch.value;
                }
                restMatch = restMatches.next();
              }
            }
          }
        }
      }
    }
    //All potential matches we need to further study are further processed in the recursive function
  }
}
