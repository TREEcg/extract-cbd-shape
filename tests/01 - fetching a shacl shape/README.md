# Fetching a SHACL shape

Use case description:

A SHACL shape may be contained in multiple files. The Extract CBD Shape algorithm retrieves all triples of interest to a SHACL validator from an RDF store.

This example has a SHACL catalog describing multiple SHACL files. 

Test case:
```javascript
import {ShapeExtractor} from "extract-cbd-shape";
// ...
let shapeExtractor = new ShapeExtractor(shaclShape, dereferencer);
let entityquads = await shapeExtractor.extract(store, entity);
```
