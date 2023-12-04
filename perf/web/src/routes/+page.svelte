<script lang="ts">
  import { Store, NamedNode } from "n3";
  import rdfDereference from "rdf-dereference";
  import {CBDShapeExtractor } from "extract-cbd-shape";
  import { onMount } from "svelte";

  let b = 50000;
  let running = false;

    let kboData = new Store();
    let shaclKBO = new Store();
    let extractor = new CBDShapeExtractor();
    let extractorWithShape = new CBDShapeExtractor(shaclKBO);

  let cbdOnly = async (count: number) => {
    console.log("cbdonly with", count, "iterations" )
      for(let i = 0; i < count; i ++ ) {
        let _result = await extractor.extract(
          kboData,
          new NamedNode("https://kbopub.economie.fgov.be/kbo#0877248501.2022.11"),
        );
      }
  };

  let simpleShape = async (count: number) => {
    console.log("simple shape with", count, "iterations" )
      for(let i = 0; i < count; i ++ ) {
      let result = await extractorWithShape.extract(
        kboData,
        new NamedNode("https://kbopub.economie.fgov.be/kbo#0877248501.2022.11"),
        new NamedNode("https://kbopub.economie.fgov.be/kbo#LegalEntityShape")
      );
      }
  };

  onMount(async () => {
    let kboDataStream = (
      await rdfDereference.dereference(
       window.location+ "kbo.ttl",
        {},
      )
    ).data;

    //load the shacl shape from the file
    let kboShaclStream = (
      await rdfDereference.dereference(
       window.location+ "shacl-kbo.ttl",
      )
    ).data;

    await new Promise((resolve, reject) => {
      kboData.import(kboDataStream).on("end", resolve).on("error", reject);
    });

    await new Promise((resolve, reject) => {
      shaclKBO.import(kboShaclStream).on("end", resolve).on("error", reject);
    });

     extractorWithShape = new CBDShapeExtractor(shaclKBO);
  })
</script>

<h1>Welcome to SvelteKit</h1>
<p>Visit <a href="https://kit.svelte.dev">kit.svelte.dev</a> to read the documentation</p>
Count: 
	<input type="number" bind:value={b} />

<br>
<button on:click={() => cbdOnly(b)}>CBD </button>
<button on:click={() => simpleShape(b)}>CBD + Shape </button>

Running {running}
