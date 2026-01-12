<template>
  <div class="commands-panel">
    <h3>Commands Explorer</h3>

    <div class="category-filter">
      <label>Category:</label>
      <select v-model="selectedCategory">
        <option value="">All Commands</option>
        <option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option>
      </select>
    </div>

    <div class="command-selector">
      <label>Command:</label>
      <select v-model="selectedCommand" @change="resetArgs">
        <option value="">Select a command...</option>
        <option v-for="cmd in filteredCommands" :key="cmd.name" :value="cmd.name">
          {{ cmd.name }}
        </option>
      </select>
    </div>

    <div v-if="currentCommand" class="command-details">
      <div class="command-description">
        <strong>{{ currentCommand.name }}</strong>
        <p>{{ currentCommand.description }}</p>
      </div>

      <div v-if="currentCommand.args.length > 0" class="args-section">
        <h4>Arguments</h4>
        <div v-for="arg in currentCommand.args" :key="arg.name" class="arg-input">
          <label :for="arg.name">
            {{ arg.name }}
            <span class="arg-type">({{ arg.type }})</span>
            <span v-if="arg.required" class="required">*</span>
          </label>

          <template v-if="arg.type === 'boolean'">
            <input
              type="checkbox"
              :id="arg.name"
              v-model="argValues[arg.name]"
            >
          </template>

          <template v-else-if="arg.type === 'number'">
            <input
              type="number"
              :id="arg.name"
              v-model.number="argValues[arg.name]"
              :placeholder="arg.default !== undefined ? `Default: ${arg.default}` : ''"
            >
          </template>

          <template v-else-if="arg.type === 'select' && arg.options">
            <select :id="arg.name" v-model="argValues[arg.name]">
              <option v-for="opt in arg.options" :key="opt" :value="opt">{{ opt }}</option>
            </select>
          </template>

          <template v-else-if="arg.type === 'color'">
            <div class="color-input">
              <input
                type="color"
                :id="arg.name"
                v-model="argValues[arg.name]"
              >
              <input
                type="text"
                v-model="argValues[arg.name]"
                placeholder="#000000"
              >
            </div>
          </template>

          <template v-else>
            <input
              type="text"
              :id="arg.name"
              v-model="argValues[arg.name]"
              :placeholder="arg.placeholder || ''"
            >
          </template>

          <small v-if="arg.description">{{ arg.description }}</small>
        </div>
      </div>

      <div class="actions">
        <button @click="executeCommand" :disabled="!canExecute" class="execute-btn">
          Execute Command
        </button>
        <button @click="checkCanExecute" class="check-btn">
          Check (can())
        </button>
      </div>

      <div v-if="lastResult !== null" class="result">
        <strong>Result:</strong>
        <span :class="{ success: lastResult, failure: !lastResult }">
          {{ lastResult ? 'Success' : 'Failed' }}
        </span>
      </div>

      <div class="code-preview">
        <strong>Code:</strong>
        <pre>{{ generatedCode }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, toRaw } from 'vue';

const props = defineProps({
  editor: {
    type: Object,
    default: null
  }
});

// Helper to get the raw superdoc instance (Vue proxy can't access private fields)
const getActiveEditor = () => {
  if (!props.editor) return null;
  const raw = toRaw(props.editor);
  return raw.activeEditor;
};

const selectedCategory = ref('');
const selectedCommand = ref('');
const argValues = ref({});
const lastResult = ref(null);

