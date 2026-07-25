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
  import { base } from "$app/paths";
  import Editor from "$lib/Editor.svelte";
  import { examples } from "$lib/examples";

  type DataSource = "editor" | "url";

  let selectedExample = 0;
  let dataSource: DataSource = "editor";
  let data = examples[0].data;
  let dataUrl = "";
  let shape = examples[0].shape;
  let focusNode = examples[0].focusNode;
  let shapeNode = examples[0].shapeNode;
  let output = "# Run the extraction to see its RDF result.";
  let error = "";
  let sourceStatus = "";
  let running = false;
  let resultCount: number | undefined;
  let duration: number | undefined;

  const parse = (
    source: string,
    format = "application/trig",
    baseIRI?: string,
  ): Quad[] => {
    const parsed =
      new Parser({ format, baseIRI }).parse(source) ?? [];
    const quads: Quad[] = [];
    for (const item of parsed as Iterable<ParserOutputItem>) {
      quads.push((isMessageQuad(item) ? item.quad : item) as Quad);
    }
    return quads;
  };

  const loadExample = (index: number) => {
    selectedExample = index;
    const example = examples[index];
    dataSource = "editor";
    data = example.data;
    dataUrl = "";
    shape = example.shape;
    focusNode = example.focusNode;
    shapeNode = example.shapeNode;
    output = "# Ready to run.";
    error = "";
    sourceStatus = "";
    resultCount = undefined;
    duration = undefined;
  };

  const selectDataSource = (source: DataSource) => {
    dataSource = source;
    sourceStatus = "";
    if (
      source === "url" &&
      !dataUrl &&
      typeof window !== "undefined"
    ) {
      dataUrl = new URL(
        `${base}/examples/member-page.ttl`,
        window.location.origin,
      ).href;
    }
  };

  const formatFromResponse = (response: Response) => {
    const contentType = response.headers
      .get("content-type")
      ?.split(";", 1)[0]
      .trim()
      .toLowerCase();
    const extension = new URL(response.url).pathname
      .split(".")
      .pop()
      ?.toLowerCase();

    const formats: Record<string, string> = {
      "application/n-quads": "application/n-quads",
      "application/n-triples": "application/n-triples",
      "application/trig": "application/trig",
      "application/x-turtle": "text/turtle",
      "text/n3": "text/turtle",
      "text/plain": extension === "nq"
        ? "application/n-quads"
        : extension === "nt"
          ? "application/n-triples"
          : "application/trig",
      "text/turtle": "text/turtle",
    };

    if (contentType && formats[contentType]) {
      return formats[contentType];
    }

    const extensionFormats: Record<string, string> = {
      nq: "application/n-quads",
      nt: "application/n-triples",
      trig: "application/trig",
      ttl: "text/turtle",
    };
    if (extension && extensionFormats[extension]) {
      return extensionFormats[extension];
    }

    if (contentType) {
      throw new Error(
        `Unsupported RDF response type “${contentType}”. Use Turtle, TriG, N-Triples or N-Quads.`,
      );
    }
    return "application/trig";
  };

  const loadData = async () => {
    if (dataSource === "editor") {
      const quads = parse(data);
      sourceStatus = `${quads.length} quads parsed from the editor`;
      return quads;
    }

    const value = dataUrl.trim();
    if (!value) {
      throw new Error("Enter the URL of an RDF document.");
    }

    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Error("Enter a valid absolute HTTP or HTTPS URL.");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Only HTTP and HTTPS data URLs are supported.");
    }

    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Accept:
            "application/trig, text/turtle;q=0.9, application/n-quads;q=0.8, application/n-triples;q=0.7",
        },
      });
    } catch {
      throw new Error(
        "The RDF URL could not be fetched. Check the URL and whether its server allows cross-origin (CORS) requests.",
      );
    }
    if (!response.ok) {
      throw new Error(
        `The RDF URL returned HTTP ${response.status} ${response.statusText}.`,
      );
    }

    const format = formatFromResponse(response);
    const quads = parse(await response.text(), format, response.url);
    sourceStatus = `${quads.length} quads loaded from ${new URL(response.url).host}`;
    return quads;
  };

  const run = async () => {
    running = true;
    error = "";
    sourceStatus = dataSource === "url" ? "Dereferencing RDF URL…" : "";

    try {
      if (!focusNode.trim()) {
        throw new Error("Enter the IRI of the focus node.");
      }

      const dataStore = createGraphIndexedRdfStore();
      for (const quad of await loadData()) {
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
    content="Extract one RDF collection member from a page with CBD and SHACL-guided extraction."
  />
</svelte:head>

<div class="page-shell">
  <header>
    <a class="brand" href="./" aria-label="CBD Shape Extractor home">
      <img
        class="tree-logo"
        src="https://tree.linkeddatafragments.org/img/logo.svg"
        alt="TREE"
      />
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
        <p class="eyebrow">Member extraction, made tangible</p>
        <h1>Extract one member from an RDF page.</h1>
      </div>
      <p class="lede">
        RDF APIs often publish many observations, records, or events in one
        response. This playground shows the fallback algorithms from the member
        extraction paper: start from one focus node, keep its bounded
        description, and use SHACL shapes as optional hints for open or closed
        extraction.
      </p>
      <div class="tree-context" aria-label="TREE collection context">
        <img
          src="https://tree.linkeddatafragments.org/img/logo.svg"
          alt=""
          aria-hidden="true"
        />
        <p>
          TREE collections publish members across pages. This tool demonstrates
          how a client can recover one member description from such a page.
        </p>
      </div>
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
          <div class="source-tabs" aria-label="RDF data source">
            <button
              class:active={dataSource === "editor"}
              on:click={() => selectDataSource("editor")}
            >
              Paste RDF
            </button>
            <button
              class:active={dataSource === "url"}
              on:click={() => selectDataSource("url")}
            >
              Load URL
            </button>
          </div>
        </div>
        {#if dataSource === "editor"}
          <div class="editor-wrap">
            <Editor bind:value={data} label="RDF data" />
          </div>
        {:else}
          <div class="url-source">
            <div class="url-icon" aria-hidden="true">↗</div>
            <div>
              <label for="data-url">RDF document URL</label>
              <input
                id="data-url"
                type="url"
                bind:value={dataUrl}
                placeholder="https://data.example.org/members/page-1.ttl"
              />
              <p>
                The server must allow CORS. Turtle, TriG, N-Triples and
                N-Quads are supported; the response content type or file
                extension selects the parser.
              </p>
              {#if sourceStatus}
                <div class="source-status">{sourceStatus}</div>
              {/if}
            </div>
          </div>
        {/if}
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
    background: #ffffff;
  }

  :global(body) {
    margin: 0;
    color: #161616;
    background: #ffffff;
    font-family: Arial, Helvetica, sans-serif;
  }

  :global(button),
  :global(input) {
    font: inherit;
  }

  .page-shell {
    min-height: 100vh;
  }

  header {
    min-height: 68px;
    padding: 12px clamp(20px, 5vw, 72px);
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 24px;
    color: #f7f7f7;
    background: #050505;
    border-bottom: 4px solid #86bd45;
  }

  .brand {
    display: inline-flex;
    align-items: center;
    gap: 14px;
    color: inherit;
    text-decoration: none;
  }

  .tree-logo {
    width: 94px;
    height: auto;
    padding: 6px 8px;
    display: block;
    background: #ffffff;
  }

  .brand strong,
  .brand small {
    display: block;
  }

  .brand strong {
    font-size: 14px;
    letter-spacing: 0.01em;
  }

  .brand small {
    margin-top: 2px;
    color: #bfbfbf;
    font-size: 11px;
  }

  .local-badge {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #d8d8d8;
    font-size: 12px;
  }

  .local-badge span {
    width: 7px;
    height: 7px;
    background: #86bd45;
    border-radius: 50%;
    box-shadow: 0 0 0 4px rgba(134, 189, 69, 0.18);
  }

  .github-link {
    justify-self: end;
    color: #f2f2f2;
    font-size: 12px;
    text-decoration: none;
  }

  main {
    width: min(1500px, calc(100% - 40px));
    margin: 0 auto;
    padding: 56px 0;
  }

  .intro {
    display: grid;
    grid-template-columns: minmax(0, 1.05fr) minmax(280px, 0.62fr) minmax(260px, 0.48fr);
    align-items: center;
    gap: 44px;
    margin-bottom: 38px;
  }

  .eyebrow {
    margin: 0 0 14px;
    color: #5d912b;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0;
    font-size: clamp(38px, 4.8vw, 68px);
    font-weight: 800;
    letter-spacing: -0.035em;
    line-height: 1;
  }

  .lede {
    max-width: 520px;
    margin: 0 0 5px;
    color: #555555;
    font-size: 15px;
    line-height: 1.7;
  }

  .tree-context {
    padding-left: 24px;
    border-left: 4px solid #86bd45;
  }

  .tree-context img {
    width: min(100%, 230px);
    height: auto;
    display: block;
  }

  .tree-context p {
    margin: 18px 0 0;
    color: #4a4a4a;
    font-size: 14px;
    line-height: 1.55;
  }

  .examples {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    margin-bottom: 22px;
    overflow: hidden;
    background: #fff;
    border: 1px solid #d9d9d9;
    border-radius: 0;
  }

  .examples button {
    min-height: 104px;
    padding: 18px 20px;
    display: grid;
    grid-template-columns: 32px 1fr;
    gap: 2px 8px;
    color: #222222;
    text-align: left;
    background: #fff;
    border: 0;
    border-right: 1px solid #e4e4e4;
    cursor: pointer;
  }

  .examples button:last-child {
    border-right: 0;
  }

  .examples button:hover {
    background: #f7fbf2;
  }

  .examples button.active {
    color: #17220f;
    background: #eef7e5;
    box-shadow: inset 0 4px #86bd45;
  }

  .examples button > span {
    grid-row: 1 / 3;
    color: #777777;
    font: 11px "IBM Plex Mono", monospace;
  }

  .examples strong {
    font-size: 13px;
  }

  .examples small {
    color: #666666;
    font-size: 11px;
    line-height: 1.4;
  }

  .controls {
    padding: 16px;
    display: grid;
    grid-template-columns: 1fr 1fr auto;
    align-items: end;
    gap: 12px;
    background: #050505;
    border-radius: 0;
  }

  .controls label > span {
    margin: 0 0 7px 2px;
    display: block;
    color: #d8d8d8;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .controls label small {
    color: #909090;
    font-size: 9px;
  }

  input {
    width: 100%;
    height: 44px;
    padding: 0 13px;
    color: #f2f2f2;
    background: #1b1b1b;
    border: 1px solid #555555;
    border-radius: 0;
    outline: none;
    font: 12px "IBM Plex Mono", monospace;
  }

  input:focus {
    border-color: #86bd45;
    box-shadow: 0 0 0 3px rgba(134, 189, 69, 0.16);
  }

  .run-button {
    height: 44px;
    padding: 0 19px;
    display: flex;
    align-items: center;
    gap: 25px;
    color: #111111;
    font-size: 12px;
    font-weight: 800;
    background: #86bd45;
    border: 0;
    border-radius: 0;
    cursor: pointer;
  }

  .run-button:hover {
    background: #9ed15e;
  }

  .run-button:disabled {
    cursor: wait;
    opacity: 0.65;
  }

  .error {
    padding: 12px 16px;
    color: #7d2222;
    background: #fff0ed;
    border: 1px solid #f0c6bd;
    border-top: 0;
  }

  .workspace {
    display: grid;
    grid-template-columns: 1fr 1fr;
    background: #d9d9d9;
    gap: 1px;
    border: 1px solid #d9d9d9;
    border-top: 0;
    border-radius: 0;
    overflow: hidden;
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.08);
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
    color: #222222;
    background: #f7f7f7;
    border-bottom: 1px solid #d9d9d9;
    font-size: 12px;
  }

  .panel-heading > div {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .panel-heading small,
  .metrics {
    color: #777777;
    font: 10px "IBM Plex Mono", monospace;
  }

  .source-tabs {
    padding: 3px;
    background: #eeeeee;
    border-radius: 0;
  }

  .source-tabs button {
    padding: 5px 9px;
    color: #606060;
    background: transparent;
    border: 0;
    border-radius: 0;
    cursor: pointer;
    font-size: 10px;
    font-weight: 700;
  }

  .source-tabs button:hover {
    color: #111111;
  }

  .source-tabs button.active {
    color: #111111;
    background: #fff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
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
    background: #5d912b;
  }

  .shape-dot {
    background: #86bd45;
  }

  .output-dot {
    background: #111111;
  }

  .editor-wrap {
    height: 350px;
  }

  .editor-wrap.output {
    height: 280px;
  }

  .url-source {
    height: 350px;
    padding: 54px clamp(24px, 5vw, 64px);
    display: grid;
    grid-template-columns: auto minmax(0, 560px);
    justify-content: center;
    align-content: start;
    gap: 18px;
    background:
      linear-gradient(rgba(232, 232, 232, 0.7) 1px, transparent 1px),
      linear-gradient(90deg, rgba(232, 232, 232, 0.7) 1px, transparent 1px),
      #ffffff;
    background-size: 24px 24px;
  }

  .url-icon {
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    color: #111111;
    background: #eef7e5;
    border: 1px solid #c9dfa8;
    border-radius: 0;
    font-size: 20px;
  }

  .url-source label {
    margin-bottom: 8px;
    display: block;
    color: #222222;
    font-size: 12px;
    font-weight: 800;
  }

  .url-source input {
    color: #111111;
    background: #fff;
    border-color: #cfcfcf;
  }

  .url-source input::placeholder {
    color: #888888;
  }

  .url-source p {
    margin: 11px 0 0;
    color: #666666;
    font-size: 11px;
    line-height: 1.55;
  }

  .source-status {
    margin-top: 16px;
    padding: 9px 11px;
    color: #365c19;
    background: #eef7e5;
    border: 1px solid #c9dfa8;
    border-radius: 0;
    font: 10px "IBM Plex Mono", monospace;
  }

  footer {
    padding: 24px clamp(20px, 5vw, 72px);
    display: flex;
    justify-content: space-between;
    color: #666666;
    border-top: 1px solid #e0e0e0;
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

    .url-source {
      justify-content: stretch;
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

    .panel-heading {
      padding: 8px 12px;
      align-items: flex-start;
      gap: 8px;
      flex-direction: column;
    }

    .url-source {
      height: 350px;
      padding: 30px 18px;
      grid-template-columns: 1fr;
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
