<script lang="ts">
  import { SuperDoc } from 'superdoc';
  import 'superdoc/style.css';

  let mount = $state<HTMLDivElement | null>(null);
  let ready = $state(false);
  let exporting = $state(false);

  let superdoc: SuperDoc | null = null;
  let exportingLock = false;

  $effect(() => {
    if (!mount) return;

    let active = true;
    let opened = false;
    let loadFailed = false;
    ready = false;

    const instance = new SuperDoc({
      selector: mount,
      document: '/sample.docx',
      onReady: () => {
        if (!active || loadFailed) return;
        opened = true;
        ready = true;
      },
      onException: ({ error }) => {
        if (!opened) {
          loadFailed = true;
          if (active) ready = false;
        }
        console.error('SuperDoc could not open the document.', error);
      },
    });
    superdoc = instance;

    return () => {
      active = false;
      if (superdoc === instance) superdoc = null;
      instance.destroy();
    };
  });

  async function exportDocument() {
    if (exportingLock) return;
    exportingLock = true;
    exporting = true;
    try {
      await superdoc?.export({ exportType: ['docx'], exportedName: 'sample-edited' });
    } catch (error) {
      console.error('SuperDoc could not export the document.', error);
    } finally {
      exportingLock = false;
      if (superdoc) exporting = false;
    }
  }
</script>

<svelte:head>
  <title>SuperDoc SvelteKit quickstart</title>
</svelte:head>

<main>
  <button disabled={!ready || exporting} onclick={() => void exportDocument()} type="button">
    Export DOCX
  </button>
  <div class="editor" bind:this={mount}></div>
</main>

<style>
  :global(html),
  :global(body) {
    min-height: 100%;
    margin: 0;
  }

  main {
    min-height: 100vh;
  }

  button {
    margin: 1rem;
  }

  .editor {
    height: calc(100vh - 4rem);
  }
</style>
