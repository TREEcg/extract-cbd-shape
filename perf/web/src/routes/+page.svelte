<script lang="ts">
  import { CBDShapeExtractor, createGraphIndexedRdfStore } from "extract-cbd-shape";
  import {
    DataFactory,
    isMessageQuad,
    Parser,
    quadToString,
    type ParserOutputItem,
  } from "rdf-parser-ts/browser";
  import type { Quad } from "@rdfjs/types";
  import Editor from "$lib/Editor.svelte";
  import { examples } from "$lib/examples";

  let selectedExample = 0;
  let data = examples[0].data;
  let shape = examples[0].shape;
  let focusNode = examples[0].focusNode;
  let shapeNode = examples[0].shapeNode;
  let output = "# Run the extraction to see its RDF result.";
  let error = "";
  let running = false;
  let resultCount: number | undefined;
  let duration: number | undefined;

  const parse = (source: string): Quad[] => {
    const parsed = new Parser({ format: "TriG" }).parse(source) ?? [];
    const quads: Quad[] = [];
    for (const item of parsed as Iterable<ParserOutputItem>) {
      quads.push((isMessageQuad(item) ? item.quad : item) as Quad);
    }
    return quads;
  };

  const loadExample = (index: number) => {
    selectedExample = index;
    const example = examples[index];
    data = example.data;
    shape = example.shape;
    focusNode = example.focusNode;
    shapeNode = example.shapeNode;
    output = "# Ready to run.";
    error = "";
    resultCount = undefined;
    duration = undefined;
  };

  const run = async () => {
    running = true;
    error = "";

    try {
      if (!focusNode.trim()) {
        throw new Error("Enter the IRI of the focus node.");
      }

      const dataStore = createGraphIndexedRdfStore();
      for (const quad of parse(data)) {
        dataStore.addQuad(quad);
      }

      const hasShape = shape.trim().length > 0;
      if (hasShape && !shapeNode.trim()) {
        throw new Error("Enter the shape IRI or clear the SHACL pane.");
      }

      const shapeStore = hasShape ? createGraphIndexedRdfStore() : undefined;
      if (shapeStore) {
        for (const quad of parse(shape)) {
          shapeStore.addQuad(quad);
        }
      }

      const extractor = new CBDShapeExtractor(shapeStore);
      const started = performance.now();
      const quads = await extractor.extract(
        dataStore,
        DataFactory.namedNode(focusNode.trim()),
        hasShape ? DataFactory.namedNode(shapeNode.trim()) : undefined,
      );
      duration = performance.now() - started;
      resultCount = quads.length;
      output =
        quads.length > 0
          ? quads.map((quad) => quadToString(quad)).join("\n")
          : "# No matching statements were extracted.";
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
      output = "# Extraction failed. Check the message above.";
      resultCount = undefined;
      duration = undefined;
    } finally {
      running = false;
    }
  };
</script>

<svelte:head>
  <title>CBD Shape Extractor Playground</title>
  <meta
    name="description"
    content="Run CBD and SHACL-guided RDF extraction directly in your browser."
  />
</svelte:head>

