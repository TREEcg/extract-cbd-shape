import {Term} from "@rdfjs/types";
import {Path,} from "./Path";
import {CbdExtracted} from "./CBDShapeExtractor";

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

  fillPathsAndLinks(extraPaths: Array<Path>, extraNodeLinks: Array<NodeLink>) {
    for (let list of this.atLeastOneLists) {
      for (let item of list) {
        extraPaths.push(...item.requiredPaths);
        extraPaths.push(...item.optionalPaths);
        // extraPaths.push(...item.nodeLinks.map((x) => x.pathPattern));
        extraNodeLinks.push(...item.nodeLinks);
        item.fillPathsAndLinks(extraPaths, extraNodeLinks);
      }
    }
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

