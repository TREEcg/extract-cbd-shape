# Extract CBD Shape

Given (i) an N3 Store of triples, (ii) an N3 Store with a SHACL shape’s triples, and (iii) a target entity URI,
this library will extract all triples that belong to the entity.
If more triples of the entity are needed, extra triples are retrieved by dereferencing the relevant entity.

The algorithm is a proposal to be standardized as part of [W3C’s TREE hypermedia Community Group](https://w3id.org/tree/specification) as the member extraction algorithm. This algorithm needs to be efficient and unambiguously defined, so that various implementations of the member extraction algorithm will result in the same set of triples. As a trade-off, the resulting set of triples is not guaranteed to be validated by the SHACL shape.

The algorithm is inspired by, and an in-between between [CBD](https://www.w3.org/Submission/CBD/) and [Shape Fragments](https://github.com/Shape-Fragments/old-shapefragments-paper/blob/main/fullpaper.pdf), thanks to [Thomas Bergwinkl and his blog post](https://www.bergnet.org/2023/03/2023/shacl-engine/) on a SHACL engine.

## Use it

```bash
npm install extract-cbd-shape
```

```javascript
import {CBDShapeExtractor} from "extract-cbd-shape";
// ...
let extractor = new CBDShapeExtractor(shapesGraph);
let entityquads = await extractor.extract(store, entityId, shapeId);
```

## Test it

Tests and examples provided in the [tests](tests/) library. Run them using mocha which can be invoked using `npm test`

## The extraction algorithm ##

This is an extension of [CBD](https://www.w3.org/submissions/CBD/). It extracts:
 1. all quads with subject this entity, and their blank node triples (recursively)
 2. all quads with a named graph matching the entity we’re looking up
 3. It takes hints from a Shape Template (see ↓)

To be discussed:
 1. _Should it also extract all RDF reification quads?_ (Included in the original CBD)
 2. _Should it also extract all singleton properties?_
 3. _Should it also extract RDF* annnotations?_

The first focus node is set by the user.
 1a. If a shape is set, create a shape template and execute the shape template extraction algorithm
 1b. If no shape was set, extract all quads with subject the focus node, and recursively include its blank nodes (see also [CBD](https://www.w3.org/submissions/CBD/))
 2. Extract all quads with the graph matching the focus node
 3. When no quads were extracted from 1 and 2, a client MUST dereference the focus node and re-execute 1 and 2.

### Shape Template extraction ###

The Shape Template is a structure that looks as follows:

```typescript
class ShapeTemplate {
    closed: boolean;
    requiredPaths: Path[];
    optionalPaths: Path[];
    nodelinks: NodeLink[];
    atLeastOneLists: [ Shape[] ];
}
class NodeLink {
    shape: ShapeTemplate;
    path: Path;
}
```

Paths in the shape templates are [SHACL Property Paths](https://www.w3.org/TR/shacl/#property-paths).

A Shape Template has
 * __Closed:__ A boolean telling whether it’s closed or not. If it’s open, a client MUST extract all quads, after a potential HTTP request to the focus node, with subject the focus node, and recursively include its blank nodes (see also [CBD](https://www.w3.org/submissions/CBD/))
 * __Required paths:__ MUST trigger an HTTP request if the member does not have this path. All quads from paths, after a potential HTTP request, matching this required path MUST be added to the Member set.
 * __Optional paths:__ All quads from paths, after a potential HTTP request, matching this path MUST be added to the Member set.
 * __Node Links:__ A nodelink contains a reference to another Shape Template, as well as a path. All quads, after a potential HTTP request, matching this path MUST be added to the Member set. The targets MUST be processed again using the shape template extraction algorithm on that 
 * __atLeastOneLists__: Each atLeastOneList is an array of at least one shape with one or more required paths and atLeastOneLists that must be set. If none of the shapes match, it will trigger an HTTP request. Only the quads from paths matching valid shapes are included in the Member.

Note: Certain quads are going to be matched by the algorithm multiple times. Each quad will of course be part of the member only once.

This results in this algorithm:
 1. If it is open, a client MUST extract all quads, after a potential HTTP request to the focus node, with subject the focus node, and recursively include its blank nodes (see also [CBD](https://www.w3.org/submissions/CBD/))
 2. If the current focus node is a named node and it was not requested before:
    - test if all required paths are set, if not do an HTTP request, if they are set, then,
    - test if at least one of each list in the atLeastOneLists was set. If not, do an HTTP request.
 3. Visit all paths (required, optional, nodelinks and recursively the shapes in the atLeastOneLists if the shape is valid) paths and add all quads necessary to reach the targets to the result
 4. For the results of nodelinks, if the target is a named node, set it as a focus node and repeat this algorithm with that nodelink’s shape as a shape

### Generating a shape template from SHACL ###

If there’s a shape set, the SHACL shape MUST be processed towards a Shape Template as follows:

 1. Checks if the shape is deactivated (`:S sh:deactivated true`), if it is, don’t continue
 2. Check if the shape is closed (`:S sh:closed true`), set the closed boolean to true.
 3. All `sh:property` elements with an `sh:node` link are added to the shape’s NodeLinks array
 4. Add all properties with `sh:minCount` > 0 to the Required Paths array, and all others to the optional paths.
 5. Processes the [conditionals](https://www.w3.org/TR/shacl/#core-components-logical) `sh:xone`, `sh:or` and `sh:and` (but doesn’t process `sh:not`):
    - `sh:and`: all properties on that shape template MUST be merged with the current shape template
    - `sh:xone` and `sh:or`: in both cases, at least one item must match at least one quad for all required paths. If not, it will do an HTTP request to the current namednode.

Note: The way we process SHACL shapes into Shape Template is important to understand in order to know when an HTTP request will be triggered when designing SHACL shapes. A cardinality constraint not being exactly matched or a `sh:pattern` not being respected will not trigger an HTTP request, and instead just add the invalid quads to the Member. This is a design choice: we only define triggers for HTTP request from the SHACL shape to come to a complete set of quads describing the member the data publisher pointed at using `tree:member`.

Note: it only takes _hints_ (it does not guarantee a result that validates) from an optional SHACL shapes graph. It only uses the parts relevant for discovery from the [SHACL Core Constraint Components](https://www.w3.org/TR/shacl/#core-components). It does not support SPARQL or Javascript.

It won’t:
 1. Process more complex validation instructions that are part of SHACL such as `sh:class`, inLanguage, pattern, value, qualified value shapes, etc. It is the data publisher’s responsibility to provide valid data, or it is the responsibility of the user of the library to validate the quads afterwards.
 2. Do automatic target selection based on e.g., targetClass: you need to set the target.

### Creating the Shape Template from ShEx

_TODO_
