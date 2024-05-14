import { Parser } from "n3";
import { Quad, QuadTermName, Stream, Term } from "@rdfjs/types";
import { DataFactory } from "rdf-data-factory";
import { CBDShapeExtractor } from "../dist/lib/CBDShapeExtractor";
import {
  RdfStore,
  RdfStoreIndexNestedMap,
  RdfStoreIndexNestedMapQuoted,
  TermDictionaryNumberRecordFullTerms,
  TermDictionaryQuotedIndexed,
} from "rdf-stores";
import * as Benchmark from "benchmark";
import type { Options } from "benchmark";
import { renderResults } from "./render";
import { Store } from "../dist/lib/Util";
import { EventEmitter } from "stream";

type DataType = "CBD" | "NamedNodes";

const GenerateData = (prefix: string, ty: DataType, graph?: Term): Quad[] => {
  let str: string;
  let graphStart = graph ? `<${graph.value}> {` : "";
  let graphEnd = graph ? `}` : "";
  if (ty === "CBD") {
    str = `
@prefix ns: <${prefix}>.
@prefix kbo: <https://kbopub.economie.fgov.be/kbo#> .
@prefix terms: <http://purl.org/dc/terms/> .
@prefix legal: <http://www.w3.org/ns/legal#>.
@prefix locn: <https://www.w3.org/ns/locn#> .

${graphStart}
ns:object a ns:Type, kbo:Enterprise ;
    terms:isVersionOf kbo:0877248501 ;
    legal:companyStatus [
      legal:lastSeen "SomeDate";
      legal:status kbo:Active;
    ];
    legal:companyType kbo:JuridicalForm_014 ;
    legal:legalName "AEDIFICA".


ns:object legal:registeredAddress [
      locn:postName "Ghent";
      locn:postCode 9000;
      locn:fullAddress "Appelstraat 2, 9000 Gent";
    ] ;
    kbo:activity kbo:2003_70201,
        kbo:2003_70203,
        kbo:2008_68201,
        kbo:2008_68203;
    kbo:establishment kbo:2277343234 ;
    kbo:status kbo:Status_AC .
${graphEnd}
`;
  } else {
    str = `
@prefix ns: <${prefix}>.
@prefix kbo: <https://kbopub.economie.fgov.be/kbo#> .
@prefix terms: <http://purl.org/dc/terms/> .
@prefix legal: <http://www.w3.org/ns/legal#>.
@prefix locn: <https://www.w3.org/ns/locn#> .

${graphStart}
ns:object a ns:Type, kbo:Enterprise ;
    terms:isVersionOf kbo:0877248501 ;
    legal:companyStatus ns:object_status;
    legal:companyType kbo:JuridicalForm_014 ;
    legal:legalName "AEDIFICA" .

ns:object_status 
      legal:lastSeen "SomeDate";
      legal:status kbo:Active.

ns:object
    legal:registeredAddress ns:object_address;
    kbo:activity kbo:2003_70201,
        kbo:2003_70203,
        kbo:2008_68201,
        kbo:2008_68203;
    kbo:establishment kbo:2277343234 ;
    kbo:status kbo:Status_AC .

ns:object_address 
    locn:postName "Ghent";
    locn:postCode 9000;
    locn:fullAddress "Appelstraat 2, 9000 Gent".
${graphEnd}

`;
  }

  return new Parser().parse(str);
};

