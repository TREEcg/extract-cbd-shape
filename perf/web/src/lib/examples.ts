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

const treeMembers = (ids: number[]) =>
  ids.map((id) => `    ${memberIri(id)}`).join(",\n");

const simpleCbdPage = () => {
  const ids = Array.from({ length: 18 }, (_, index) => index + 1);
  const members = treeMembers(ids);
  const observations = ids
    .map((id) => {
      const stationId = (id % 5) + 1;
      return `${memberIri(id)}
  a ex:Observation ;
  ex:name "Observation ${String(id).padStart(2, "0")}" ;
  ex:result ${(18 + id / 10).toFixed(1)} ;
  ex:measurement [
    ex:unit "Celsius" ;
    ex:value ${(18 + id / 10).toFixed(1)} ;
    ex:quality [
      ex:label "${id % 4 === 0 ? "review" : "accepted"}" ;
      ex:score ${80 + id}
    ]
  ] ;
  ex:observedBy ex:station/${stationId} .

ex:station/${stationId}
  a ex:Station ;
  ex:name "Station ${stationId}" ;
  ex:operator "Shared operator ${stationId}" .`;
    })
    .join("\n\n");

  return `@prefix ex: <https://example.org/> .
@prefix tree: <https://w3id.org/tree#> .

# Simple CBD: blank nodes are followed recursively, but the named station
# linked through ex:observedBy is not pulled into the member description.
ex:page/simple-cbd
  a tree:Node ;
  tree:member
${members} .

${observations}`;
};

const namedGraphPayloadPage = () => {
  const ids = Array.from({ length: 16 }, (_, index) => index + 1);
  const members = treeMembers(ids);
  const defaultGraph = ids
    .map(
      (id) => `${memberIri(id)}
  a ex:Event ;
  ex:summary "Default graph summary ${id}" ;
  ex:payloadGraph ${memberIri(id)} .`,
    )
    .join("\n\n");
  const namedGraphs = ids
    .map(
      (id) => `${memberIri(id)} {
  ${memberIri(id)}
    ex:detail "Payload detail ${id}" ;
    ex:status "${id % 3 === 0 ? "flagged" : "published"}" ;
    ex:location [
      ex:city "${id % 2 === 0 ? "Ghent" : "Brussels"}" ;
      ex:room "Room ${100 + id}"
    ] .
}`,
    )
    .join("\n\n");

  return `@prefix ex: <https://example.org/> .
@prefix tree: <https://w3id.org/tree#> .

# The default graph contains a small CBD. The graph named after each member
# contains the member payload and is included for the selected focus node.
ex:page/named-graph-payload
  a tree:Node ;
  tree:member
${members} .

${defaultGraph}

${namedGraphs}`;
};

