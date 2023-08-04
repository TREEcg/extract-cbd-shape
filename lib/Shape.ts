import { NamedNode, Quad, Store, Term } from "n3";

export class Property {   
    node?: Shape;
    constructor() {
    }
}

export class Shape {
    nodeLinks: Map<string, string>;
    requiredProperties: Array<string> ;
    inverseNodeLinks: Map<string, string>;
    requiredInverseProperties: Array<string> ;
    inverseProperties: string[];

    constructor () {
        //All properties will be added, but if a required property is not available, then we need to further look it up
        this.requiredProperties = [];
        //If there’s a nodelink through one of the properties, I want to know what other shape to look up in the shapesgraph from there
        this.nodeLinks = new Map();
        //if there’s an inverse property, required or not, it needs to be explicitly looked up
        this.inverseProperties = [];
        //If there’s a required inverse property that is not available after doing that look-up, the current node must be dereferenced
        this.requiredInverseProperties = [];
        //If there’s an link sh:node on an inverse property, I want to look that up and see whether that shape would have any required properties that would end up in doing yet another HTTP request
        this.inverseNodeLinks = new Map();
    }
}

export class ShapesGraph {

    shapes: Map<NamedNode, Shape>;

    constructor (shapeStore: Store) {
        this.shapes = this.initializeFromStore(shapeStore);
    }

    /**
     * 
     * @param nodeShape is an N3.Store with the quads of the SHACL shape
     */
    initializeFromStore (shapeStore: Store): Map<NamedNode, Shape> {
        //get all named nodes of entities that are sh:ShapeNodes which we’ll recognize through their use of sh:property (we’ll find other relevant shape nodes later on)
        const shapeNodes = shapeStore.getSubjects("http://www.w3.org/ns/shacl#property").filter((value, index, array) => {return array.indexOf(value) === index;});
        let shapes = new Map();
        for (let shapeId of shapeNodes) {
            let shape = new Shape();
            //process sh:targetObjectsOf: this is a hint that there is a possible non-required inverse property
            let targetObjectsOfArray = shapeStore.getObjects(shapeId, "http://www.w3.org/ns/shacl#targetObjectsOf");
            for (let tOF of targetObjectsOfArray) {
                shape.inverseProperties.push(tOF.value);
            }

            //Process properties
            let properties = shapeStore.getObjects(shapeId, "http://www.w3.org/ns/shacl#property");
            for (let prop of properties) {
                let propertyId:string;
                let path = shapeStore.getObjects(prop, 'http://www.w3.org/ns/shacl#path')[0];

                //check the path now to see whether we should add it on this level, or on a deeper or higher level.
                if (path) {
                    //Only support predicate paths for now TODO FURTHER
                    let pathArray = Array.from(this.extractShaclPath(shapeStore, path));
                    if (pathArray.length > 1) {
                        console.error("Sequence or other paths not yet supported");
                    } else {
                        propertyId = pathArray[0].value;
                    }
                }

                let minCount = shapeStore.getObjects(prop, "http://www.w3.org/ns/shacl#minCount");
                if (minCount[0] && minCount[0].value > 0) {
                    shape.requiredProperties.push(propertyId);
                }
                // Does it link to a literal or to a new node?
                let nodeLink = shapeStore.getObjects(prop, 'http://www.w3.org/ns/shacl#node');
                if (nodeLink[0]) {
                    shape.nodeLinks.set(propertyId, nodeLink[0]);
                }

            /**
             * {
                let i : number = 0;
                let sequence = false;
                let inverse = false;
                let alternative = false;
                let zeroOrOne = false;
                while (i < prop["http://www.w3.org/ns/shacl#path"].length ) {
                    let pathPart =  prop["http://www.w3.org/ns/shacl#path"][i];
                    if (pathPart['@id'] === "http://www.w3.org/ns/shacl#inversePath") {
                        inverse = true;
                        console.error('NY Implemented: inverse path detected!');
                    } else if (pathPart['@id'] === "http://www.w3.org/ns/shacl#alternativePath") {
                        alternative = true;
                        console.error('NY Implemented: alternative path detected!');
                    } else if (pathPart['@id'] === "http://www.w3.org/ns/shacl#zeroOrOnePath") {
                        zeroOrOne = true;
                        console.error('NY Implemented: zero or one path detected!');
                    } else if (pathPart['@id'] === "http://www.w3.org/ns/shacl#zeroOrMorePath" || pathPart['@id'] === "http://www.w3.org/ns/shacl#oneOrMorePath") {
                        console.error('We will not support one or more paths or zero or More paths at this time');
                    } else { 
                        // Only possibilities left: a predicate path or a sequence path
                        if (i === length-1 ) {
                            //check whether previous flags have been set
                            if (sequence) {

                            }
                            if (inverse) {

                            }
                            if (alternative) {

                            }
                            if (zeroOrOne) {

                            }
                            this.properties.set(new NamedNode(pathPart["@id"]), prop);
                        } else {
                            //Create a new property if it does not yet exist, with a node link to another shape
                            sequence = true;
                            this.properties.set(new NamedNode(pathPart["@id"]), new Property());
                        }
                    }
                    i++;
                }

                }
            **/
            
            }
            shapes.set(shapeId.value, shape);
        }
        return shapes;
    }