<div class="page-shell">
  <header>
    <a class="brand" href="./" aria-label="CBD Shape Extractor home">
      <span class="brand-mark" aria-hidden="true">
        <span></span><span></span><span></span>
      </span>
      <span>
        <strong>CBD Shape Extractor</strong>
        <small>Browser playground</small>
      </span>
    </a>
    <div class="local-badge"><span></span> Runs locally in your browser</div>
    <a
      class="github-link"
      href="https://github.com/TREEcg/extract-cbd-shape"
      rel="noreferrer"
    >
      View source ↗
    </a>
  </header>

  <main>
    <section class="intro">
      <div>
        <p class="eyebrow">RDF extraction, made tangible</p>
        <h1>Describe one resource.<br /><em>Keep only what matters.</em></h1>
      </div>
      <p class="lede">
        Paste RDF data, choose a focus node, and optionally add a SHACL shape.
        The extractor runs entirely on this page—no data is uploaded.
      </p>
    </section>

    <section class="examples" aria-label="Playground examples">
      {#each examples as example, index}
        <button
          class:active={selectedExample === index}
          on:click={() => loadExample(index)}
        >
          <span>{String(index + 1).padStart(2, "0")}</span>
          <strong>{example.name}</strong>
          <small>{example.description}</small>
        </button>
      {/each}
    </section>

    <section class="controls">
      <label>
        <span>Focus node IRI</span>
        <input bind:value={focusNode} placeholder="https://example.org/member" />
      </label>
      <label>
        <span>Shape IRI <small>optional</small></span>
        <input bind:value={shapeNode} placeholder="https://example.org/Shape" />
      </label>
      <button class="run-button" on:click={run} disabled={running}>
        {running ? "Extracting…" : "Run extraction"}
        <span aria-hidden="true">→</span>
      </button>
    </section>

    {#if error}
      <div class="error" role="alert"><strong>Could not extract:</strong> {error}</div>
    {/if}

    <section class="workspace">
      <article class="panel">
        <div class="panel-heading">
          <div><span class="dot data-dot"></span><strong>RDF data</strong></div>
          <small>Turtle or TriG</small>
        </div>
        <div class="editor-wrap">
          <Editor bind:value={data} label="RDF data" />
        </div>
      </article>

      <article class="panel">
        <div class="panel-heading">
          <div><span class="dot shape-dot"></span><strong>SHACL shape</strong></div>
          <small>Optional</small>
        </div>
        <div class="editor-wrap">
          <Editor bind:value={shape} label="SHACL shape" />
        </div>
      </article>

      <article class="panel output-panel">
        <div class="panel-heading">
          <div><span class="dot output-dot"></span><strong>Extracted RDF</strong></div>
          <div class="metrics">
            {#if resultCount !== undefined}
              <span>{resultCount} quad{resultCount === 1 ? "" : "s"}</span>
            {/if}
            {#if duration !== undefined}
              <span>{duration.toFixed(2)} ms</span>
            {/if}
          </div>
        </div>
        <div class="editor-wrap output">
          <Editor bind:value={output} readonly label="Extracted RDF output" />
        </div>
      </article>
    </section>
  </main>

  <footer>
    <span>Built for the TREE community.</span>
    <span>CBD · SHACL · RDF/JS</span>
  </footer>
</div>

<style>
  :global(*) {
    box-sizing: border-box;
  }

  :global(html) {
    background: #f4f7f4;
  }

  :global(body) {
    margin: 0;
    color: #17241f;
    background:
      radial-gradient(circle at 12% 8%, rgba(119, 205, 166, 0.14), transparent 26rem),
      #f4f7f4;
    font-family:
      Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
      sans-serif;
  }

  :global(button),
  :global(input) {
    font: inherit;
  }

  .page-shell {
    min-height: 100vh;
  }

  header {
    min-height: 76px;
    padding: 14px clamp(20px, 5vw, 72px);
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 24px;
    color: #ecf8f1;
    background: #10251f;
    border-bottom: 1px solid #29453b;
  }

  .brand {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    color: inherit;
    text-decoration: none;
  }

  .brand strong,
  .brand small {
    display: block;
  }

  .brand strong {
    font-size: 14px;
    letter-spacing: 0.02em;
  }

  .brand small {
    margin-top: 2px;
    color: #9eb9ad;
    font-size: 11px;
  }

  .brand-mark {
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    position: relative;
    border: 1px solid #4f7767;
    border-radius: 11px;
  }

  .brand-mark span {
    width: 6px;
    height: 6px;
    position: absolute;
    background: #7de0af;
    border-radius: 50%;
  }

  .brand-mark span:nth-child(1) {
    transform: translate(-8px, 6px);
  }

  .brand-mark span:nth-child(2) {
    transform: translate(8px, 6px);
  }

  .brand-mark span:nth-child(3) {
    transform: translateY(-8px);
  }

  .brand-mark::before,
  .brand-mark::after {
    width: 17px;
    height: 1px;
    content: "";
    position: absolute;
    background: #4f7767;
    transform-origin: left;
  }

  .brand-mark::before {
    transform: translate(-6px, -4px) rotate(56deg);
  }

  .brand-mark::after {
    transform: translate(6px, -4px) rotate(124deg);
  }

  .local-badge {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #a9c2b7;
    font-size: 12px;
  }

  .local-badge span {
    width: 7px;
    height: 7px;
    background: #5ee09b;
    border-radius: 50%;
    box-shadow: 0 0 0 4px rgba(94, 224, 155, 0.12);
  }

  .github-link {
    justify-self: end;
    color: #dcebe4;
    font-size: 12px;
    text-decoration: none;
  }

  main {
    width: min(1500px, calc(100% - 40px));
    margin: 0 auto;
    padding: 64px 0 56px;
  }

  .intro {
    display: grid;
    grid-template-columns: minmax(0, 1.35fr) minmax(280px, 0.65fr);
    align-items: end;
    gap: 64px;
    margin-bottom: 46px;
  }

  .eyebrow {
    margin: 0 0 14px;
    color: #25815f;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0;
    font-family: Georgia, "Times New Roman", serif;
    font-size: clamp(42px, 5.5vw, 78px);
    font-weight: 400;
    letter-spacing: -0.045em;
    line-height: 0.96;
  }

  h1 em {
    color: #25815f;
    font-weight: 400;
  }

  .lede {
    max-width: 520px;
    margin: 0 0 5px;
    color: #596a62;
    font-size: 15px;
    line-height: 1.7;
  }

  .examples {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    margin-bottom: 22px;
    overflow: hidden;
    background: #fff;
    border: 1px solid #dbe5de;
    border-radius: 14px;
    box-shadow: 0 12px 40px rgba(30, 58, 47, 0.06);
  }

  .examples button {
    min-height: 104px;
    padding: 18px 20px;
    display: grid;
    grid-template-columns: 32px 1fr;
    gap: 2px 8px;
    color: #33473e;
    text-align: left;
    background: #fff;
    border: 0;
    border-right: 1px solid #e2eae5;
    cursor: pointer;
  }

  .examples button:last-child {
    border-right: 0;
  }

  .examples button:hover {
    background: #f5faf7;
  }

  .examples button.active {
    color: #123d2e;
    background: #eaf6ef;
    box-shadow: inset 0 3px #2a956d;
  }

  .examples button > span {
    grid-row: 1 / 3;
    color: #91a49a;
    font: 11px "IBM Plex Mono", monospace;
  }

  .examples strong {
    font-size: 13px;
  }

  .examples small {
    color: #718078;
    font-size: 11px;
    line-height: 1.4;
  }

  .controls {
    padding: 16px;
    display: grid;
    grid-template-columns: 1fr 1fr auto;
    align-items: end;
    gap: 12px;
    background: #10251f;
    border-radius: 14px 14px 0 0;
  }

  .controls label > span {
    margin: 0 0 7px 2px;
    display: block;
    color: #a8beb4;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .controls label small {
    color: #607d70;
    font-size: 9px;
  }

  input {
    width: 100%;
    height: 44px;
    padding: 0 13px;
    color: #e9f6ef;
    background: #18342b;
    border: 1px solid #36574a;
    border-radius: 8px;
    outline: none;
    font: 12px "IBM Plex Mono", monospace;
  }

  input:focus {
    border-color: #61c99a;
    box-shadow: 0 0 0 3px rgba(97, 201, 154, 0.12);
  }

  .run-button {
    height: 44px;
    padding: 0 19px;
    display: flex;
    align-items: center;
    gap: 25px;
    color: #0e2a20;
    font-size: 12px;
    font-weight: 800;
    background: #75dca9;
    border: 0;
    border-radius: 8px;
    cursor: pointer;
  }

  .run-button:hover {
    background: #91e8bc;
  }

  .run-button:disabled {
    cursor: wait;
    opacity: 0.65;
  }

  .error {
    padding: 12px 16px;
    color: #8a2e2e;
    background: #fff0ed;
    border: 1px solid #f0c6bd;
    border-top: 0;
  }

  .workspace {
    display: grid;
    grid-template-columns: 1fr 1fr;
    background: #dbe5de;
    gap: 1px;
    border: 1px solid #dbe5de;
    border-top: 0;
    border-radius: 0 0 14px 14px;
    overflow: hidden;
    box-shadow: 0 16px 50px rgba(30, 58, 47, 0.08);
  }

  .panel {
    min-width: 0;
    background: #fff;
  }

  .output-panel {
    grid-column: 1 / -1;
  }

  .panel-heading {
    min-height: 48px;
    padding: 0 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: #35483f;
    background: #f8faf8;
    border-bottom: 1px solid #dbe5de;
    font-size: 12px;
  }

  .panel-heading > div {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .panel-heading small,
  .metrics {
    color: #829188;
    font: 10px "IBM Plex Mono", monospace;
  }

  .metrics span + span::before {
    margin-right: 8px;
    content: "·";
  }

  .dot {
    width: 7px;
    height: 7px;
    display: inline-block;
    border-radius: 50%;
  }

  .data-dot {
    background: #23916a;
  }

  .shape-dot {
    background: #d89e42;
  }

  .output-dot {
    background: #6c79d3;
  }

  .editor-wrap {
    height: 350px;
  }

  .editor-wrap.output {
    height: 280px;
  }

  footer {
    padding: 24px clamp(20px, 5vw, 72px);
    display: flex;
    justify-content: space-between;
    color: #7a8981;
    border-top: 1px solid #dce4df;
    font-size: 11px;
  }

  @media (max-width: 900px) {
    header {
      grid-template-columns: 1fr auto;
    }

    .local-badge {
      display: none;
    }

    .intro {
      grid-template-columns: 1fr;
      gap: 24px;
    }

    .examples,
    .controls,
    .workspace {
      grid-template-columns: 1fr;
    }

    .examples button {
      border-right: 0;
      border-bottom: 1px solid #e2eae5;
    }

    .output-panel {
      grid-column: auto;
    }
  }

  @media (max-width: 560px) {
    main {
      width: min(100% - 20px, 1500px);
      padding-top: 38px;
    }

    .github-link {
      display: none;
    }

    header {
      grid-template-columns: 1fr;
    }

    .controls {
      padding: 12px;
    }

    h1 {
      font-size: 44px;
    }

    footer {
      gap: 12px;
      flex-direction: column;
    }
  }
</style>