type ShapeType = "Closed" | "OpenMinimal" | "OpenFull" | "Open" | "None";
const ShapeId = "http://test.com/shape";
const GenerateShape = (ty: ShapeType) => {
  if (ty == "None") return [];
  let str: string;
  if (ty === "Open") {
    str = `
@prefix sh:   <http://www.w3.org/ns/shacl#> .
@prefix kbo: <https://kbopub.economie.fgov.be/kbo#> .
@prefix terms: <http://purl.org/dc/terms/> .
@prefix legal: <http://www.w3.org/ns/legal#>.
@prefix locn: <https://www.w3.org/ns/locn#> .
<${ShapeId}> a sh:NodeShape;
    sh:targetClass kbo:Enterprise.
`;
  } else if (ty === "OpenMinimal") {
    str = `
@prefix sh:   <http://www.w3.org/ns/shacl#> .
@prefix kbo: <https://kbopub.economie.fgov.be/kbo#> .
@prefix terms: <http://purl.org/dc/terms/> .
@prefix legal: <http://www.w3.org/ns/legal#>.
@prefix locn: <https://www.w3.org/ns/locn#> .
<${ShapeId}> a sh:NodeShape;
    sh:targetClass kbo:Enterprise;
    sh:property [
      sh:path legal:registeredAddress;
      sh:node [];
    ];
    sh:property [
      sh:path legal:companyStatus;
      sh:node [];
    ].
`;
  } else {
    const closed = ty == "Closed";
    str = `
@prefix sh:   <http://www.w3.org/ns/shacl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix kbo: <https://kbopub.economie.fgov.be/kbo#> .
@prefix terms: <http://purl.org/dc/terms/> .
@prefix legal: <http://www.w3.org/ns/legal#>.
@prefix locn: <https://www.w3.org/ns/locn#> .
<${ShapeId}> a sh:NodeShape;
    sh:targetClass kbo:Enterprise;
    sh:closed ${closed}; 
    sh:property [
      sh:path legal:registeredAddress;
		  sh:node [
	      a sh:NodeShape ;
        sh:closed ${closed}; 
        sh:property [
          sh:path locn:postName;
        ], [
          sh:path locn:postCode;
        ], [
          sh:path locn:fullAddress;
        ];
      ];
    ], [
      sh:path legal:companyStatus;
      sh:node [
	      a sh:NodeShape ;
        sh:closed ${closed}; 
        sh:property [
          sh:path legal:lastSeen;
        ], [
          sh:path legal:status;
        ];
      ];
    ], [
      sh:path rdf:type;
    ], [
      sh:path terms:isVersionOf;
    ], [
      sh:path legal:companyType;
    ], [
      sh:path legal:legalName;
    ], [
      sh:path kbo:activity;
    ], [
      sh:path kbo:establishment;
    ], [
      sh:path kbo:status;
    ].
`;
  }

  return new Parser().parse(str);
};

function prefix(i: number, value?: string): string {
  return `http://prefix.com/${i}#${value ?? ""}`;
}

function createStore(): RdfStore {
  return new RdfStore<number>({
    indexCombinations: [
      ["graph", "subject", "predicate", "object"],
      ["graph", "predicate", "object", "subject"],
      ["graph", "object", "subject", "predicate"],
    ],
    indexConstructor: (subOptions) =>
      new RdfStoreIndexNestedMapQuoted(subOptions),
    dictionary: new TermDictionaryQuotedIndexed(
      new TermDictionaryNumberRecordFullTerms(),
    ),
    dataFactory: new DataFactory(),
    termsCardinalitySets: [<QuadTermName>"graph"],
  });
}

function addToSuite(
  suite: Benchmark.Suite,
  ty: ShapeType,
  dataType: DataType,
  graph: boolean,
  bulk: boolean,
  members: number,
  total: number,
  storeName: string,
  name?: string,
) {
  const id = name || `store=${storeName}&shape=${ty}&type=${dataType}&graph=${graph}&bulk=${bulk}&count=${members}&total=${total}`;
  // const id = `shape=${ty}/data=${dataType}/graph=${graph}/bulk=${bulk}/store=${storeName}/${members}/${total}`;
  const df = new DataFactory();

  const setup = function () {
    const shape = GenerateShape(<ShapeType>ty);
    const shapeStore = RdfStore.createDefault();
    shape.forEach((x) => shapeStore.addQuad(x));

    global.extractor = new CBDShapeExtractor(shapeStore);
    global.dataStore = createStore();

    for (let i = 0; i < total; i++) {
      const data = GenerateData(
        prefix(i),
        dataType,
        graph ? df.namedNode(prefix(i, "object")) : undefined,
      );
      data.forEach((x) => (<Store>global.dataStore).addQuad(x));
    }
  };

  let fn: Function;

  if (bulk) {
    fn = async function (res: Benchmark.Deferred) {
      const graphs = [...new Array(members)].map((_, i) =>
        df.namedNode(prefix(i, "object")),
      );

      const allGraphs = [...new Array(total)].map((_, i) =>
        df.namedNode(prefix(i, "object")),
      );

      (<CBDShapeExtractor>global.extractor!)
        .bulkExtract(
          global.dataStore!,
          graphs,
          (ty != "None" && df.namedNode(ShapeId)) || undefined,
          allGraphs,
        )
        .then((members) => {
          for (let member of members) {
            if (member.quads.length !== 18) {
              console.error(
              "Unexpected amount of quads: got " + member.quads.length,
              );
            }
          }
        })
        .then(() => res.resolve());
    };
  } else {
    fn = async function (res: Benchmark.Deferred) {
      const allGraphs = [...new Array(total)].map((_, i) =>
        df.namedNode(prefix(i, "object")),
      );

      const graphs = [...new Array(members)].map((_, i) =>
        df.namedNode(prefix(i, "object")),
      );
      graphs
        .reduce(
          (p, id) =>
            p.then(() =>
              (<CBDShapeExtractor>global.extractor!)
                .extract(
                  global.dataStore!,
                  id,
                  (ty != "None" && df.namedNode(ShapeId)) || undefined,
                  allGraphs,
                )
                .then((x) => {
                  if (x.length !== 18) {
                    console.error(
                      "Unexpected amount of quads: got " + x.length,
                    );
                    // throw ";
                  }
                }),
            ),
          Promise.resolve(),
        )
        .then(() => res.resolve());
    };
  }

  suite.add(<Options>{
    fn,
    setup,
    name: id,
    defer: true,
    entityCount: members,
  });
}

