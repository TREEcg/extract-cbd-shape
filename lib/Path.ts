import { Quad, Term } from "@rdfjs/types";
import { Store } from "n3";

export interface Path {
  toString(): string;

  match(
    store: Store,
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

  match(
    store: Store,
    focusNode: Term,
    graphsToIgnore: Array<string>,
    inverse: boolean = false,
  ): PathResult[] {
    let quads = inverse
      ? store.getQuads(null, this.predicate, focusNode, null)
      : store.getQuads(focusNode, this.predicate, null, null);

    return quads
      .filter((q) => !graphsToIgnore.includes(q.graph.value))
      .map((quad) => {
        const newFocusNode = inverse ? quad.subject : quad.object;
        return { path: [quad], target: newFocusNode };
      });
  }
}

export class SequencePath implements Path {
  private sequence: Path[];

  constructor(sequence: Path[]) {
    this.sequence = sequence;
  }

  private *matchNext(
    store: Store,
    inverse: boolean,
    index: number,
    path: Quad[],
    target: Term,
    graphsToIgnore: Array<string>,
  ): Generator<PathResult> {
    if (index === this.sequence.length) {
      yield { path: path.slice(), target };
      return;
    }

    for (const found of this.sequence[index].match(
      store,
      target,
      graphsToIgnore,
      inverse,
    )) {
      const newPath = [...path, ...found.path];
      yield* this.matchNext(
        store,
        inverse,
        index + 1,
        newPath,
        found.target,
        graphsToIgnore,
      );
    }
  }

  toString(): string {
    return this.sequence.map((x) => x.toString()).join("/");
  }

  match(
    store: Store,
    focusNode: Term,
    graphsToIgnore: Array<string>,
    inverse: boolean = false,
  ): PathResult[] {
    let results: PathResult[] = [{ path: [], target: focusNode }];
    for (const path of this.sequence) {
      results = results.flatMap((res) => {
        const nexts = path.match(store, res.target, graphsToIgnore, inverse);
        return nexts.map((n) => ({
          path: [...res.path, ...n.path],
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

  toString(): string {
    return this.alternatives.map((x) => x.toString()).join("|");
  }

  match(
    store: Store,
    focusNode: Term,
    graphsToIgnore: Array<string>,
    inverse: boolean = false,
  ): PathResult[] {
    return this.alternatives.flatMap((path) =>
      path.match(store, focusNode, graphsToIgnore, inverse),
    );
  }
}

export class InversePath implements Path {
  private path: Path;

  constructor(path: Path) {
    this.path = path;
  }

  toString(): string {
    return "^" + this.path.toString();
  }

  match(
    store: Store,
    focusNode: Term,
    graphsToIgnore: Array<string>,
    inverse: boolean = false,
  ): PathResult[] {
    return this.path.match(store, focusNode, graphsToIgnore, !inverse);
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

  private *matchNext(
    index: number,
    store: Store,
    inverse: boolean,
    path: Quad[],
    target: Term,
    graphsToIgnore: Array<string>,
  ): Generator<PathResult> {
    // Please no off by one error
    if (!!this.maxCount && index > this.maxCount) return;

    for (const res of this.path.match(store, target, graphsToIgnore, inverse)) {
      if (this.filter(index, res)) {
        yield { path: [...path, ...res.path], target: res.target };
      }
      yield* this.matchNext(
        index + 1,
        store,
        inverse,
        [...path, ...res.path],
        res.target,
        graphsToIgnore,
      );
    }
  }

  match(
    store: Store,
    focusNode: Term,
    graphsToIgnore: Array<string>,
    inverse: boolean = false,
  ): PathResult[] {
    const out: PathResult[] = [];
    let targets: PathResult[] = [{ path: [], target: focusNode }];

    for (let i = 0; true; i++) {
      if (this.maxCount && i > this.maxCount) break;
      if (targets.length === 0) break;
      const newTargets: PathResult[] = [];

      for (const t of targets) {
        for (const found of this.path.match(
          store,
          t.target,
          graphsToIgnore,
          inverse,
        )) {
          if (this.filter(i, found)) {
            out.push({
              path: [...t.path, ...found.path],
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
}

export interface PathResult {
  path: Array<Quad>;
  target: Term;
}