// Command definitions with their signatures
const commands = [
  // Text Formatting
  { name: 'toggleBold', category: 'Formatting', description: 'Toggle bold formatting', args: [] },
  { name: 'setBold', category: 'Formatting', description: 'Apply bold formatting', args: [] },
  { name: 'unsetBold', category: 'Formatting', description: 'Remove bold formatting', args: [] },
  { name: 'toggleItalic', category: 'Formatting', description: 'Toggle italic formatting', args: [] },
  { name: 'setItalic', category: 'Formatting', description: 'Apply italic formatting', args: [] },
  { name: 'unsetItalic', category: 'Formatting', description: 'Remove italic formatting', args: [] },
  { name: 'toggleUnderline', category: 'Formatting', description: 'Toggle underline formatting', args: [] },
  { name: 'setUnderline', category: 'Formatting', description: 'Apply underline formatting', args: [] },
  { name: 'unsetUnderline', category: 'Formatting', description: 'Remove underline formatting', args: [] },
  { name: 'toggleStrike', category: 'Formatting', description: 'Toggle strikethrough', args: [] },
  { name: 'setStrike', category: 'Formatting', description: 'Apply strikethrough', args: [] },
  { name: 'unsetStrike', category: 'Formatting', description: 'Remove strikethrough', args: [] },

  // Color & Highlight
  {
    name: 'setColor',
    category: 'Color',
    description: 'Set text color',
    args: [{ name: 'color', type: 'color', required: true, description: 'Color value (hex, rgb, or named)' }]
  },
  { name: 'unsetColor', category: 'Color', description: 'Remove text color', args: [] },
  {
    name: 'setHighlight',
    category: 'Color',
    description: 'Set highlight/background color',
    args: [{ name: 'color', type: 'color', required: true, description: 'Highlight color' }]
  },
  { name: 'unsetHighlight', category: 'Color', description: 'Remove highlight', args: [] },
  { name: 'toggleHighlight', category: 'Color', description: 'Toggle highlight', args: [] },

  // Font
  {
    name: 'setFontSize',
    category: 'Font',
    description: 'Set font size',
    args: [{ name: 'size', type: 'string', required: true, placeholder: '16px or 12pt', description: 'Font size with unit' }]
  },
  { name: 'unsetFontSize', category: 'Font', description: 'Remove font size', args: [] },
  {
    name: 'setFontFamily',
    category: 'Font',
    description: 'Set font family',
    args: [{ name: 'fontFamily', type: 'string', required: true, placeholder: 'Arial, sans-serif', description: 'Font family name' }]
  },
  { name: 'unsetFontFamily', category: 'Font', description: 'Remove font family', args: [] },

  // Text Alignment
  {
    name: 'setTextAlign',
    category: 'Alignment',
    description: 'Set text alignment',
    args: [{ name: 'align', type: 'select', options: ['left', 'center', 'right', 'justify'], required: true }]
  },
  { name: 'unsetTextAlign', category: 'Alignment', description: 'Remove text alignment', args: [] },

  // Headings
  {
    name: 'setHeading',
    category: 'Block',
    description: 'Convert to heading',
    args: [{ name: 'level', type: 'select', options: [1, 2, 3, 4, 5, 6], required: true, description: 'Heading level (1-6)' }],
    wrapInObject: true
  },
  {
    name: 'toggleHeading',
    category: 'Block',
    description: 'Toggle heading',
    args: [{ name: 'level', type: 'select', options: [1, 2, 3, 4, 5, 6], required: true }],
    wrapInObject: true
  },

  // Lists
  { name: 'toggleBulletList', category: 'Lists', description: 'Toggle bullet list', args: [] },
  { name: 'toggleOrderedList', category: 'Lists', description: 'Toggle numbered list', args: [] },
  { name: 'splitListItem', category: 'Lists', description: 'Split list item at cursor (Enter)', args: [] },
  { name: 'sinkListItem', category: 'Lists', description: 'Increase list indent', args: [] },
  { name: 'liftListItem', category: 'Lists', description: 'Decrease list indent', args: [] },

  // Links
  {
    name: 'setLink',
    category: 'Links',
    description: 'Create a link',
    args: [
      { name: 'href', type: 'string', required: true, placeholder: 'https://example.com' },
      { name: 'text', type: 'string', required: false, placeholder: 'Link text (optional)' }
    ],
    wrapInObject: true
  },
  { name: 'unsetLink', category: 'Links', description: 'Remove link', args: [] },
  {
    name: 'toggleLink',
    category: 'Links',
    description: 'Toggle link',
    args: [
      { name: 'href', type: 'string', required: false, placeholder: 'https://example.com' },
      { name: 'text', type: 'string', required: false, placeholder: 'Link text' }
    ],
    wrapInObject: true
  },

  // Images
  {
    name: 'setImage',
    category: 'Media',
    description: 'Insert an image',
    args: [
      { name: 'src', type: 'string', required: true, placeholder: 'https://example.com/image.jpg' },
      { name: 'alt', type: 'string', required: false, placeholder: 'Alt text' },
      { name: 'title', type: 'string', required: false, placeholder: 'Title' }
    ],
    wrapInObject: true
  },

  // Tables
  {
    name: 'insertTable',
    category: 'Tables',
    description: 'Insert a table',
    args: [
      { name: 'rows', type: 'number', default: 3, description: 'Number of rows' },
      { name: 'cols', type: 'number', default: 3, description: 'Number of columns' },
      { name: 'withHeaderRow', type: 'boolean', default: false, description: 'Include header row' }
    ],
    wrapInObject: true
  },
  { name: 'deleteTable', category: 'Tables', description: 'Delete entire table', args: [] },
  { name: 'addColumnBefore', category: 'Tables', description: 'Add column before current', args: [] },
  { name: 'addColumnAfter', category: 'Tables', description: 'Add column after current', args: [] },
  { name: 'deleteColumn', category: 'Tables', description: 'Delete current column', args: [] },
  { name: 'addRowBefore', category: 'Tables', description: 'Add row before current', args: [] },
  { name: 'addRowAfter', category: 'Tables', description: 'Add row after current', args: [] },
  { name: 'deleteRow', category: 'Tables', description: 'Delete current row', args: [] },
  { name: 'mergeCells', category: 'Tables', description: 'Merge selected cells', args: [] },
  { name: 'splitCell', category: 'Tables', description: 'Split merged cell', args: [] },
  { name: 'toggleHeaderRow', category: 'Tables', description: 'Toggle header row', args: [] },
  { name: 'toggleHeaderColumn', category: 'Tables', description: 'Toggle header column', args: [] },
  {
    name: 'setCellBackground',
    category: 'Tables',
    description: 'Set cell background color',
    args: [{ name: 'color', type: 'color', required: true, description: 'Background color' }]
  },

  // History
  { name: 'undo', category: 'History', description: 'Undo last action', args: [] },
  { name: 'redo', category: 'History', description: 'Redo last undone action', args: [] },

  // Selection
  { name: 'selectAll', category: 'Selection', description: 'Select entire document', args: [] },
  { name: 'deleteSelection', category: 'Selection', description: 'Delete selected content', args: [] },

  // Content
  {
    name: 'insertContent',
    category: 'Content',
    description: 'Insert content at cursor',
    args: [{ name: 'content', type: 'string', required: true, placeholder: 'Text or HTML' }]
  },

  // Format Commands
  { name: 'clearFormat', category: 'Format', description: 'Clear all formatting', args: [] },
  { name: 'clearMarksFormat', category: 'Format', description: 'Clear text marks only', args: [] },
  { name: 'clearNodesFormat', category: 'Format', description: 'Clear block formatting only', args: [] },

  // Comments
  {
    name: 'insertComment',
    category: 'Comments',
    description: 'Insert a comment on selection',
    args: []
  },
  {
    name: 'removeComment',
    category: 'Comments',
    description: 'Remove a comment by ID',
    args: [{ name: 'commentId', type: 'string', required: true, placeholder: 'Comment ID' }],
    wrapInObject: true
  },

  // Track Changes
  { name: 'toggleTrackChanges', category: 'Track Changes', description: 'Toggle track changes mode', args: [] },
  { name: 'enableTrackChanges', category: 'Track Changes', description: 'Enable track changes', args: [] },
  { name: 'disableTrackChanges', category: 'Track Changes', description: 'Disable track changes', args: [] },
  { name: 'acceptAllTrackedChanges', category: 'Track Changes', description: 'Accept all tracked changes', args: [] },
  { name: 'rejectAllTrackedChanges', category: 'Track Changes', description: 'Reject all tracked changes', args: [] },

  // Search
  {
    name: 'search',
    category: 'Search',
    description: 'Search for text (returns matches)',
    args: [{ name: 'pattern', type: 'string', required: true, placeholder: 'Search text or regex' }]
  },
];