// async function main() {
//   const df = new DataFactory();
//   for (let ty of ["Closed", "OpenMinimal", "OpenFull"]) {
//     const shape = GenerateShape(<ShapeType>ty);
//     console.log("Shape", ty, shape.length);
//     const shapeStore = RdfStore.createDefault();
//     shape.forEach((x) => shapeStore.addQuad(x));
//     const extractor = new CBDShapeExtractor(shapeStore);
//     for (let ty of ["CBD", "NamedNodes"]) {
//       for (let graph of [df.namedNode("http://prefix.com/graph"), undefined]) {
//         const data = GenerateData("http://prefix.com/", <DataType>ty, graph);
//         const dataStore = RdfStore.createDefault();
//         data.forEach((x) => dataStore.addQuad(x));
//         const id = df.namedNode("http://prefix.com/object");
//         const found = await extractor.extract(
//           dataStore,
//           id,
//           df.namedNode(ShapeId),
//         );
//         console.log("ty", ty, graph?.value, data.length, found.length);
//       }
//     }
//   }
// }
// main();

const suite = new Benchmark.Suite(undefined);

const shapeTypes: ShapeType[] = ["Closed", "OpenFull", "OpenMinimal", "Open"];
const dataTypes: DataType[] = ["CBD", "NamedNodes"];

async function DataAndShapeTypes() {
  for (let totalI = 1; totalI < 250; totalI += 10) {
    const total = totalI * 100;
    for (let members of [100]) {
      for (let shape of <ShapeType[]>["OpenMinimal"]) {
        for (let dt of <DataType[]>["NamedNodes"]) {
          for (let graph of [true, false]) {
            for (let bulk of [true, false]) {
              // for (let total of [100, 500, 2000]) {
              if (members > total) continue;
              addToSuite(
                suite,
                shape,
                dt,
                graph,
                bulk,
                members,
                total,
                `pr-ed`,
              );
            }
          }
        }
      }
    }
  }
}

// DataAndShapeTypes();

function NewTest() {
  // named graph / shape named nodes / shape CBD / no shape CBD
  addToSuite(suite, "OpenMinimal", "CBD", true, false, 100, 100, "", "* - NamedGraph");
  // addToSuite(suite, "OpenMinimal", "NamedNodes", true, false, 100, 100, "");
  addToSuite(suite, "OpenFull", "CBD", false, false, 100, 100, "", "Full Shape - BlankNodes");
  addToSuite(suite, "OpenFull", "NamedNodes", false, false, 100, 100, "", "Full Shape - NamedNodes");
  // addToSuite(suite, "OpenFull", "NamedNodes", true, false, 100, 100, "");
  addToSuite(suite, "OpenMinimal", "NamedNodes", false, false, 100, 100, "", "Shape - NamedNodes");
  addToSuite(suite, "OpenMinimal", "CBD", false, false, 100, 100, "", "Shape - BlankNodes");
  addToSuite(suite, "None", "CBD", false, false, 100, 100, "", "No shape - CBD");
}

NewTest();

const options: QuadTermName[] = ["graph", "subject", "predicate", "object"];
function* generateCombinations(
  first: QuadTermName,
  offset: number,
): Generator<QuadTermName[]> {
  for (let second of options) {
    if (second == first) continue;
    for (let third of options) {
      if (third == first || third == second) continue;

      for (let fourth of options) {
        if (fourth == first || fourth == second || fourth == third) continue;
        const out = [second, third, fourth];
        yield [...out.slice(0, offset), first, ...out.slice(offset)];
      }
    }
  }
}

// All_Stores_Single();
//add listeners
suite
  .on("cycle", function (event) {
    console.log(String(event.target));
  })
  // add listeners
  .on("complete", function (c) {
    console.log(c);
    const results = this.map((test) => {
      return {
        name: test.name,
        opsPerSecond: test.hz * test.entityCount,
        samples: test.stats.sample.length,
        mean: test.stats.mean / test.entityCount,
        deviation: test.stats.deviation / test.entityCount,
      };
    });

    renderResults("bulk", results);
  })
  // run async
  .run({ async: true });
