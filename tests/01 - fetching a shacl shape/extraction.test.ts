import { describe, it, beforeAll, expect } from "vitest";
import { DataFactory } from "rdf-data-factory";
import { RdfStore } from "rdf-stores";
import { CBDShapeExtractor } from "../../lib/CBDShapeExtractor";
import { rdfDereferencer } from "rdf-dereference";

const df = new DataFactory();

describe("Check whether we can successfully extract a SHACL shape", async () => {
   let shapeStore = RdfStore.createDefault();
   let extractor: CBDShapeExtractor;
   let dataStore = RdfStore.createDefault();
   beforeAll(async () => {
      let readStream = (
         await rdfDereferencer.dereference(
            "./tests/01 - fetching a shacl shape/shacl-shacl.ttl",
            { localFiles: true },
         )
      ).data;
      await new Promise((resolve, reject) => {
         shapeStore.import(readStream).on("end", resolve).on("error", reject);
      });
      extractor = new CBDShapeExtractor(shapeStore);
      let readStream2 = (
         await rdfDereferencer.dereference(
            "./tests/01 - fetching a shacl shape/shacl-catalog.ttl",
            { localFiles: true },
         )
      ).data;
      await new Promise((resolve, reject) => {
         dataStore.import(readStream2).on("end", resolve).on("error", reject);
      });
   });

   it("Extracts a SHACL shape from a shape catalog", async () => {
      let result = await extractor.extract(
         dataStore,
         df.namedNode("http://example.org/PersonShape"),
         df.namedNode("http://www.w3.org/ns/shacl-shacl#NodeShapeShape"),
      );
      expect(result.length).toBe(11); // Just testing whether there are 11 quads being returned
   });

   it("Can extract another iteration with the same instance", async () => {
      let result = await extractor.extract(
         dataStore,
         df.namedNode("http://example.org/PersonShape"),
         df.namedNode("http://www.w3.org/ns/shacl-shacl#NodeShapeShape"),
      );
      //let writer = new Writer();
      //writer.addQuads(result);
      //writer.end((err, res) => {console.log(res);});
      expect(result.length).toBe(11); // Just testing whether there are 11 quads being returned
   });
   it("Can extract a deeper nested organization based on an optional sh:node link", async () => {
      //console.log(extractor.shapesGraph.shapes.get("http://www.w3.org/ns/shacl-shacl#NodeShape"));
      let result = await extractor.extract(
         dataStore,
         df.namedNode("http://example.org/OrganizationShape"),
         df.namedNode("http://www.w3.org/ns/shacl-shacl#NodeShapeShape"),
      );
      //let writer = new Writer();
      //writer.addQuads(result);
      //writer.end((err, res) => {console.log(res);});
      expect(result.length).toBe(16); // Just testing whether there are 16 quads being returned now
   });

   it("Can extract itself from itself", async () => {
      let result = await extractor.extract(
         shapeStore,
         df.namedNode("http://www.w3.org/ns/shacl-shacl#ShapeShape"),
         df.namedNode("http://www.w3.org/ns/shacl-shacl#ShapeShape"),
      );
      /*let writer = new Writer();
          writer.addQuads(result);
          writer.end((err, res) => {console.log(res);});*/

      //TODO: Didn’t yet calculate how many actually should be returned here... Just assumed this number is correct...
      expect(result.length).toBe(273); // Just testing whether there are quads being returned now
   });
});
