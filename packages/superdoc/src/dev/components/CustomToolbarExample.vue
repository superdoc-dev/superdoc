<script setup>
/**
 * Custom HTML Toolbar Example
 *
 * This component demonstrates how to build your own toolbar using plain HTML
 * buttons that execute SuperDoc editor commands.
 *
 * Props:
 *   - editorInstance: The SuperDoc instance (created via `new SuperDoc()`)
 *
 * Key Patterns:
 *   1. Get the editor:     editorInstance.activeEditor
 *   2. Editor commands:    editorInstance.activeEditor.commands.toggleBold()
 *   3. Instance methods:   editorInstance.toggleRuler()
 *   4. Check active state: editorInstance.activeEditor.isActive('bold')
 *   5. Listen for changes: editorInstance.activeEditor.on('selectionUpdate', callback)
 */

import { ref, watch, computed } from 'vue';

const props = defineProps({
  editorInstance: { type: Object, default: null },
});

// Computed property to get the active editor from the instance
const editor = computed(() => props.editorInstance?.activeEditor);

// =============================================================================
// TOOLBAR STATE - Syncs button appearance with current selection
// =============================================================================

const toolbarState = ref({
  bold: false,
  italic: false,
  underline: false,
  strike: false,
});

const updateToolbarState = () => {
  if (!editor.value) return;
  toolbarState.value = {
    bold: editor.value.isActive('bold'),
    italic: editor.value.isActive('italic'),
    underline: editor.value.isActive('underline'),
    strike: editor.value.isActive('strike'),
  };
};

// Subscribe to editor events when editor changes
watch(editor, (newEditor, oldEditor) => {
  if (oldEditor) {
    oldEditor.off('selectionUpdate', updateToolbarState);
    oldEditor.off('transaction', updateToolbarState);
  }
  if (newEditor) {
    newEditor.on('selectionUpdate', updateToolbarState);
    newEditor.on('transaction', updateToolbarState);
    updateToolbarState();
  }
}, { immediate: true });

// =============================================================================
// EDITOR COMMANDS - Standard editor.commands.* methods
// =============================================================================

// Text Formatting
const cmdBold = () => editor.value?.commands.toggleBold();
const cmdItalic = () => editor.value?.commands.toggleItalic();
const cmdUnderline = () => editor.value?.commands.toggleUnderline();
const cmdStrike = () => editor.value?.commands.toggleStrike();
const cmdClearFormat = () => editor.value?.commands.clearFormat();

// Font
const cmdFontFamily = (e) => editor.value?.commands.setFontFamily(e.target.value);
const cmdFontSize = (e) => editor.value?.commands.setFontSize(e.target.value);
const cmdLineHeight = (e) => editor.value?.commands.setLineHeight(e.target.value);

// Color
const cmdTextColor = (e) => editor.value?.commands.setColor(e.target.value);
const cmdHighlight = (e) => editor.value?.commands.setHighlight(e.target.value);
const cmdRemoveHighlight = () => editor.value?.commands.unsetHighlight();

// Alignment
const cmdAlignLeft = () => editor.value?.commands.setTextAlign('left');
const cmdAlignCenter = () => editor.value?.commands.setTextAlign('center');
const cmdAlignRight = () => editor.value?.commands.setTextAlign('right');
const cmdAlignJustify = () => editor.value?.commands.setTextAlign('justify');

// Lists & Indentation
const cmdBulletList = () => editor.value?.commands.toggleBulletList();
const cmdNumberedList = () => editor.value?.commands.toggleOrderedList();
const cmdIncreaseIndent = () => editor.value?.commands.increaseTextIndent();
const cmdDecreaseIndent = () => editor.value?.commands.decreaseTextIndent();

// History
const cmdUndo = () => editor.value?.commands.undo();
const cmdRedo = () => editor.value?.commands.redo();

