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

const closedHierarchyPage = () => {
  const ids = Array.from({ length: 24 }, (_, index) => index + 1);
  const members = ids.map((id) => `    ${memberIri(id)}`).join(",\n");
  const descriptions = ids
    .map(
      (id) => `${memberIri(id)}
  a ex:Observation ;
  ex:name "Air-quality observation ${id}" ;
  ex:status "${id % 4 === 0 ? "review" : "published"}" ;
  ex:value ${(41 + id * 1.37).toFixed(2)} ;
  ex:internalNote "Operations-only note ${id}" ;
  ex:location [
    ex:station "Station ${String((id % 6) + 1).padStart(2, "0")}" ;
    ex:city "${id % 2 === 0 ? "Ghent" : "Brussels"}" ;
    ex:operator [
      ex:name "Operator ${String((id % 5) + 1).padStart(2, "0")}" ;
      ex:phone "+32-9-555-${String(id).padStart(4, "0")}" ;
      ex:clearanceCode "hidden-${id}"
    ] ;
    ex:privateRoom "Room ${100 + id}"
  ] .`,
    )
    .join("\n\n");

  return `@prefix ex: <https://example.org/> .
@prefix tree: <https://w3id.org/tree#> .

# One page containing 24 observations. The closed shape extracts only
# the public hierarchy from member 12, location, and operator.
ex:page/air-quality
  a tree:Node ;
  tree:member
${members} .

${descriptions}`;
};

const openDefaultGraphPage = () => {
  const ids = Array.from({ length: 22 }, (_, index) => index + 1);
  const members = ids.map((id) => `    ${memberIri(id)}`).join(",\n");
  const profiles = ids
    .map((id) => {
      const managerId = (id % 4) + 1;
      return `${memberIri(id)}
  a ex:Profile ;
  ex:name "Member ${String(id).padStart(2, "0")}" ;
  ex:role "${id % 3 === 0 ? "Maintainer" : "Contributor"}" ;
  ex:email "member${id}@example.org" ;
  ex:score ${70 + id} ;
  ex:accountManager ex:agent/${managerId} .`;
    })
    .join("\n\n");
  const agents = Array.from({ length: 4 }, (_, index) => index + 1)
    .map(
      (id) => `ex:agent/${id}
  a ex:Agent ;
  ex:name "Account manager ${id}" ;
  ex:team "Community success" ;
  ex:privateExtension "ext-${100 + id}" .`,
    )
    .join("\n\n");

  return `@prefix ex: <https://example.org/> .
@prefix tree: <https://w3id.org/tree#> .

# A default-graph member page. The open shape keeps member CBD data and
# additionally follows ex:accountManager to include manager details.
ex:page/community
  a tree:Node ;
  tree:member
${members} .

${profiles}

${agents}`;
};

const openNamedGraphPage = () => {
  const ids = Array.from({ length: 20 }, (_, index) => index + 31);
  const members = ids.map((id) => `    ${memberIri(id)}`).join(",\n");
  const memberGraphs = ids
    .map((id) => {
      const technicianId = (id % 5) + 1;
      return `${memberIri(id)} {
  ${memberIri(id)}
    a ex:SensorReading ;
    ex:name "Reading ${id}" ;
    ex:status "${id % 3 === 0 ? "flagged" : "active"}" ;
    ex:value ${(18 + id / 10).toFixed(1)} ;
    ex:technician ex:technician/${technicianId} ;
    ex:location [
      ex:lat "${(50.8 + id / 1000).toFixed(3)}" ;
      ex:long "${(3.6 + id / 1000).toFixed(3)}"
    ] .
}`;
    })
    .join("\n\n");
  const technicianGraphs = Array.from({ length: 5 }, (_, index) => index + 1)
    .map(
      (id) => `ex:technician/${id} {
  ex:technician/${id}
    a ex:Technician ;
    ex:name "Technician ${id}" ;
    ex:team "Field operations" ;
    ex:internalBadge "badge-${id}" .
}`,
    )
    .join("\n\n");

  return `@prefix ex: <https://example.org/> .
@prefix tree: <https://w3id.org/tree#> .

# One TriG page containing 20 members and related technicians in named graphs.
ex:page/sensor-readings
  a tree:Node ;
  tree:member
${members} .

${memberGraphs}

${technicianGraphs}`;
};

const closedHierarchyShape = `@prefix ex: <https://example.org/> .
@prefix sh: <http://www.w3.org/ns/shacl#> .

ex:ObservationPublicShape
  a sh:NodeShape ;
  sh:closed true ;
  sh:property [
    sh:path ex:name ;
    sh:minCount 1
  ] ;
  sh:property [
    sh:path ex:status ;
    sh:minCount 1
  ] ;
  sh:property [
    sh:path ex:location ;
    sh:node ex:LocationPublicShape ;
    sh:minCount 1
  ] .

ex:LocationPublicShape
  a sh:NodeShape ;
  sh:closed true ;
  sh:property [
    sh:path ex:station ;
    sh:minCount 1
  ] ;
  sh:property [
    sh:path ex:city ;
    sh:minCount 1
  ] ;
  sh:property [
    sh:path ex:operator ;
    sh:node ex:OperatorPublicShape ;
    sh:minCount 1
  ] .

ex:OperatorPublicShape
  a sh:NodeShape ;
  sh:closed true ;
  sh:property [
    sh:path ex:name ;
    sh:minCount 1
  ] .`;

const openProfileShape = `@prefix ex: <https://example.org/> .
@prefix sh: <http://www.w3.org/ns/shacl#> .

ex:OpenProfileShape
  a sh:NodeShape ;
  sh:property [
    sh:path ex:accountManager ;
    sh:node ex:AccountManagerShape ;
    sh:minCount 1
  ] .

ex:AccountManagerShape
  a sh:NodeShape ;
  sh:property [
    sh:path ex:name ;
    sh:minCount 1
  ] ;
  sh:property [
    sh:path ex:team ;
    sh:minCount 1
  ] .`;

const openNamedGraphShape = `@prefix ex: <https://example.org/> .
@prefix sh: <http://www.w3.org/ns/shacl#> .

ex:OpenReadingShape
  a sh:NodeShape ;
  sh:property [
    sh:path ex:technician ;
    sh:node ex:TechnicianShape ;
    sh:minCount 1
  ] .

ex:TechnicianShape
  a sh:NodeShape ;
  sh:property [
    sh:path ex:name ;
    sh:minCount 1
  ] ;
  sh:property [
    sh:path ex:team ;
    sh:minCount 1
  ] .`;

export const examples: PlaygroundExample[] = [
  {
    name: "Closed hierarchy",
    description:
      "Project one observation through a closed nested shape and exclude private fields.",
    focusNode: "https://example.org/member/12",
    shapeNode: "https://example.org/ObservationPublicShape",
    data: closedHierarchyPage(),
    shape: closedHierarchyShape,
  },
  {
    name: "Open default graph",
    description:
      "Keep the member CBD in the default graph and follow a shaped manager link.",
    focusNode: "https://example.org/member/17",
    shapeNode: "https://example.org/OpenProfileShape",
    data: openDefaultGraphPage(),
    shape: openProfileShape,
  },
  {
    name: "Open named graphs",
    description:
      "Extract a member graph while an open shape follows related named-graph data.",
    focusNode: "https://example.org/member/42",
    shapeNode: "https://example.org/OpenReadingShape",
    data: openNamedGraphPage(),
    shape: openNamedGraphShape,
  },
];