const categories = computed(() => {
  const cats = new Set(commands.map(c => c.category));
  return Array.from(cats).sort();
});

const filteredCommands = computed(() => {
  if (!selectedCategory.value) return commands;
  return commands.filter(c => c.category === selectedCategory.value);
});

const currentCommand = computed(() => {
  return commands.find(c => c.name === selectedCommand.value);
});

const canExecute = computed(() => {
  if (!props.editor || !currentCommand.value) return false;

  // Check if command exists on editor
  const activeEditor = getActiveEditor();
  const cmd = activeEditor?.commands?.[selectedCommand.value];
  if (!cmd) return false;

  // Check required args
  for (const arg of currentCommand.value.args) {
    if (arg.required && !argValues.value[arg.name]) return false;
  }

  return true;
});

const generatedCode = computed(() => {
  if (!currentCommand.value) return '';

  const cmd = currentCommand.value;
  let argsStr = '';

  if (cmd.args.length > 0) {
    if (cmd.wrapInObject) {
      const objProps = cmd.args
        .filter(arg => argValues.value[arg.name] !== undefined && argValues.value[arg.name] !== '')
        .map(arg => {
          const val = formatArgValue(arg, argValues.value[arg.name]);
          return `  ${arg.name}: ${val}`;
        });
      if (objProps.length > 0) {
        argsStr = `{\n${objProps.join(',\n')}\n}`;
      } else {
        argsStr = '{}';
      }
    } else if (cmd.args.length === 1) {
      const arg = cmd.args[0];
      const val = argValues.value[arg.name];
      if (val !== undefined && val !== '') {
        argsStr = formatArgValue(arg, val);
      }
    } else {
      const vals = cmd.args
        .map(arg => formatArgValue(arg, argValues.value[arg.name]))
        .filter(v => v !== undefined);
      argsStr = vals.join(', ');
    }
  }

  return `editor.commands.${cmd.name}(${argsStr})`;
});