// Tables
const cmdInsertTable = () => editor.value?.commands.insertTable({ rows: 3, cols: 3 });
const cmdAddRowBefore = () => editor.value?.commands.addRowBefore();
const cmdAddRowAfter = () => editor.value?.commands.addRowAfter();
const cmdAddColBefore = () => editor.value?.commands.addColumnBefore();
const cmdAddColAfter = () => editor.value?.commands.addColumnAfter();
const cmdDeleteRow = () => editor.value?.commands.deleteRow();
const cmdDeleteCol = () => editor.value?.commands.deleteColumn();
const cmdDeleteTable = () => editor.value?.commands.deleteTable();
const cmdDeleteBorders = () => editor.value?.commands.deleteCellAndTableBorders();
const cmdMergeCells = () => editor.value?.commands.mergeCells();
const cmdSplitCell = () => editor.value?.commands.splitCell();

// Track Changes
const cmdAcceptChange = () => editor.value?.commands.acceptTrackedChangeFromToolbar();
const cmdRejectChange = () => editor.value?.commands.rejectTrackedChangeFromToolbar();

// Link (prompts for URL)
const cmdToggleLink = () => {
  const href = prompt('Enter URL:');
  if (href) editor.value?.commands.setLink({ href });
};

// Linked Styles
const cmdLinkedStyle = (e) => {
  if (e.target.value) editor.value?.commands.setStyleById(e.target.value);
};

// Copy Format
const cmdCopyFormat = () => editor.value?.commands.copyFormat();

// Search
const searchQuery = ref('');
const cmdSearch = () => {
  const results = editor.value?.commands.search(searchQuery.value);
  console.log('Search results:', results);
};

// =============================================================================
// INSTANCE METHODS - These use the SuperDoc instance, not editor.commands
// =============================================================================

const cmdToggleRuler = () => props.editorInstance?.toggleRuler();
const cmdDocumentMode = (e) => props.editorInstance?.setDocumentMode(e.target.value);

// =============================================================================
// IMAGE UPLOAD - Uses file input + editor.commands.setImage()
// =============================================================================

const imageInputRef = ref(null);
const cmdStartImageUpload = () => imageInputRef.value?.click();

const handleImageSelected = async (event) => {
  const file = event.target.files?.[0];
  if (!file || !file.type.startsWith('image/')) return;
  if (file.size > 5 * 1024 * 1024) {
    alert('Image must be less than 5MB');
    return;
  }

  try {
    const dataUrl = await readFileAsDataUrl(file);
    const size = await getImageDimensions(dataUrl);
    editor.value?.commands.setImage({ src: dataUrl, size });
  } catch (err) {
    console.error('Failed to insert image:', err);
  }
  event.target.value = '';
};

const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

const getImageDimensions = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => {
    const maxWidth = 600;
    let { naturalWidth: width, naturalHeight: height } = img;
    if (width > maxWidth) {
      height = Math.round(height * (maxWidth / width));
      width = maxWidth;
    }
    resolve({ width, height });
  };
  img.onerror = () => reject(new Error('Failed to load image'));
  img.src = src;
});
</script>

