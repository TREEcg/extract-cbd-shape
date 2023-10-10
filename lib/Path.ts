import { Quad, Store, Term } from "n3";

export interface Path {
  toString(): string;

  match(
    store: Store,
    focusNode: Term,
    inverse?: boolean,
  ): Generator<PathResult>;
}

export class PredicatePath implements Path {
  private predicate: Term;

  constructor(predicate: Term) {
    this.predicate = predicate;
  }

  toString(): string {
    return `<${this.predicate.value}>`;
  }

  *match(
    store: Store<Quad, Quad, Quad, Quad>,
    focusNode: Term,
    inverse: boolean = false,
  ): Generator<PathResult, any, unknown> {
    let quads = inverse
      ? store.getQuads(null, this.predicate, focusNode, null)
      : store.getQuads(focusNode, this.predicate, null, null);

    for (let quad of quads) {
      //If there are no elements left, we are yielding our result
      let newFocusNode = inverse ? quad.subject : quad.object;
      yield new PathResult([quad], newFocusNode);
    }
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
  ): Generator<PathResult> {
    if (index === this.sequence.length) {
      yield new PathResult(path.slice(), target);
      return;
    }

    for (const found of this.sequence[index].match(store, target, inverse)) {
      const newPath = [...path, ...found.path];
      yield* this.matchNext(store, inverse, index + 1, newPath, found.target);
    }
  }

  toString(): string {
    return this.sequence.map((x) => x.toString()).join("/");
  }

  *match(
    store: Store<Quad, Quad, Quad, Quad>,
    focusNode: Term,
    inverse: boolean = false,
  ): Generator<PathResult, any, unknown> {
    yield* this.matchNext(store, inverse, 0, [], focusNode);
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

  *match(
    store: Store<Quad, Quad, Quad, Quad>,
    focusNode: Term,
    inverse: boolean = false,
  ): Generator<PathResult, any, unknown> {
    for (const alt of this.alternatives) {
      yield* alt.match(store, focusNode, inverse);
    }
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

  *match(
    store: Store<Quad, Quad, Quad, Quad>,
    focusNode: Term,
    inverse: boolean = false,
  ): Generator<PathResult, any, unknown> {
    yield* this.path.match(store, focusNode, !inverse);
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
  ): Generator<PathResult> {
    // Please no off by one error
    if (!!this.maxCount && index > this.maxCount) return;

    for (const res of this.path.match(store, target, inverse)) {
      if (this.filter(index, res)) {
        yield new PathResult([...path, ...res.path], res.target);
      }
      yield* this.matchNext(
        index + 1,
        store,
        inverse,
        [...path, ...res.path],
        res.target,
      );
    }
  }

  *match(
    store: Store<Quad, Quad, Quad, Quad>,
    focusNode: Term,
    inverse: boolean = false,
  ): Generator<PathResult> {
    yield* this.matchNext(0, store, inverse, [], focusNode);
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

export class PathResult {
  path: Array<Quad>;
  target: Term;
  constructor(path: Array<Quad>, target: Term) {
    this.path = path;
    this.target = target;
  }
}
