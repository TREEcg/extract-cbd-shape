export type PlaygroundExample = {
  name: string;
  description: string;
  focusNode: string;
  shapeNode: string;
  data: string;
  shape: string;
};

const memberIri = (id: number) =>
  `ex:member/${String(id).padStart(2, "0")}`;

const defaultGraphPage = () => {
  const ids = Array.from({ length: 24 }, (_, index) => index + 1);
  const members = ids
    .map((id) => `    ${memberIri(id)}`)
    .join(",\n");
  const descriptions = ids
    .map(
      (id) => `${memberIri(id)}
  a ex:Observation ;
  ex:name "Air-quality observation ${id}" ;
  ex:status "${id % 4 === 0 ? "review" : "published"}" ;
  ex:value ${(41 + id * 1.37).toFixed(2)} ;
  ex:location [
    ex:station "Station ${String((id % 6) + 1).padStart(2, "0")}" ;
    ex:city "${id % 2 === 0 ? "Ghent" : "Brussels"}"
  ] .`,
    )
    .join("\n\n");

  return `@prefix ex: <https://example.org/> .
@prefix tree: <https://w3id.org/tree#> .

# One page containing 24 members. Only member 12 is extracted.
ex:page/2026-07-25
  a tree:Node ;
  tree:member
${members} .

${descriptions}`;
};

const namedGraphPage = () => {
  const ids = Array.from({ length: 18 }, (_, index) => index + 34);
  const members = ids
    .map((id) => `    ${memberIri(id)}`)
    .join(",\n");
  const graphs = ids
    .map(
      (id) => `${memberIri(id)} {
  ${memberIri(id)}
    a ex:SensorReading ;
    ex:name "Reading ${id}" ;
    ex:status "${id % 3 === 0 ? "flagged" : "active"}" ;
    ex:value ${(18 + id / 10).toFixed(1)} ;
    ex:location [
      ex:lat "${(50.8 + id / 1000).toFixed(3)}" ;
      ex:long "${(3.6 + id / 1000).toFixed(3)}"
    ] .
}`,
    )
    .join("\n\n");

  return `@prefix ex: <https://example.org/> .
@prefix tree: <https://w3id.org/tree#> .

# One TriG page containing 18 members in their own named graphs.
ex:page/sensor-readings
  a tree:Node ;
  tree:member
${members} .

${graphs}`;
};

const shapedPage = () => {
  const ids = Array.from({ length: 20 }, (_, index) => index + 1);
  const members = ids
    .map((id) => `    ${memberIri(id)}`)
    .join(",\n");
  const profiles = ids
    .map(
      (id) => `${memberIri(id)}
  a ex:Profile ;
  ex:name "Member ${String(id).padStart(2, "0")}" ;
  ex:role "${id % 3 === 0 ? "Maintainer" : "Contributor"}" ;
  ex:email "member${id}@example.org" ;
  ex:internalNote "Private administration value ${id}" ;
  ex:score ${70 + id} .`,
    )
    .join("\n\n");

  return `@prefix ex: <https://example.org/> .
@prefix tree: <https://w3id.org/tree#> .

# The page has 20 full profiles. The shape exposes three properties
# from member 17 and excludes email, score and internal notes.
ex:page/community
  a tree:Node ;
  tree:member
${members} .

${profiles}`;
};

export const examples: PlaygroundExample[] = [
  {
    name: "24-member page",
    description: "Extract one CBD and its nested location from a larger Turtle page.",
    focusNode: "https://example.org/member/12",
    shapeNode: "",
    data: defaultGraphPage(),
    shape: "",
  },
  {
    name: "18 named graphs",
    description: "Find one member represented by its own graph in a TriG page.",
    focusNode: "https://example.org/member/42",
    shapeNode: "",
    data: namedGraphPage(),
    shape: "",
  },
  {
    name: "20 shaped profiles",
    description: "Project one public member view from a page of complete profiles.",
    focusNode: "https://example.org/member/17",
    shapeNode: "https://example.org/PublicProfileShape",
    data: shapedPage(),
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
    sh:path ex:role ;
    sh:minCount 1
  ] .`,
  },
];
