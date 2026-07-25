import Benchmark from "benchmark";
import { rdfDereferencer } from "rdf-dereference";
import { DataFactory } from "rdf-data-factory";
import {
  CBDShapeExtractor,
  createGraphIndexedRdfStore,
} from "./load-extractor.js";
import { renderResults } from "./render.js";

const df = new DataFactory();
const treeMember = df.namedNode("https://w3id.org/tree#member");
const memberShape = df.namedNode("http://example.org/memberShape");

Benchmark.options.minSamples = 40;
Benchmark.options.maxTime = 2;

const loadStore = async (file) => {
  const store = createGraphIndexedRdfStore();
  const stream = (
    await rdfDereferencer.dereference(file, { localFiles: true })
  ).data;
  await new Promise((resolve, reject) => {
    store.import(stream).on("end", resolve).on("error", reject);
  });
  return store;
};

const addAsyncBenchmark = (suite, name, fn) => {
  suite.add(name, {
    defer: true,
    fn(deferred) {
      fn().then(
        () => deferred.resolve(),
        (error) => {
          console.error(`${name} failed`, error);
          process.exitCode = 1;
          deferred.benchmark.abort();
          deferred.resolve();
        },
      );
    },
  });
};

const defaultGraphPage = await loadStore("./perf/resources/member-1000.ttl");
const shapeStore = await loadStore("./perf/resources/shacl-member.ttl");
const members = defaultGraphPage
  .getQuads(null, treeMember, null, null)
  .map((quad) => quad.object);

const namedGraphPage = createGraphIndexedRdfStore();
for (const [index, member] of members.entries()) {
  for (let property = 0; property < 4; property++) {
    namedGraphPage.addQuad(
      df.quad(
        member,
        df.namedNode(`http://example.org/property-${property}`),
        df.literal(String(index)),
        member,
      ),
    );
  }
}

const extractor = new CBDShapeExtractor();
const shapedExtractor = new CBDShapeExtractor(shapeStore);

// Keep shape preprocessing outside the warm throughput measurements.
await shapedExtractor.extract(defaultGraphPage, members[0], memberShape);

const namedGraphCheck = await extractor.bulkExtract(namedGraphPage, members);
if (
  namedGraphCheck.length !== members.length ||
  namedGraphCheck.some((member) => member.quads.length !== 4)
) {
  throw new Error("Named-graph page extraction returned unexpected results");
}

const suite = new Benchmark.Suite(undefined, { maxTime: 2 });

addAsyncBenchmark(suite, "Page1000#SequentialDefaultGraph", async () => {
  for (const member of members) {
    await extractor.extract(defaultGraphPage, member);
  }
});

addAsyncBenchmark(suite, "Page1000#BulkDefaultGraph", async () => {
  await extractor.bulkExtract(defaultGraphPage, members);
});

addAsyncBenchmark(suite, "Page1000#SequentialNamedGraphs", async () => {
  for (const member of members) {
    await extractor.extract(namedGraphPage, member);
  }
});

addAsyncBenchmark(suite, "Page1000#BulkNamedGraphs", async () => {
  await extractor.bulkExtract(namedGraphPage, members);
});

addAsyncBenchmark(suite, "Page1000#BulkWithShape", async () => {
  await shapedExtractor.bulkExtract(defaultGraphPage, members, memberShape);
});

addAsyncBenchmark(suite, "Page1000#ColdBulkWithShape", async () => {
  const coldExtractor = new CBDShapeExtractor(shapeStore);
  await coldExtractor.bulkExtract(defaultGraphPage, members, memberShape);
});

suite
  .on("cycle", (event) => {
    console.log(String(event.target));
  })
  .on("complete", async function () {
    const results = this.map((test) => ({
      name: test.name,
      opsPerSecond: test.hz,
      samples: test.stats.sample.length,
      mean: test.stats.mean,
      deviation: test.stats.deviation,
    }));
    await renderResults("page", results);
  })
  .run({ async: true });
