<script lang="ts">
  import { StreamLanguage } from "@codemirror/language";
  import { turtle } from "@codemirror/legacy-modes/mode/turtle";
  import { EditorState } from "@codemirror/state";
  import { EditorView } from "@codemirror/view";
  import { basicSetup } from "codemirror";
  import { onDestroy, onMount } from "svelte";

  export let value = "";
  export let readonly = false;
  export let label = "RDF editor";

  let host: HTMLDivElement;
  let view: EditorView | undefined;

  const theme = EditorView.theme({
    "&": {
      height: "100%",
      backgroundColor: "#fbfdfb",
      color: "#17241f",
      fontSize: "13px",
    },
    ".cm-content": {
      caretColor: "#0f766e",
      fontFamily:
        '"IBM Plex Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace',
      padding: "14px 0",
    },
    ".cm-line": {
      padding: "0 16px",
    },
    ".cm-gutters": {
      backgroundColor: "#f2f6f3",
      borderRight: "1px solid #dce7df",
      color: "#789084",
    },
    ".cm-activeLine, .cm-activeLineGutter": {
      backgroundColor: "#eaf4ef",
    },
    "&.cm-focused": {
      outline: "none",
    },
    "&.cm-focused .cm-selectionBackground, ::selection": {
      backgroundColor: "#bce4d5 !important",
    },
  });

  onMount(() => {
    view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          StreamLanguage.define(turtle),
          EditorState.readOnly.of(readonly),
          EditorView.editable.of(!readonly),
          EditorView.contentAttributes.of({
            "aria-label": label,
            spellcheck: "false",
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              value = update.state.doc.toString();
            }
          }),
          theme,
        ],
      }),
    });
  });

  $: if (view && value !== view.state.doc.toString()) {
    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: value,
      },
    });
  }

  onDestroy(() => view?.destroy());
</script>

<div class="editor" bind:this={host}></div>

<style>
  .editor {
    height: 100%;
    min-height: 250px;
    overflow: hidden;
  }

  .editor :global(.cm-editor) {
    height: 100%;
  }

  .editor :global(.cm-scroller) {
    overflow: auto;
  }
</style>