const shapedMemberPage = () => {
  const ids = Array.from({ length: 20 }, (_, index) => index + 1);
  const members = treeMembers(ids);
  const profiles = ids
    .map((id) => {
      const agentId = (id % 4) + 1;
      return `${memberIri(id)}
  a ex:Profile ;
  ex:name "Member ${String(id).padStart(2, "0")}" ;
  ex:role "${id % 3 === 0 ? "Maintainer" : "Contributor"}" ;
  ex:email "member${id}@example.org" ;
  ex:score ${70 + id} ;
  ex:accountManager ex:agent/${agentId} .`;
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

# The member has a full CBD. The shape decides whether only selected paths
# are extracted, or whether the CBD is kept and enriched with the manager.
ex:page/shaped-profiles
  a tree:Node ;
  tree:member
${members} .

${profiles}

${agents}`;
};

const openNamedGraphLinkPage = () => {
  const ids = Array.from({ length: 20 }, (_, index) => index + 31);
  const members = treeMembers(ids);
  const readings = ids
    .map((id) => {
      const technicianId = (id % 5) + 1;
      return `${memberIri(id)}
  a ex:SensorReading ;
  ex:name "Reading ${id}" ;
  ex:status "${id % 3 === 0 ? "flagged" : "active"}" ;
  ex:value ${(18 + id / 10).toFixed(1)} ;
  ex:technician ex:technician/${technicianId} ;
  ex:location [
    ex:lat "${(50.8 + id / 1000).toFixed(3)}" ;
    ex:long "${(3.6 + id / 1000).toFixed(3)}"
  ] .`;
    })
    .join("\n\n");
  const technicianGraphs = Array.from({ length: 5 }, (_, index) => index + 1)
    .map(
      (id) => `ex:technician/${id} {
  ex:technician/${id}
    a ex:Technician ;
    ex:name "Technician ${id}" ;
    ex:team "Field operations" ;
    ex:internalBadge "badge-${id}" ;
    ex:availability [
      ex:window "08:00-16:00" ;
      ex:region "Flanders"
    ] .
}`,
    )
    .join("\n\n");

  return `@prefix ex: <https://example.org/> .
@prefix tree: <https://w3id.org/tree#> .

# The member CBD is in the default graph. The open shape follows a named
# technician link whose payload is stored in a graph named after that technician.
ex:page/readings-with-technicians
  a tree:Node ;
  tree:member
${members} .

${readings}

${technicianGraphs}`;
};

const closedProfileShape = `@prefix ex: <https://example.org/> .
@prefix sh: <http://www.w3.org/ns/shacl#> .

ex:ClosedProfileShape
  a sh:NodeShape ;
  sh:closed true ;
  sh:property [
    sh:path ex:name ;
    sh:minCount 1
  ] ;
  sh:property [
    sh:path ex:accountManager ;
    sh:node ex:ManagerPublicShape ;
    sh:minCount 1
  ] .

ex:ManagerPublicShape
  a sh:NodeShape ;
  sh:closed true ;
  sh:property [
    sh:path ex:name ;
    sh:minCount 1
  ] ;
  sh:property [
    sh:path ex:team ;
    sh:minCount 1
  ] .`;

const openProfileShape = `@prefix ex: <https://example.org/> .
@prefix sh: <http://www.w3.org/ns/shacl#> .

ex:OpenProfileShape
  a sh:NodeShape ;
  sh:property [
    sh:path ex:accountManager ;
    sh:node ex:ManagerOpenShape ;
    sh:minCount 1
  ] .

ex:ManagerOpenShape
  a sh:NodeShape ;
  sh:property [
    sh:path ex:name ;
    sh:minCount 1
  ] ;
  sh:property [
    sh:path ex:team ;
    sh:minCount 1
  ] .`;

const openTechnicianShape = `@prefix ex: <https://example.org/> .
@prefix sh: <http://www.w3.org/ns/shacl#> .

ex:OpenReadingShape
  a sh:NodeShape ;
  sh:property [
    sh:path ex:technician ;
    sh:node ex:TechnicianOpenShape ;
    sh:minCount 1
  ] .

ex:TechnicianOpenShape
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
    name: "Simple CBD",
    description:
      "Blank nodes are included recursively; named node links stay outside the member.",
    focusNode: "https://example.org/member/12",
    shapeNode: "",
    data: simpleCbdPage(),
    shape: "",
  },
  {
    name: "CBD + named graph",
    description:
      "Extract default-graph facts plus the named graph whose name is the member IRI.",
    focusNode: "https://example.org/member/09",
    shapeNode: "",
    data: namedGraphPayloadPage(),
    shape: "",
  },
  {
    name: "Closed SHACL link",
    description:
      "A closed shape selects a subset and follows a shaped manager named node.",
    focusNode: "https://example.org/member/17",
    shapeNode: "https://example.org/ClosedProfileShape",
    data: shapedMemberPage(),
    shape: closedProfileShape,
  },
  {
    name: "Open SHACL link",
    description:
      "The same member as example 3, but open: keep CBD and add manager data.",
    focusNode: "https://example.org/member/17",
    shapeNode: "https://example.org/OpenProfileShape",
    data: shapedMemberPage(),
    shape: openProfileShape,
  },
  {
    name: "Open graph payload",
    description:
      "An open shape follows a named node whose payload lives in its named graph.",
    focusNode: "https://example.org/member/42",
    shapeNode: "https://example.org/OpenReadingShape",
    data: openNamedGraphLinkPage(),
    shape: openTechnicianShape,
  },
];