function formatArgValue(arg, value) {
  if (value === undefined || value === '') return undefined;
  if (arg.type === 'number') return value;
  if (arg.type === 'boolean') return value;
  if (arg.type === 'select' && typeof value === 'number') return value;
  return `'${value}'`;
}

function resetArgs() {
  argValues.value = {};
  lastResult.value = null;

  // Set defaults
  if (currentCommand.value) {
    for (const arg of currentCommand.value.args) {
      if (arg.default !== undefined) {
        argValues.value[arg.name] = arg.default;
      }
    }
  }
}

function executeCommand() {
  if (!props.editor || !canExecute.value) return;

  try {
    const activeEditor = getActiveEditor();
    if (!activeEditor) {
      console.error('No active editor');
      lastResult.value = false;
      return;
    }

    const cmd = activeEditor.commands[selectedCommand.value];
    if (!cmd) {
      console.error(`Command ${selectedCommand.value} not found`);
      lastResult.value = false;
      return;
    }

    const cmdDef = currentCommand.value;
    let result;

    if (cmdDef.args.length === 0) {
      result = cmd();
    } else if (cmdDef.wrapInObject) {
      const argsObj = {};
      for (const arg of cmdDef.args) {
        const val = argValues.value[arg.name];
        if (val !== undefined && val !== '') {
          argsObj[arg.name] = arg.type === 'number' ? Number(val) : val;
        }
      }
      result = cmd(argsObj);
    } else if (cmdDef.args.length === 1) {
      const val = argValues.value[cmdDef.args[0].name];
      result = cmd(val);
    } else {
      const vals = cmdDef.args.map(arg => argValues.value[arg.name]);
      result = cmd(...vals);
    }

    lastResult.value = result !== false;
    console.log(`Command ${selectedCommand.value} result:`, result);
  } catch (error) {
    console.error('Command execution error:', error);
    lastResult.value = false;
  }
}