    protected * extractShaclPath(shapeStore: Store, item: Term): Generator<Term> {
        if (shapeStore.getObjects(item, "http://www.w3.org/1999/02/22-rdf-syntax-ns#first")[0]) {
            yield shapeStore.getObjects(item, "http://www.w3.org/1999/02/22-rdf-syntax-ns#first")[0];
            let rest = shapeStore.getObjects(item, "http://www.w3.org/1999/02/22-rdf-syntax-ns#rest")[0];
            while (rest.termType === "NamedNode" && rest.value !== 'http://www.w3.org/1999/02/22-rdf-syntax-ns#nil') {
                yield shapeStore.getObjects(rest, "http://www.w3.org/1999/02/22-rdf-syntax-ns#first")[0];
                rest = shapeStore.getObjects(item, "http://www.w3.org/1999/02/22-rdf-syntax-ns#rest")[0];
            }
        } else {
            //it’s not a list, it’s just a predicate path
            yield item;
        }
        return;
    }

}

/**
 * Example shape in JSON-LD format:
 {
    '@type': 'http://www.w3.org/ns/shacl#NodeShape',
    'http://www.w3.org/ns/shacl#nodeKind': [ { '@id': 'http://www.w3.org/ns/shacl#IRI' } ],
    'http://www.w3.org/ns/shacl#property': [
      {
        'http://www.w3.org/ns/shacl#path': [ { '@id': 'http://purl.org/dc/terms/modified' } ],
        'http://www.w3.org/ns/shacl#minCount': [
          {
            '@value': '1',
            '@type': 'http://www.w3.org/2001/XMLSchema#integer'
          }
        ],
        'http://www.w3.org/ns/shacl#datatype': [ { '@id': 'http://www.w3.org/2001/XMLSchema#dateTime' } ]
      },
      {
        'http://www.w3.org/ns/shacl#path': [ { '@id': 'http://purl.org/dc/terms/isVersionOf' } ],
        'http://www.w3.org/ns/shacl#minCount': [
          {
            '@value': '1',
            '@type': 'http://www.w3.org/2001/XMLSchema#integer'
          }
        ],
        'http://www.w3.org/ns/shacl#nodeKind': [ { '@id': 'http://www.w3.org/ns/shacl#IRI' } ]
      },
      {
        'http://www.w3.org/ns/shacl#path': [ { '@id': 'http://www.w3.org/2004/02/skos/core#note' } ]
      },
      {
        'http://www.w3.org/ns/shacl#path': [
          { '@id': 'http://www.w3.org/2004/02/skos/core#historyNote' }
        ]
      },
      {
        'http://www.w3.org/ns/shacl#path': [ { '@id': 'http://www.w3.org/ns/dcat#centroid' } ],
        'http://www.w3.org/ns/shacl#minCount': [
          {
            '@value': '1',
            '@type': 'http://www.w3.org/2001/XMLSchema#integer'
          }
        ],
        'http://www.w3.org/ns/shacl#datatype': [
          { '@id': 'http://www.opengis.net/ont/geosparql#wktLiteral' }
        ],
        'http://www.w3.org/ns/shacl#maxCount': [
          {
            '@value': '1',
            '@type': 'http://www.w3.org/2001/XMLSchema#integer'
          }
        ]
      },
      {
        'http://www.w3.org/ns/shacl#path': [ { '@id': 'http://www.w3.org/ns/dcat#bbox' } ],
        'http://www.w3.org/ns/shacl#minCount': [
          {
            '@value': '0',
            '@type': 'http://www.w3.org/2001/XMLSchema#integer'
          }
        ],
        'http://www.w3.org/ns/shacl#datatype': [
          { '@id': 'http://www.opengis.net/ont/geosparql#wktLiteral' }
        ],
        'http://www.w3.org/ns/shacl#maxCount': [
          {
            '@value': '1',
            '@type': 'http://www.w3.org/2001/XMLSchema#integer'
          }
        ]
      },
      {
        'http://www.w3.org/ns/shacl#path': [
          { '@id': 'http://marineregions.org/ns/ontology#hasGeometry' }
        ],
        'http://www.w3.org/ns/shacl#minCount': [
          {
            '@value': '0',
            '@type': 'http://www.w3.org/2001/XMLSchema#integer'
          }
        ],
        'http://www.w3.org/ns/shacl#nodekind': [ { '@id': 'http://www.w3.org/ns/shacl#IRI' } ]
      },
      {
        'http://www.w3.org/ns/shacl#path': [ { '@id': 'http://www.w3.org/2004/02/skos/core#exactMatch' } ],
        'http://www.w3.org/ns/shacl#minCount': [
          {
            '@value': '0',
            '@type': 'http://www.w3.org/2001/XMLSchema#integer'
          }
        ],
        'http://www.w3.org/ns/shacl#node': [
          {
            '@type': 'http://www.w3.org/ns/shacl#NodeShape',
            'http://www.w3.org/ns/shacl#nodeKind': [Array],
            'http://www.w3.org/ns/shacl#property': [Array]
          }
        ]
      },
      {
        'http://www.w3.org/ns/shacl#path': [ { '@id': 'http://www.w3.org/2004/02/skos/core#prefLabel' } ],
        'http://www.w3.org/ns/shacl#minCount': [
          {
            '@value': '1',
            '@type': 'http://www.w3.org/2001/XMLSchema#integer'
          }
        ],
        'http://www.w3.org/ns/shacl#datatype': [
          {
            '@id': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString'
          }
        ]
      },
      {
        'http://www.w3.org/ns/shacl#path': [ { '@id': 'http://www.w3.org/2004/02/skos/core#altLabel' } ],
        'http://www.w3.org/ns/shacl#minCount': [
          {
            '@value': '0',
            '@type': 'http://www.w3.org/2001/XMLSchema#integer'
          }
        ],
        'http://www.w3.org/ns/shacl#datatype': [
          {
            '@id': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString'
          }
        ]
      },
      {
        'http://www.w3.org/ns/shacl#path': [
          { '@id': 'http://marineregions.org/ns/ontology#isRelatedTo' }
        ],
        'http://www.w3.org/ns/shacl#minCount': [
          {
            '@value': '0',
            '@type': 'http://www.w3.org/2001/XMLSchema#integer'
          }
        ],
        'http://www.w3.org/ns/shacl#nodeKind': [ { '@id': 'http://www.w3.org/ns/shacl#IRI' } ],
        'http://www.w3.org/ns/shacl#class': [
          { '@id': 'http://marineregions.org/ns/ontology#MRGeoObject' }
        ]
      }
    ],
    'http://www.w3.org/ns/shacl#targetClass': [ { '@id': 'http://marineregions.org/ns/ontology#MRGeoObject' } ]
  }

 */