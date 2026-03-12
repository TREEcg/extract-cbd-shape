import { Quad, Term, Store } from "@rdfjs/types";
import { CbdExtracted, SyncStore, AsyncStore } from "./CBDShapeExtractor";
import { streamToArray } from "./Utils";

export interface Path {
  literalType?: Term;

  toString(): string;

  found(cbd: CbdExtracted, inverse?: boolean): CbdExtracted | undefined;

  match(
    store: Store,
    extracted: CbdExtracted,
    focusNode: Term,
    graphsToIgnore?: Array<string>,
    inverse?: boolean,
  ): Promise<PathResult[]>;
}

export class PredicatePath implements Path {
  public literalType?: Term;
  private predicate: Term;

  constructor(predicate: Term, literalType?: Term) {
    this.literalType = literalType;
    this.predicate = predicate;
  }

  toString(): string {
    return `<${this.predicate.value}>`;
  }

  found(cbd: CbdExtracted, inverse: boolean = false): CbdExtracted | undefined {
    return cbd.enter(this.predicate, inverse);
  }

  async match(
    store: Store,
    extracted: CbdExtracted,
    focusNode: Term,
    graphsToIgnore: Array<string>,
    inverse: boolean = false,
  ): Promise<PathResult[]> {
    let quads: Quad[];
    const s = store as Store | SyncStore | AsyncStore;
    if ('getQuads' in s) {
      quads = inverse
        ? s.getQuads(null, this.predicate, focusNode, null)
        : s.getQuads(focusNode, this.predicate, null, null);
    } else if ('get' in s) {
      quads = (await (inverse
        ? s.get({ predicate: this.predicate, object: focusNode })
        : s.get({ subject: focusNode, predicate: this.predicate }))).items;
    } else {
      quads = (
        inverse
          ? await streamToArray(store.match(null, this.predicate, focusNode, null))
          : await streamToArray(store.match(focusNode, this.predicate, null, null))
      );
    }
    quads = quads.filter((q) => !graphsToIgnore.includes(q.graph.value));

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
  public literalType?: Term;
  private sequence: Path[];

  constructor(sequence: Path[], literalType?: Term) {
    this.literalType = literalType;
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

  async match(
    store: Store,
    extracted: CbdExtracted,
    focusNode: Term,
    graphsToIgnore: Array<string>,
    inverse: boolean = false,
  ): Promise<PathResult[]> {
    let results: PathResult[] = [
      {
        path: [],
        target: focusNode,
        cbdExtracted: extracted,
      },
    ];
    for (const path of this.sequence) {
      const nextResultsArrays = await Promise.all(
        results.map(async (res) => {
          const nexts = await path.match(
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
        }),
      );
      results = nextResultsArrays.flat();
    }
    return results;
  }
}

export class AlternativePath implements Path {
  public literalType?: Term;
  private alternatives: Path[];

  constructor(alternatives: Path[], literalType?: Term) {
    this.literalType = literalType;
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

  async match(
    store: Store,
    extracted: CbdExtracted,
    focusNode: Term,
    graphsToIgnore: Array<string>,
    inverse: boolean = false,
  ): Promise<PathResult[]> {
    const resultsArrays = await Promise.all(
      this.alternatives.map((path) =>
        path.match(store, extracted, focusNode, graphsToIgnore, inverse),
      ),
    );
    return resultsArrays.flat();
  }
}

export class InversePath implements Path {
  public literalType?: Term;
  private path: Path;

  constructor(path: Path, literalType?: Term) {
    this.literalType = literalType;
    this.path = path;
  }

  found(cbd: CbdExtracted, inverse?: boolean): CbdExtracted | undefined {
    return this.path.found(cbd, !inverse);
  }

  toString(): string {
    return "^" + this.path.toString();
  }

  async match(
    store: Store,
    extracted: CbdExtracted,
    focusNode: Term,
    graphsToIgnore: Array<string>,
    inverse: boolean = false,
  ): Promise<PathResult[]> {
    return await this.path.match(
      store,
      extracted,
      focusNode,
      graphsToIgnore,
      !inverse,
    );
  }
}

export abstract class MultiPath implements Path {
  public literalType?: Term;
  protected path: Path;
  private maxCount?: number;
  protected constructor(path: Path, maxCount?: number, literalType?: Term) {
    this.literalType = literalType;
    this.path = path;
    this.maxCount = maxCount;
  }

  abstract filter(times: number, res: PathResult): boolean;
  abstract toString(): string;

  abstract found(cbd: CbdExtracted): CbdExtracted | undefined;

  async match(
    store: Store,
    extracted: CbdExtracted,
    focusNode: Term,
    graphsToIgnore: Array<string>,
    inverse: boolean = false,
  ): Promise<PathResult[]> {
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
        if (this.filter(i, t)) {
          out.push(t);
        }

        const foundPaths = await this.path.match(
          store,
          t.cbdExtracted,
          t.target,
          graphsToIgnore,
          inverse,
        );

        for (const found of foundPaths) {
          newTargets.push({
            path: [...t.path, ...found.path],
            cbdExtracted: t.cbdExtracted,
            target: found.target,
          });
        }
      }

      targets = newTargets;
    }

    return out;
  }
}

export class OneOrMorePath extends MultiPath {
  constructor(path: Path, literalType?: Term) {
    super(path, undefined, literalType);
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
  constructor(path: Path, literalType?: Term) {
    super(path, undefined, literalType);
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
  constructor(path: Path, literalType?: Term) {
    super(path, 1, literalType);
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
