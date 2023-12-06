import { Quad, Term } from "@rdfjs/types";
import { Store } from "n3";
import { CbdExtracted, Extracted } from "./CBDShapeExtractor";

export interface Path {
  toString(): string;

  found(cbd: CbdExtracted, inverse?: boolean): CbdExtracted | undefined;

  match(
    store: Store,
    extracted: CbdExtracted,
    focusNode: Term,
    graphsToIgnore?: Array<string>,
    inverse?: boolean,
  ): PathResult[];
}

export class PredicatePath implements Path {
  private predicate: Term;

  constructor(predicate: Term) {
    this.predicate = predicate;
  }

  toString(): string {
    return `<${this.predicate.value}>`;
  }

  found(cbd: CbdExtracted, inverse: boolean = false): CbdExtracted | undefined {
    return cbd.enter(this.predicate, inverse);
  }

  match(
    store: Store,
    extracted: CbdExtracted,
    focusNode: Term,
    graphsToIgnore: Array<string>,
    inverse: boolean = false,
  ): PathResult[] {
    let quads = (
      inverse
        ? store.getQuads(null, this.predicate, focusNode, null)
        : store.getQuads(focusNode, this.predicate, null, null)
    ).filter((q) => !graphsToIgnore.includes(q.graph.value));

    if (quads.length > 0) {
      let cbd: CbdExtracted = extracted.push(this.predicate, inverse);

      return quads.map((quad) => {
        const newFocusNode = inverse ? quad.subject : quad.object;
        return { path: [quad], target: newFocusNode, cbdExtracted: cbd };
      });
    } else {
      return [];
    }
  }
}

export class SequencePath implements Path {
  private sequence: Path[];

  constructor(sequence: Path[]) {
    this.sequence = sequence;
  }

  found(cbd: CbdExtracted, inverse?: boolean): CbdExtracted | undefined {
    let current: CbdExtracted | undefined = cbd;
    for (const seq of this.sequence) {
      if (current) {
        current = seq.found(current, inverse);
      }
    }
    return current;
  }

  toString(): string {
    return this.sequence.map((x) => x.toString()).join("/");
  }

  match(
    store: Store,
    extracted: CbdExtracted,
    focusNode: Term,
    graphsToIgnore: Array<string>,
    inverse: boolean = false,
  ): PathResult[] {
    let results: PathResult[] = [
      {
        path: [],
        target: focusNode,
        cbdExtracted: extracted,
      },
    ];
    for (const path of this.sequence) {
      results = results.flatMap((res) => {
        const nexts = path.match(
          store,
          res.cbdExtracted,
          res.target,
          graphsToIgnore,
          inverse,
        );
        return nexts.map((n) => ({
          path: [...res.path, ...n.path],
          cbdExtracted: n.cbdExtracted,
          target: n.target,
        }));
      });
    }
    return results;
  }
}

export class AlternativePath implements Path {
  private alternatives: Path[];

  constructor(alternatives: Path[]) {
    this.alternatives = alternatives;
  }

  found(cbd: CbdExtracted, inverse?: boolean): CbdExtracted | undefined {
    for (const option of this.alternatives) {
      const maybe = option.found(cbd, inverse);
      if (maybe) return maybe;
    }
    return;
  }

  toString(): string {
    return this.alternatives.map((x) => x.toString()).join("|");
  }

  match(
    store: Store,
    extracted: CbdExtracted,
    focusNode: Term,
    graphsToIgnore: Array<string>,
    inverse: boolean = false,
  ): PathResult[] {
    return this.alternatives.flatMap((path) =>
      path.match(store, extracted, focusNode, graphsToIgnore, inverse),
    );
  }
}

export class InversePath implements Path {
  private path: Path;

  constructor(path: Path) {
    this.path = path;
  }

  found(cbd: CbdExtracted, inverse?: boolean): CbdExtracted | undefined {
    return this.path.found(cbd, !inverse);
  }

  toString(): string {
    return "^" + this.path.toString();
  }

  match(
    store: Store,
    extracted: CbdExtracted,
    focusNode: Term,
    graphsToIgnore: Array<string>,
    inverse: boolean = false,
  ): PathResult[] {
    return this.path.match(
      store,
      extracted,
      focusNode,
      graphsToIgnore,
      !inverse,
    );
  }
}

export abstract class MultiPath implements Path {
  protected path: Path;
  private maxCount?: number;
  protected constructor(path: Path, maxCount?: number) {
    this.path = path;
    this.maxCount = maxCount;
  }

  abstract filter(times: number, res: PathResult): boolean;
  abstract toString(): string;

  abstract found(cbd: CbdExtracted): CbdExtracted | undefined;

  match(
    store: Store,
    extracted: CbdExtracted,
    focusNode: Term,
    graphsToIgnore: Array<string>,
    inverse: boolean = false,
  ): PathResult[] {
    const out: PathResult[] = [];
    let targets: PathResult[] = [
      {
        path: [],
        target: focusNode,
        cbdExtracted: extracted,
      },
    ];

    for (let i = 0; true; i++) {
      if (this.maxCount && i > this.maxCount) break;
      if (targets.length === 0) break;
      const newTargets: PathResult[] = [];

      for (const t of targets) {
        for (const found of this.path.match(
          store,
          t.cbdExtracted,
          t.target,
          graphsToIgnore,
          inverse,
        )) {
          if (this.filter(i, found)) {
            out.push({
              path: [...t.path, ...found.path],
              cbdExtracted: t.cbdExtracted,
              target: found.target,
            });
          }
          newTargets.push(found);
        }
      }

      targets = newTargets;
    }

    return out;
  }
}

export class OneOrMorePath extends MultiPath {
  constructor(path: Path) {
    super(path);
  }
  filter(times: number, _res: PathResult): boolean {
    return times >= 1;
  }
  toString(): string {
    return this.path.toString() + "+";
  }

  found(cbd: CbdExtracted, inverse?: boolean): CbdExtracted | undefined {
    let newCbd = this.path.found(cbd, inverse);
    if (!newCbd) return;
    let next = this.path.found(newCbd, inverse);
    while (next) {
      newCbd = next;
      next = this.path.found(newCbd, inverse);
    }

    return newCbd;
  }
}
export class ZeroOrMorePath extends MultiPath {
  constructor(path: Path) {
    super(path);
  }
  filter(_times: number, _res: PathResult): boolean {
    return true;
  }
  toString(): string {
    return this.path.toString() + "*";
  }

  found(cbd: CbdExtracted, inverse?: boolean): CbdExtracted | undefined {
    let next = this.path.found(cbd, inverse);
    while (next) {
      cbd = next;
      next = this.path.found(cbd, inverse);
    }
    return cbd;
  }
}

export class ZeroOrOnePath extends MultiPath {
  constructor(path: Path) {
    super(path, 1);
  }
  filter(times: number, _res: PathResult): boolean {
    return times < 2;
  }
  toString(): string {
    return this.path.toString() + "?";
  }

  found(cbd: CbdExtracted, inverse?: boolean): CbdExtracted | undefined {
    return this.path.found(cbd, inverse) || cbd;
  }
}

export interface PathResult {
  path: Array<Quad>;
  target: Term;
  cbdExtracted: CbdExtracted;
}
