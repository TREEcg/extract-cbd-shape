import { describe, it, expect } from "vitest";
import { DataFactory } from "rdf-data-factory";
import { CBDShapeExtractor } from "../../lib/extract-cbd-shape";
import { RdfStore } from "rdf-stores";
import { rdfDereferencer } from "rdf-dereference";

const df = new DataFactory();

describe("Tests whether plain CBD works using the data from 01 and 02", function () {
  it("Example 01 should return 11 triples with CBD", async () => {
    let extractor = new CBDShapeExtractor();
    let dataStore = RdfStore.createDefault();
    let readStream = (
      await rdfDereferencer.dereference(
        "./tests/01 - fetching a shacl shape/shacl-catalog.ttl",
        { localFiles: true },
      )
    ).data;
    await new Promise((resolve, reject) => {
      dataStore.import(readStream).on("end", resolve).on("error", reject);
    });
    let result = await extractor.extract(
      dataStore,
      df.namedNode("http://example.org/PersonShape"),
    );
    //let writer = new Writer();
    //writer.addQuads(result);
    //writer.end((err, res) => {console.log(res);});
    expect(result.length).toBe(11); // Only this many triples are given using plain CBD
  });
  it("Example 02 should return 2 triples with CBD", async () => {
    let extractor = new CBDShapeExtractor();
    let dataStore = RdfStore.createDefault();
    let readStream = (
      await rdfDereferencer.dereference(
        "./tests/02 - marine regions LDES/data.ttl",
        { localFiles: true },
      )
    ).data;
    await new Promise((resolve, reject) => {
      dataStore.import(readStream).on("end", resolve).on("error", reject);
    });
    let result = await extractor.extract(
      dataStore,
      df.namedNode("http://marineregions.org/mrgid/24983?t=1690208097"),
    );
    //let writer = new Writer();
    //writer.addQuads(result);
    //writer.end((err, res) => {console.log(res);});
    expect(result.length).toBe(2); // Only this many triples are given using plain CBD
  });
});

describe("Test CBD with nested blank nodes", async () => {
  it("Should be able to process nested blank nodes", async () => {
    let extractor = new CBDShapeExtractor();
    let dataStore = RdfStore.createDefault();
    let readStream = (
      await rdfDereferencer.dereference(
        "./tests/03 - CBD tests without a shape/data.ttl",
        { localFiles: true },
      )
    ).data;
    await new Promise((resolve, reject) => {
      dataStore.import(readStream).on("end", resolve).on("error", reject);
    });
    let result = await extractor.extract(
      dataStore,
      df.namedNode("http://example.org/A"),
    );
    //        let writer = new Writer();
    //        writer.addQuads(result);
    //        writer.end((err, res) => {console.log(res);});
    expect(result.length).toBe(4); // Only this many triples are given using plain CBD
  });

  it("Should be able to process cyclic blank nodes", async () => {
    let extractor = new CBDShapeExtractor(undefined, undefined, {
      cbdDefaultGraph: true,
    });
    let dataStore = RdfStore.createDefault();
    const member = df.namedNode("https://example.test/member/complex");
    const payloadPart = df.namedNode("https://example.test/payload-part");
    const value = df.namedNode("https://example.test/vocab/value");
    const detail = df.namedNode("https://example.test/vocab/detail");
    const next = df.namedNode("https://example.test/vocab/next");
    const first = df.blankNode("first");
    const second = df.blankNode("second");

    dataStore.addQuad(df.quad(member, value, df.literal("default")));
    dataStore.addQuad(df.quad(member, detail, first));
    dataStore.addQuad(df.quad(first, next, second));
    dataStore.addQuad(df.quad(second, next, first));
    dataStore.addQuad(df.quad(second, value, df.literal("nested")));
    dataStore.addQuad(df.quad(member, value, df.literal("named graph"), member));
    dataStore.addQuad(
      df.quad(
        payloadPart,
        value,
        df.literal("all quads in the member graph"),
        member,
      ),
    );

    let result = await extractor.extract(dataStore, member);

    expect(result.length).toBe(7);
    expect(result).toEqual(
      expect.arrayContaining([
        df.quad(member, value, df.literal("default")),
        df.quad(member, detail, first),
        df.quad(first, next, second),
        df.quad(second, next, first),
        df.quad(second, value, df.literal("nested")),
        df.quad(member, value, df.literal("named graph"), member),
        df.quad(
          payloadPart,
          value,
          df.literal("all quads in the member graph"),
          member,
        ),
      ]),
    );
  });
});

describe("Test CBD with named graph", () => {
  it("Should retrieve all triples within a graph", async () => {
    let extractor = new CBDShapeExtractor();
    let dataStore = RdfStore.createDefault();
    let readStream = (
      await rdfDereferencer.dereference(
        "./tests/03 - CBD tests without a shape/data.ttl",
        { localFiles: true },
      )
    ).data;
    await new Promise((resolve, reject) => {
      dataStore.import(readStream).on("end", resolve).on("error", reject);
    });
    let result = await extractor.extract(
      dataStore,
      df.namedNode("http://example.org/C"),
    );
    //let writer = new Writer();
    //writer.addQuads(result);
    //writer.end((err, res) => {console.log(res);});
    expect(result.length).toBe(4); // Only this many triples are given using plain CBD
  });
  it("Should retrieve all triples within a graph and combine it with the triples found from CBD", async () => {
    let extractor = new CBDShapeExtractor();
    let dataStore = RdfStore.createDefault();
    let readStream = (
      await rdfDereferencer.dereference(
        "./tests/03 - CBD tests without a shape/data.ttl",
        { localFiles: true },
      )
    ).data;
    await new Promise((resolve, reject) => {
      dataStore.import(readStream).on("end", resolve).on("error", reject);
    });
    let result = await extractor.extract(
      dataStore,
      df.namedNode("http://example.org/B"),
    );
    //let writer = new Writer();
    //writer.addQuads(result);
    //writer.end((err, res) => {console.log(res);});
    expect(result.length).toBe(8); // Only this many triples are given using plain CBD
  });
  it("Should retrieve only the quads from that particular update in an LDES", async () => {
    let extractor = new CBDShapeExtractor();
    let dataStore = RdfStore.createDefault();
    let readStream = (
      await rdfDereferencer.dereference(
        "./tests/03 - CBD tests without a shape/data.ttl",
        { localFiles: true },
      )
    ).data;
    await new Promise((resolve, reject) => {
      dataStore.import(readStream).on("end", resolve).on("error", reject);
    });
    let result = await extractor.extract(
      dataStore,
      df.namedNode("http://example.org/Activity1"),
    );
    //let writer = new Writer();
    //writer.addQuads(result);
    //writer.end((err, res) => {console.log(res);});
    expect(result.length).toBe(6); // Only this many triples are given using plain CBD
    ///// LIMITATION: You can only describe the triples that don’t overlap in the SHACL shape. From the moment you use a named graph, you cannot describe what’s inside using the tree:shape.
  });
});