<template>
  <div class="custom-toolbar">
    <div class="toolbar-row">
      <!-- History -->
      <div class="toolbar-group">
        <button class="toolbar-btn" title="Undo" :disabled="!editor" @click="cmdUndo">↶</button>
        <button class="toolbar-btn" title="Redo" :disabled="!editor" @click="cmdRedo">↷</button>
      </div>

      <div class="toolbar-divider" />

      <!-- Track Changes -->
      <div class="toolbar-group">
        <button class="toolbar-btn toolbar-btn--success" title="Accept Change" :disabled="!editor" @click="cmdAcceptChange">✓</button>
        <button class="toolbar-btn toolbar-btn--danger" title="Reject Change" :disabled="!editor" @click="cmdRejectChange">✗</button>
      </div>

      <div class="toolbar-divider" />

      <!-- Font -->
      <div class="toolbar-group">
        <select class="toolbar-select" :disabled="!editor" @change="cmdFontFamily">
          <option value="" disabled selected>Font</option>
          <option value="Arial">Arial</option>
          <option value="Times New Roman">Times New Roman</option>
          <option value="Courier New">Courier New</option>
          <option value="Georgia">Georgia</option>
        </select>
        <select class="toolbar-select toolbar-select--narrow" :disabled="!editor" @change="cmdFontSize">
          <option value="" disabled selected>Size</option>
          <option v-for="size in [8,9,10,11,12,14,16,18,20,24,36]" :key="size" :value="`${size}pt`">{{ size }}</option>
        </select>
      </div>

      <div class="toolbar-divider" />

      <!-- Text Formatting -->
      <div class="toolbar-group">
        <button class="toolbar-btn" :class="{ 'toolbar-btn--active': toolbarState.bold }" title="Bold" :disabled="!editor" @click="cmdBold"><strong>B</strong></button>
        <button class="toolbar-btn" :class="{ 'toolbar-btn--active': toolbarState.italic }" title="Italic" :disabled="!editor" @click="cmdItalic"><em>I</em></button>
        <button class="toolbar-btn" :class="{ 'toolbar-btn--active': toolbarState.underline }" title="Underline" :disabled="!editor" @click="cmdUnderline"><u>U</u></button>
        <button class="toolbar-btn" :class="{ 'toolbar-btn--active': toolbarState.strike }" title="Strikethrough" :disabled="!editor" @click="cmdStrike"><s>S</s></button>
      </div>

      <div class="toolbar-divider" />

      <!-- Colors -->
      <div class="toolbar-group">
        <input type="color" class="toolbar-color" title="Text Color" value="#000000" :disabled="!editor" @input="cmdTextColor" />
        <input type="color" class="toolbar-color toolbar-color--highlight" title="Highlight" value="#ffff00" :disabled="!editor" @input="cmdHighlight" />
        <button class="toolbar-btn" title="Remove Highlight" :disabled="!editor" @click="cmdRemoveHighlight">✕</button>
      </div>

      <div class="toolbar-divider" />

      <!-- Insert -->
      <div class="toolbar-group">
        <button class="toolbar-btn" title="Link" :disabled="!editor" @click="cmdToggleLink">🔗</button>
        <button class="toolbar-btn" title="Image" :disabled="!editor" @click="cmdStartImageUpload">🖼</button>
        <button class="toolbar-btn" title="Table" :disabled="!editor" @click="cmdInsertTable">⊞</button>
        <input ref="imageInputRef" type="file" accept="image/*" style="display: none" @change="handleImageSelected" />
      </div>

      <div class="toolbar-divider" />

      <!-- Alignment -->
      <div class="toolbar-group">
        <button class="toolbar-btn" title="Align Left" :disabled="!editor" @click="cmdAlignLeft">⫷</button>
        <button class="toolbar-btn" title="Align Center" :disabled="!editor" @click="cmdAlignCenter">⫶</button>
        <button class="toolbar-btn" title="Align Right" :disabled="!editor" @click="cmdAlignRight">⫸</button>
        <button class="toolbar-btn" title="Justify" :disabled="!editor" @click="cmdAlignJustify">☰</button>
      </div>

      <div class="toolbar-divider" />

      <!-- Lists -->
      <div class="toolbar-group">
        <button class="toolbar-btn" title="Bullet List" :disabled="!editor" @click="cmdBulletList">•</button>
        <button class="toolbar-btn" title="Numbered List" :disabled="!editor" @click="cmdNumberedList">1.</button>
        <button class="toolbar-btn" title="Decrease Indent" :disabled="!editor" @click="cmdDecreaseIndent">⇤</button>
        <button class="toolbar-btn" title="Increase Indent" :disabled="!editor" @click="cmdIncreaseIndent">⇥</button>
      </div>

      <div class="toolbar-divider" />

      <!-- Line Height & Styles -->
      <div class="toolbar-group">
        <select class="toolbar-select toolbar-select--narrow" :disabled="!editor" @change="cmdLineHeight" title="Line Height">
          <option value="1">1.0</option>
          <option value="1.15" selected>1.15</option>
          <option value="1.5">1.5</option>
          <option value="2">2.0</option>
        </select>
        <select class="toolbar-select" :disabled="!editor" @change="cmdLinkedStyle" title="Styles">
          <option value="" disabled selected>Style</option>
          <option value="Normal">Normal</option>
          <option value="Heading1">Heading 1</option>
          <option value="Heading2">Heading 2</option>
          <option value="Heading3">Heading 3</option>
        </select>
      </div>

      <div class="toolbar-divider" />

      <!-- Tools -->
      <div class="toolbar-group">
        <button class="toolbar-btn" title="Ruler" :disabled="!editor" @click="cmdToggleRuler">📏</button>
        <button class="toolbar-btn" title="Copy Format" :disabled="!editor" @click="cmdCopyFormat">🖌</button>
        <button class="toolbar-btn" title="Clear Formatting" :disabled="!editor" @click="cmdClearFormat">✕</button>
      </div>

      <div class="toolbar-divider" />

      <!-- Document Mode -->
      <div class="toolbar-group">
        <select class="toolbar-select" :disabled="!editor" @change="cmdDocumentMode" title="Document Mode">
          <option value="editing">Editing</option>
          <option value="suggesting">Suggesting</option>
          <option value="viewing">Viewing</option>
        </select>
      </div>
    </div>

    <!-- Table Actions Row -->
    <div class="toolbar-row toolbar-row--secondary">
      <div class="toolbar-group">
        <span class="toolbar-label">Table:</span>
        <button class="toolbar-btn" title="Add Row Before" :disabled="!editor" @click="cmdAddRowBefore">↑Row</button>
        <button class="toolbar-btn" title="Add Row After" :disabled="!editor" @click="cmdAddRowAfter">↓Row</button>
        <button class="toolbar-btn" title="Add Column Before" :disabled="!editor" @click="cmdAddColBefore">←Col</button>
        <button class="toolbar-btn" title="Add Column After" :disabled="!editor" @click="cmdAddColAfter">→Col</button>
        <button class="toolbar-btn" title="Delete Row" :disabled="!editor" @click="cmdDeleteRow">✕Row</button>
        <button class="toolbar-btn" title="Delete Column" :disabled="!editor" @click="cmdDeleteCol">✕Col</button>
        <button class="toolbar-btn" title="Delete Table" :disabled="!editor" @click="cmdDeleteTable">✕Tbl</button>
        <button class="toolbar-btn" title="Remove Borders" :disabled="!editor" @click="cmdDeleteBorders">⊟Bdr</button>
        <button class="toolbar-btn" title="Merge Cells" :disabled="!editor" @click="cmdMergeCells">Merge</button>
        <button class="toolbar-btn" title="Split Cell" :disabled="!editor" @click="cmdSplitCell">Split</button>
      </div>

      <div class="toolbar-divider" />

      <!-- Search -->
      <div class="toolbar-group">
        <input v-model="searchQuery" type="text" class="toolbar-input" placeholder="Search..." :disabled="!editor" @keydown.enter="cmdSearch" />
        <button class="toolbar-btn" title="Search" :disabled="!editor" @click="cmdSearch">🔍</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-toolbar {
  background: #fefce8;
  border: 2px solid #facc15;
  border-radius: 8px;
  padding: 8px;
  margin-bottom: 8px;
}