function checkCanExecute() {
  if (!props.editor) return;

  try {
    const activeEditor = getActiveEditor();
    if (!activeEditor) {
      alert('No active editor');
      return;
    }

    const cmdDef = currentCommand.value;
    const canObj = activeEditor.can();
    const cmdFn = canObj[selectedCommand.value];

    if (!cmdFn) {
      alert(`Command "${selectedCommand.value}" not found on can()`);
      return;
    }

    let canRun;

    if (cmdDef.args.length === 0) {
      canRun = cmdFn();
    } else if (cmdDef.wrapInObject) {
      const argsObj = {};
      for (const arg of cmdDef.args) {
        const val = argValues.value[arg.name];
        if (val !== undefined && val !== '') {
          argsObj[arg.name] = arg.type === 'number' ? Number(val) : val;
        }
      }
      canRun = cmdFn(argsObj);
    } else if (cmdDef.args.length === 1) {
      const val = argValues.value[cmdDef.args[0].name];
      canRun = cmdFn(val);
    } else {
      const vals = cmdDef.args.map(arg => argValues.value[arg.name]);
      canRun = cmdFn(...vals);
    }

    alert(`can().${selectedCommand.value}() = ${canRun}`);
  } catch (error) {
    console.error('Can check error:', error);
    // Some commands don't properly handle can() checks
    alert(`can() check failed: ${error.message}\n\nThis command may not support can() checks.`);
  }
}

// Reset args when command changes
watch(selectedCommand, resetArgs);
</script>

<style scoped>
.commands-panel {
  padding: 1rem;
  background: #f9f9f9;
  border-radius: 8px;
  max-height: calc(100vh - 120px);
  overflow-y: auto;
}

.commands-panel h3 {
  margin-top: 0;
  margin-bottom: 1rem;
  color: #333;
}

.category-filter,
.command-selector {
  margin-bottom: 1rem;
}

.category-filter label,
.command-selector label {
  display: block;
  margin-bottom: 0.25rem;
  font-weight: 500;
  color: #555;
}

.category-filter select,
.command-selector select {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.command-details {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #ddd;
}

.command-description {
  margin-bottom: 1rem;
}

.command-description strong {
  color: #1355ff;
  font-size: 16px;
}

.command-description p {
  margin: 0.25rem 0 0;
  color: #666;
  font-size: 13px;
}

.args-section h4 {
  margin: 0 0 0.75rem;
  font-size: 14px;
  color: #333;
}

.arg-input {
  margin-bottom: 0.75rem;
}

.arg-input label {
  display: block;
  margin-bottom: 0.25rem;
  font-size: 13px;
  color: #444;
}

.arg-type {
  color: #888;
  font-weight: normal;
}

.required {
  color: #e74c3c;
}

.arg-input input[type="text"],
.arg-input input[type="number"],
.arg-input select {
  width: 100%;
  padding: 0.4rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 13px;
}

.arg-input input[type="checkbox"] {
  margin-right: 0.5rem;
}

.color-input {
  display: flex;
  gap: 0.5rem;
}

.color-input input[type="color"] {
  width: 40px;
  height: 32px;
  padding: 0;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
}

.color-input input[type="text"] {
  flex: 1;
}

.arg-input small {
  display: block;
  margin-top: 0.25rem;
  color: #888;
  font-size: 11px;
}

.actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 1rem;
}

.execute-btn {
  flex: 1;
  padding: 0.6rem 1rem;
  background: #1355ff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.execute-btn:hover:not(:disabled) {
  background: #0044ff;
}

.execute-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.check-btn {
  padding: 0.6rem 1rem;
  background: #666;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.check-btn:hover {
  background: #555;
}

.result {
  margin-top: 1rem;
  padding: 0.5rem;
  background: #fff;
  border-radius: 4px;
  font-size: 14px;
}

.result .success {
  color: #27ae60;
  font-weight: 500;
}

.result .failure {
  color: #e74c3c;
  font-weight: 500;
}

.code-preview {
  margin-top: 1rem;
}

.code-preview strong {
  display: block;
  margin-bottom: 0.25rem;
  font-size: 13px;
  color: #555;
}

.code-preview pre {
  margin: 0;
  padding: 0.75rem;
  background: #2d2d2d;
  color: #f8f8f2;
  border-radius: 4px;
  font-size: 12px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
