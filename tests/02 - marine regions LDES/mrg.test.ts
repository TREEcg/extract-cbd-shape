import {assert} from "chai";
import {DataFactory} from "rdf-data-factory";
import {RdfStore} from "rdf-stores";
import {CBDShapeExtractor} from "../../lib/extract-cbd-shape";
import {rdfDereferencer} from "rdf-dereference";
import sinon, {SinonStub} from "sinon";

const df = new DataFactory();
describe("Check whether a member from the MRG source can be fully extracted", function () {
   let fetchStub: SinonStub;

   before(() => {
      // Mock the global fetch function
      fetchStub = sinon.stub(global, "fetch");

      // Mock response for the specific MRG member URL
      fetchStub
         .withArgs("http://marineregions.org/mrgid/24983")
         .resolves(
            new Response(
               `
@prefix mr: <http://marineregions.org/ns/ontology#> .
@prefix mrt: <http://marineregions.org/ns/placetypes#> .
@prefix dc: <http://purl.org/dc/terms/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix gsp: <http://www.opengis.net/ont/geosparql#> .
@prefix prov: <http://www.w3.org/ns/prov#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

<http://marineregions.org/mrgid/24983>
  a mr:MRGeoObject, mrt:Escarpment ;
  mr:hasGeometry <http://marineregions.org/mrgid/24983/geometries?source=110&attributeValue=2004> ;
  mr:isPartOf <http://marineregions.org/mrgid/4300>, <http://marineregions.org/mrgid/8487> ;
  dc:modified "2023-07-24T14:14:57Z"^^xsd:dateTime ;
  skos:altLabel "Minami Amami Escarpment"@en, "Minami Anami Escarpment"@en ;
  skos:prefLabel "Minami-Amami Escarpment"@en ;
  dcat:bbox "<http://www.opengis.net/def/crs/OGC/1.3/CRS84> POLYGON ((133.4 27.5,133.4 27.5,133.4 27,133.4 27,133.4 27.5))"^^gsp:wktLiteral ;
  dcat:centroid "<http://www.opengis.net/def/crs/OGC/1.3/CRS84> POINT (133.4 27.25)"^^gsp:wktLiteral ;
  prov:hadPrimarySource <http://www.ngdc.noaa.gov/gazetteer/> .

<http://marineregions.org/mrgid/4300>
  a mr:MRGeoObject, mrt:IHOSeaArea ;
  skos:prefLabel "Philippine Sea"@en .

<http://marineregions.org/mrgid/8487>
  a mr:MRGeoObject, mrt:EEZ ;
  skos:prefLabel "Japanese Exclusive Economic Zone"@en .

<http://www.ngdc.noaa.gov/gazetteer/> rdfs:label "IHO-IOC GEBCO Gazetteer of Undersea Feature Names"^^xsd:string .
          `,
               {
                  status: 200,
                  headers: {"Content-Type": "text/turtle"},
               }
            )
         );

      // Mock response for the specific MRG geometry URL
      fetchStub
         .withArgs("http://marineregions.org/mrgid/24983/geometries?source=110&attributeValue=2004")
         .resolves(
            new Response(
               `
@prefix mr: <http://marineregions.org/ns/ontology#> .
@prefix gsp: <http://www.opengis.net/ont/geosparql#> .
@prefix prov: <http://www.w3.org/ns/prov#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

<http://marineregions.org/mrgid/24983> mr:hasGeometry <http://marineregions.org/mrgid/24983/geometries?source=110&attributeValue=2004> .
<http://marineregions.org/mrgid/24983/geometries?source=110&attributeValue=2004>
  gsp:asWKT "<http://www.opengis.net/def/crs/OGC/1.3/CRS84> LINESTRING (133.4 27, 133.4 27.5)"^^gsp:wktLiteral ;
  prov:hadPrimarySource <http://www.ngdc.noaa.gov/gazetteer/> .

<http://www.ngdc.noaa.gov/gazetteer/> rdfs:label "IHO-IOC GEBCO Gazetteer of Undersea Feature Names"^^xsd:string .
             `,
               {
                  status: 200,
                  headers: {"Content-Type": "text/turtle"},
               }
            )
         );
   });

   after(() => {
      // Restore the original fetch function
      fetchStub.restore();
   });

   it("Extract a shape from MRG and check whether it successfully did a call to a geometry it needs", async () => {
      let shapeStore = RdfStore.createDefault();
      let readStream = (
         await rdfDereferencer.dereference(
            "./tests/02 - marine regions LDES/shacl.ttl",
            {localFiles: true},
         )
      ).data;
      await new Promise((resolve, reject) => {
         shapeStore.import(readStream).on("end", resolve).on("error", reject);
      });
      let extractor = new CBDShapeExtractor(shapeStore);
      let dataStore = RdfStore.createDefault();
      let readStream2 = (
         await rdfDereferencer.dereference(
            "./tests/02 - marine regions LDES/data.ttl",
            {localFiles: true},
         )
      ).data;
      await new Promise((resolve, reject) => {
         dataStore.import(readStream2).on("end", resolve).on("error", reject);
      });
      let result = await extractor.extract(
         dataStore,
         df.namedNode("http://marineregions.org/mrgid/24983?t=1690208097"),
         df.namedNode("http://example.org/shape"),
      );

      assert(fetchStub.calledWith("http://marineregions.org/mrgid/24983"));
      assert(fetchStub.calledWith("http://marineregions.org/mrgid/24983/geometries?source=110&attributeValue=2004"));

      assert.equal(
         result.filter((quad) => {
            return (
               quad.subject.value ===
               "http://marineregions.org/mrgid/24983/geometries?source=110&attributeValue=2004"
            );
         }).length,
         2,
      ); // Test whether it actually did a call
   });
});
