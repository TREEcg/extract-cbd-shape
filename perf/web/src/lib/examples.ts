export type PlaygroundExample = {
  name: string;
  description: string;
  focusNode: string;
  shapeNode: string;
  data: string;
  shape: string;
};

export const examples: PlaygroundExample[] = [
  {
    name: "Blank-node CBD",
    description: "Follow a member’s outgoing statements and nested blank nodes.",
    focusNode: "https://example.org/alice",
    shapeNode: "",
    data: `@prefix ex: <https://example.org/> .

ex:alice
  ex:name "Alice" ;
  ex:role "Data engineer" ;
  ex:address [
    ex:city "Ghent" ;
    ex:country "Belgium"
  ] ;
  ex:knows ex:bob .

ex:bob ex:name "Bob" .`,
    shape: "",
  },
  {
    name: "Named-graph member",
    description: "Include statements published in the member’s own named graph.",
    focusNode: "https://example.org/member/42",
    shapeNode: "",
    data: `@prefix ex: <https://example.org/> .

ex:member/42 {
  ex:member/42
    ex:name "Station 42" ;
    ex:status "active" ;
    ex:location [
      ex:lat "51.05" ;
      ex:long "3.72"
    ] .
}

ex:collection ex:member ex:member/42 .`,
    shape: "",
  },
  {
    name: "Closed SHACL view",
    description: "Use a closed shape to select a focused public projection.",
    focusNode: "https://example.org/alice",
    shapeNode: "https://example.org/PublicProfileShape",
    data: `@prefix ex: <https://example.org/> .

ex:alice
  ex:name "Alice" ;
  ex:email "alice@example.org" ;
  ex:internalNote "Not part of the public view" ;
  ex:knows ex:bob .

ex:bob ex:name "Bob" .`,
    shape: `@prefix ex: <https://example.org/> .
@prefix sh: <http://www.w3.org/ns/shacl#> .

ex:PublicProfileShape
  a sh:NodeShape ;
  sh:closed true ;
  sh:property [
    sh:path ex:name ;
    sh:minCount 1
  ] ;
  sh:property [
    sh:path ex:knows ;
    sh:minCount 1
  ] .`,
  },
];
