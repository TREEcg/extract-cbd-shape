# Extract CBD Shape

Extract one logical RDF member from a page, dataset, or API response that contains many members.

`extract-cbd-shape` is a TypeScript package for RDF-based Web APIs where a response contains a collection page, stream fragment, or batch of records, and a client needs to process one member at a time. Given a focus node, it returns the quads that describe that member.

The package combines two fallback strategies described in the member extraction paper:

- a dataset-aware Concise Bounded Description (CBD) extraction rule;
- optional SHACL-guided extraction, where shapes act as extraction hints.

It works with RDF/JS stores and terms, preserves named graphs, supports blank-node closure, and can extract many members from the same page efficiently.

## Install

```bash
npm install extract-cbd-shape
```

The package is ESM-first and includes TypeScript declarations.

## Quick Start

```ts
import {
  CBDShapeExtractor,
  createGraphIndexedRdfStore,
} from "extract-cbd-shape";
import { DataFactory } from "rdf-data-factory";

const dataStore = createGraphIndexedRdfStore();

// Add RDF/JS quads from your parser of choice.
for (const quad of dataQuads) {
  dataStore.addQuad(quad);
}

const extractor = new CBDShapeExtractor();
const memberQuads = await extractor.extract(
  dataStore,
  DataFactory.namedNode("https://example.org/member/42"),
);
```

With a SHACL shape:

```ts
const shapeStore = createGraphIndexedRdfStore();

for (const quad of shapeQuads) {
  shapeStore.addQuad(quad);
}

const extractor = new CBDShapeExtractor(shapeStore);
const memberQuads = await extractor.extract(
  dataStore,
  DataFactory.namedNode("https://example.org/member/42"),
  DataFactory.namedNode("https://example.org/MemberShape"),
);
```

## What It Extracts

Without a shape, extraction is based on a dataset-aware CBD rule:

1. include quads where the focus node is the subject;
2. recursively include quads for blank node objects;
3. include quads in the named graph whose graph name is the focus node;
4. keep RDF dataset graph names on the extracted quads.

With a SHACL shape, the shape is interpreted as an extraction topology:

1. `sh:property` paths are used as paths to include;
2. `sh:minCount > 0` marks paths as required;
3. `sh:node` links recursively extract related nodes with another node shape;
4. `sh:closed true` restricts extraction to shape-selected paths;
5. open shapes keep the normal CBD result and add shape-guided paths.

This is not SHACL validation. The shape is used to decide which quads to extract. Validate the extracted quads separately if validation matters for your application.

## API

### `new CBDShapeExtractor(shapesGraphStore?, dereferencer?, options?)`

Creates an extractor.

- `shapesGraphStore`: optional RDF/JS store containing SHACL shapes.
- `dereferencer`: optional `rdf-dereference` compatible dereferencer.
- `options.fetch`: optional `fetch` implementation used by dereferencing.
- `options.cbdDefaultGraph`: controls default-graph CBD behavior.
- `options.bulkConcurrency`: concurrency for `bulkExtract()` with asynchronous stores.

### `extract(store, id, shapeId?, graphsToIgnore?)`

Extracts one member.

```ts
const quads = await extractor.extract(store, id, shapeId);
```

- `store`: RDF/JS store containing the current page or dataset.
- `id`: RDF/JS term for the member to extract.
- `shapeId`: optional RDF/JS term identifying the SHACL node shape.
- `graphsToIgnore`: optional list of named graphs to exclude during traversal.
- returns: `Promise<Quad[]>`.

If no local quads can satisfy required shape paths, the extractor may dereference the focus IRI and retry with the retrieved data.

### `bulkExtract(store, ids, shapeId?, graphsToIgnore?, itemExtracted?)`

Extracts several members from the same store.

```ts
const members = await extractor.bulkExtract(
  dataStore,
  memberIds,
  DataFactory.namedNode("https://example.org/MemberShape"),
);
```

Use this when a page contains many members. It avoids repeatedly copying the page, keeps member named graphs isolated from each other, and can process asynchronous stores with bounded concurrency.

The result keeps the input order:

```ts
Array<{
  subject: Term;
  quads: Quad[];
}>
```

### `createGraphIndexedRdfStore()`

Creates an in-memory `rdf-stores` store with indexes tuned for member extraction.

```ts
const store = createGraphIndexedRdfStore();
```

The store includes graph-first indexes for retrieving member named graphs and traversal indexes for CBD and SHACL path lookups across graphs. Prefer it for browser use, tests, and page-scale in-memory extraction.

### `path` and `shape`

The package also exports internal path and shape helpers under:

```ts
import { path, shape } from "extract-cbd-shape";
```

Most consumers only need `CBDShapeExtractor` and `createGraphIndexedRdfStore()`.

## SHACL Support

The extractor uses a focused subset of SHACL Core:

- `sh:NodeShape`
- `sh:property`
- `sh:path`
- `sh:minCount`
- `sh:node`
- `sh:closed`
- `sh:and`
- `sh:or`
- `sh:xone`
- SHACL property paths, including sequence, inverse, alternative, zero-or-more, one-or-more, and zero-or-one paths.

It does not implement full SHACL validation semantics. In particular, it does not use `sh:targetClass` for automatic target selection and does not enforce constraints such as `sh:class`, `sh:pattern`, language constraints, qualified value shapes, SPARQL constraints, or JavaScript constraints.

## Named Graphs

Named graphs are handled conservatively:

- quads in a graph named after the focus member are included;
- `bulkExtract()` avoids leaking one member's named graph into another member;
- other graph names are preserved, but not treated as member boundaries unless they match the extraction rule.

This makes the package useful for collection pages where each member may be represented either by subject-centric quads, by a named graph, or by a combination of both.

## Browser Playground

The repository includes a browser playground in `perf/web`. It demonstrates three common cases:

- closed shape with nested hierarchy;
- open shape over a default graph;
- open shape over named graphs.

Build it with:

```bash
npm run build --prefix perf/web
```

## Development

```bash
npm test
npm run build
```

The tests in `tests/` cover CBD extraction, SHACL-guided extraction, property paths, named graphs, store-agnostic extraction, and Mermaid rendering for shapes.

## Logging

Enable debug logging with:

```bash
DEBUG=extract-cbd-shape npm test
```
