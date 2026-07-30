<script lang="ts">
  import { SuperDoc } from 'superdoc';
  import { superdocFonts } from '@superdoc-dev/fonts';
  import 'superdoc/style.css';

  let editor = $state<HTMLDivElement | null>(null);
  let file = $state<File | null>(null);
  let superdoc: SuperDoc | null = null;

  function handleFile(event: Event) {
    const input = event.target as HTMLInputElement;
    file = input.files?.[0] ?? null;
  }

  $effect(() => {
    if (!editor || !file) return;
    superdoc = new SuperDoc({
      selector: editor,
      document: file,
      fonts: superdocFonts,
    });
    return () => superdoc?.destroy();
  });
</script>

<div class="toolbar">
  <input type="file" accept=".docx" onchange={handleFile} />
</div>
<div class="editor" bind:this={editor}></div>

<style>
  .toolbar {
    padding: 1rem;
    background: #f5f5f5;
  }

  .editor {
    height: calc(100vh - 60px);
  }
</style>
