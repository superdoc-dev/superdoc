<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { SuperDoc } from 'superdoc';
  import 'superdoc/style.css';
  import {
    createHeadlessToolbar,
    headlessToolbarConstants,
    type HeadlessToolbarController,
    type ToolbarSnapshot,
    type PublicToolbarItemId,
  } from 'superdoc/headless-toolbar';
  import {
    Bold,
    Italic,
    Underline,
    Strikethrough,
    AlignLeft,
    AlignCenter,
    AlignRight,
    AlignJustify,
    List,
    ListOrdered,
    Undo2,
    Redo2,
    ImagePlus,
    type Icon,
  } from 'lucide-svelte';

  const COMMANDS: PublicToolbarItemId[] = [
    'bold', 'italic', 'underline', 'strikethrough',
    'font-family', 'font-size', 'text-color', 'text-align',
    'bullet-list', 'numbered-list',
    'undo', 'redo', 'image',
  ];

  const ALIGN_ICONS: Record<string, typeof Icon> = {
    left: AlignLeft,
    center: AlignCenter,
    right: AlignRight,
    justify: AlignJustify,
  };

  let editorEl: HTMLDivElement;
  let snapshot = $state<ToolbarSnapshot>({ context: null, commands: {} });
  let controller: HeadlessToolbarController | null = $state(null);
  let unsub: (() => void) | null = null;

  const fontFamilies = headlessToolbarConstants.DEFAULT_FONT_FAMILY_OPTIONS;
  const fontSizes = headlessToolbarConstants.DEFAULT_FONT_SIZE_OPTIONS;

  function exec(id: PublicToolbarItemId, payload?: unknown) {
    controller?.execute(id, payload);
  }

  function isActive(id: PublicToolbarItemId): boolean {
    return snapshot.commands[id]?.active ?? false;
  }

  function isDisabled(id: PublicToolbarItemId): boolean {
    return snapshot.commands[id]?.disabled ?? true;
  }

  function cmdValue(id: PublicToolbarItemId): unknown {
    return snapshot.commands[id]?.value;
  }

  let currentAlign = $derived((cmdValue('text-align') as string) ?? 'left');
  let CurrentAlignIcon = $derived(ALIGN_ICONS[currentAlign] ?? AlignLeft);

  function cycleAlign() {
    const order = ['left', 'center', 'right', 'justify'];
    const next = order[(order.indexOf(currentAlign) + 1) % order.length];
    exec('text-align', next);
  }

  onMount(() => {
    const superdoc = new SuperDoc({
      selector: editorEl,
      document: '/test_file.docx',
    });

    const tb = createHeadlessToolbar({ superdoc, commands: COMMANDS });
    controller = tb;
    snapshot = tb.getSnapshot();

    unsub = tb.subscribe(({ snapshot: s }) => {
      snapshot = s;
    });
  });

  onDestroy(() => {
    unsub?.();
    controller?.destroy();
  });
</script>

<!-- Editor fills viewport above the bottom bar -->
<div class="h-full pb-12">
  <div bind:this={editorEl} class="h-full"></div>
</div>

<!-- Bottom toolbar -->
<div
  class="fixed bottom-0 inset-x-0 h-12 z-50 flex items-center gap-1 px-3
         bg-white/80 backdrop-blur border-t border-gray-200
         dark:bg-gray-900/80 dark:border-gray-700"
