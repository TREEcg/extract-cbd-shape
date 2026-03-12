import { describe, it, expect } from "vitest";
import { DataFactory } from "rdf-data-factory";
import { CBDShapeExtractor } from "../../lib/extract-cbd-shape";
import { RdfStore } from "rdf-stores";
import { rdfDereferencer } from "rdf-dereference";
import { Quadstore } from "quadstore";
import { Level } from "level";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

describe("CBDShapeExtractor should work with different store implementations", function () {
  const shapeExtractor = new CBDShapeExtractor();

  it("should extract same number of triples using rdf-stores and quadstore", async () => {
    // 1. Initialize both stores
    const rdfStore = RdfStore.createDefault();

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "quadstore-test-"));
    const backend = new Level(tempDir);
    const df = new DataFactory();
    const quadStore = new Quadstore({
      backend,
      dataFactory: df,
    });
    await quadStore.open();

    // 2. Load data
    const readStreamRdfStore = (
      await rdfDereferencer.dereference(
        "./tests/01 - fetching a shacl shape/shacl-catalog.ttl",
        { localFiles: true },
      )
    ).data;
    await new Promise((resolve, reject) => {
      rdfStore.import(readStreamRdfStore).on("end", resolve).on("error", reject);
    });

    const readStreamQuadStore = (
      await rdfDereferencer.dereference(
        "./tests/01 - fetching a shacl shape/shacl-catalog.ttl",
        { localFiles: true },
      )
    ).data;

    await new Promise((resolve, reject) => {

      quadStore.import(readStreamQuadStore).on("end", resolve).on("error", reject);
    });

    // 3. Extract using both stores
    const targetNode = df.namedNode("http://example.org/PersonShape");

    const resultRdfStore = await shapeExtractor.extract(rdfStore, targetNode);
    const resultQuadStore = await shapeExtractor.extract(quadStore, targetNode);

    // 4. Assert
    expect(resultQuadStore.length, "Both stores should return the same number of triples").toBe(resultRdfStore.length);

    expect(resultRdfStore.length).toBe(11);
    expect(resultQuadStore.length).toBe(11);

    await quadStore.close();
    await backend.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });
});
