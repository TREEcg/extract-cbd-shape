# Extract CBD Shape

Given (i) an N3 Store of triples, (ii) an N3 Store with a SHACL shape’s triples, and (iii) a target entity URI,
this library will extract all triples that belong to the entity.
If more triples of the entity are needed, extra triples are retrieved by dereferencing the relevant entity.

The algorithm is a proposal to be standardized as part of [W3C’s TREE hypermedia Community Group](https://w3id.org/tree/specification) as the member extraction algorithm. This algorithm needs to be efficient and unambiguously defined, so that various implementations of the member extraction algorithm will result in the same set of triples. As a trade-off, the resulting set of triples is not guaranteed to be validated by the SHACL shape.

The algorithm is inspired by, and an in-between between [CBD](https://www.w3.org/Submission/CBD/) and [Shape Fragments](https://github.com/Shape-Fragments/old-shapefragments-paper/blob/main/fullpaper.pdf), thanks to [Thomas Bergwinkl and his blog post](https://www.bergnet.org/2023/03/2023/shacl-engine/) on a SHACL engine.

## Use it

```bash
## Package not yet available on NPM
npm install extract-cbd-shape
```

```javascript
import {CBDShapeExtractor} from "extract-cbd-shape";
// ...
let extractor = new CBDShapeExtractor(shapesGraph);
let entityquads = await extractor.extract(store, entityId, shapeId);
```

## Test it

Tests and examples provided in the [tests](tests/) library

## Algorithm and limitations

This is an extension of CBD:
 1. Fetches all quads with subject this entity, and their blank node triples (recursively)
 2. Fetches all quads with graph this entity (TODO)
 3. Fetches all RDF reification triples (TODO)
 4. Fetches all singleton properties (TODO)
 5. _Should it also extract RDF* annnotations?_

If no triples were found based on CBD, it does an HTTP request to the entity’s IRI (fallback to IRI dereferencing)

Next, it takes _hints_ (it does not guarantee a result that validates) from an optional SHACL shapes graph:
 1. Checks if the Shape is deactivated first
 2. Processes `sh:xone`, `sh:or` and `sh:and` (but doesn’t process `sh:not` -- See https://www.w3.org/TR/shacl/#core-components-logical):
     * For `sh:or` and `sh:and` (in worst-case, `sh:or` is also the `sh:and` case and therefore -- in order to be logically sound --, for discovery, they are logically the same): it just adds all properties of the entire list to the required properties list.
     * For `sh:xone`: Two iterations are necessary in worst case:
         - Iterate over the list
         - The first match that is found is processed, the rest is ignored
         - If nothing was however found, it starts over, but dereferences the node that needs to be found.
 3. Processes all `sh:property` links to property shapes. Only marks a property as required if `sh:minCount` > 0. It does not validate cardinalities.
 4. It processes the full `sh:path` and includes the triples necessary to reach the path.
 5. Won’t process `sh:value` and `sh:QualifiedValueShapes`: if it provides a wrong item, that’s the data publisher’s fault
 6. ISSUE: Doesn’t (yet?) process `ex:node sh:class ex:S` as `ex:node sh:property [ sh:path ( rdf:type [sh:zeroOrMorePath rdfs:subClassOf ]); sh:value ex:S ; sh:minCount 1 ;]` -- But we should probably look into doing this, although entailment regimes might make this task complex, and we said we wouldn’t process sh:value... 
 

A nodeshape is just an array of property shapes.

Features from SHACL we’re ignoring and limitations:
 * Target selection: in this case, the NodeShape and entity from where to start need to be provided by the user of the library
 * Constraints: as it’s not the goal to provide a valid shape per se, but to describe the entity while taking hint from the shape, we ignore all property constraints.
 * Circular shapes that can explode: Person → knows → Person → knows → Person → etc. Can we warn the shape designer somehow when a shape gets processed into a circular reference?

e.g.:
```turtle
[] sh:property [
    sh:path ex:knows
    sh:or ( [sh:class foaf:Person] [sh:class schema:Person])
] .
```

Note: as we must process `sh:or` in the same way as a `sh:and` to be logically sound, it can easily blow up the number of HTTP requests the extraction algorithm is going to do. In order to avoid this, we propose SHACL shape builders to prioritize the use of `sh:xone`, where we can be sure that no other required properties will be used.