>
  <!-- Font family -->
  <select
    class="h-7 text-xs rounded border border-gray-300 bg-transparent px-1
           dark:border-gray-600 dark:text-gray-200"
    title="Font family"
    disabled={isDisabled('font-family')}
    value={cmdValue('font-family') ?? ''}
    onchange={(e) => exec('font-family', (e.target as HTMLSelectElement).value)}
  >
    {#each fontFamilies as f}
      <option value={f.value}>{f.label}</option>
    {/each}
  </select>

  <!-- Font size -->
  <select
    class="h-7 w-14 text-xs rounded border border-gray-300 bg-transparent px-1
           dark:border-gray-600 dark:text-gray-200"
    title="Font size"
    disabled={isDisabled('font-size')}
    value={cmdValue('font-size') ?? ''}
    onchange={(e) => exec('font-size', (e.target as HTMLSelectElement).value)}
  >
    {#each fontSizes as s}
      <option value={s.value}>{s.label}</option>
    {/each}
  </select>

  <span class="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1"></span>

  <!-- Toggle buttons -->
  <button title="Bold" class="toolbar-btn" class:active={isActive('bold')} disabled={isDisabled('bold')} onclick={() => exec('bold')}>
    <Bold size={16} />
  </button>
  <button title="Italic" class="toolbar-btn" class:active={isActive('italic')} disabled={isDisabled('italic')} onclick={() => exec('italic')}>
    <Italic size={16} />
  </button>
  <button title="Underline" class="toolbar-btn" class:active={isActive('underline')} disabled={isDisabled('underline')} onclick={() => exec('underline')}>
    <Underline size={16} />
  </button>
  <button title="Strikethrough" class="toolbar-btn" class:active={isActive('strikethrough')} disabled={isDisabled('strikethrough')} onclick={() => exec('strikethrough')}>
    <Strikethrough size={16} />
  </button>

  <!-- Text color -->
  <label class="toolbar-btn relative" title="Text color">
    <span class="text-xs font-bold leading-none" style="color: {cmdValue('text-color') ?? '#000'}">A</span>
    <span class="absolute bottom-0.5 left-1/2 -translate-x-1/2 h-0.5 w-3 rounded" style="background: {cmdValue('text-color') ?? '#000'}"></span>
    <input
      type="color"
      class="sr-only"
      disabled={isDisabled('text-color')}
      value={cmdValue('text-color') ?? '#000000'}
      onchange={(e) => exec('text-color', (e.target as HTMLInputElement).value)}
    />
  </label>

  <span class="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1"></span>

  <!-- Alignment (cycle) -->
  <button title="Text align: {currentAlign}" class="toolbar-btn" disabled={isDisabled('text-align')} onclick={cycleAlign}>
    <CurrentAlignIcon size={16} />
  </button>

  <!-- Lists -->
  <button title="Bullet list" class="toolbar-btn" class:active={isActive('bullet-list')} disabled={isDisabled('bullet-list')} onclick={() => exec('bullet-list')}>
    <List size={16} />
  </button>
  <button title="Numbered list" class="toolbar-btn" class:active={isActive('numbered-list')} disabled={isDisabled('numbered-list')} onclick={() => exec('numbered-list')}>
    <ListOrdered size={16} />
  </button>

  <span class="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1"></span>

  <!-- Image -->
  <button title="Insert image" class="toolbar-btn" disabled={isDisabled('image')} onclick={() => exec('image')}>
    <ImagePlus size={16} />
  </button>

  <!-- Spacer -->
  <div class="flex-1"></div>

  <!-- Undo / Redo -->
  <button title="Undo" class="toolbar-btn" disabled={isDisabled('undo')} onclick={() => exec('undo')}>
    <Undo2 size={16} />
  </button>
  <button title="Redo" class="toolbar-btn" disabled={isDisabled('redo')} onclick={() => exec('redo')}>
    <Redo2 size={16} />
  </button>
</div>

<style>
  @reference "tailwindcss";

  .toolbar-btn {
    @apply flex items-center justify-center w-8 h-8 rounded
           text-gray-600 hover:bg-gray-100
           disabled:opacity-30 disabled:pointer-events-none
           transition-colors cursor-pointer;
  }
  .toolbar-btn.active {
    @apply bg-gray-200 text-gray-900;
  }
  :global(.dark) .toolbar-btn {
    @apply text-gray-300 hover:bg-gray-700;
  }
  :global(.dark) .toolbar-btn.active {
    @apply bg-gray-700 text-white;
  }
</style>
