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