.toolbar-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.toolbar-row--secondary {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(250, 204, 21, 0.5);
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 2px;
}

.toolbar-label {
  font-size: 11px;
  color: #92400e;
  font-weight: 600;
  margin-right: 4px;
}

.toolbar-btn {
  padding: 4px 8px;
  background: #fff;
  border: 1px solid #d4d4d4;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  min-width: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.toolbar-btn:hover:not(:disabled) { background: #f5f5f5; }
.toolbar-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.toolbar-btn--active { background: #dbeafe; border-color: #3b82f6; color: #1d4ed8; }
.toolbar-btn--success { background: #dcfce7; border-color: #86efac; }
.toolbar-btn--danger { background: #fee2e2; border-color: #fca5a5; }

.toolbar-select {
  padding: 4px 6px;
  border: 1px solid #d4d4d4;
  border-radius: 4px;
  background: #fff;
  font-size: 12px;
  cursor: pointer;
}

.toolbar-select--narrow { width: 60px; }
.toolbar-select:disabled { opacity: 0.5; cursor: not-allowed; }

.toolbar-color {
  width: 28px;
  height: 28px;
  padding: 2px;
  border: 1px solid #d4d4d4;
  border-radius: 4px;
  cursor: pointer;
}

.toolbar-color--highlight { background: #ffff00; }
.toolbar-color:disabled { opacity: 0.5; cursor: not-allowed; }

.toolbar-input {
  padding: 4px 8px;
  border: 1px solid #d4d4d4;
  border-radius: 4px;
  font-size: 12px;
  width: 100px;
}

.toolbar-divider {
  width: 1px;
  height: 20px;
  background: #d4d4d4;
  margin: 0 2px;
}
</style>
