<template>
  <div class="app">
    <header>
      <h1>Exhibit Insertion Demo</h1>
      <button @click="mainFileInput?.click()">Load Document</button>
      <input
        type="file"
        ref="mainFileInput"
        accept=".docx"
        class="hidden"
        @change="handleMainFileChange"
      >
    </header>

    <div class="main-content">
      <main class="editor-area">
        <DocumentEditor
          ref="documentEditorRef"
          :initial-data="documentFile"
          @editor-ready="handleEditorReady"
        />
      </main>

      <aside class="exhibit-panel">
        <div class="panel-header">
          <h2>Exhibits</h2>
          <button class="upload-btn" @click="exhibitFileInput?.click()">
            + Add
          </button>
          <input
            type="file"
            ref="exhibitFileInput"
            accept=".docx"
            class="hidden"
            @change="handleExhibitUpload"
          >
        </div>

        <div class="exhibits-list">
          <div
            v-for="exhibit in exhibits"
            :key="exhibit.id"
            class="exhibit-card"
          >
            <div class="exhibit-info">
              <h3>{{ exhibit.name }}</h3>
              <p>{{ exhibit.description }}</p>
            </div>
            <div class="exhibit-actions">
              <button
                class="download-btn"
                @click.stop="downloadExhibit(exhibit)"
                title="Download"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7,10 12,15 17,10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
              </button>
              <div class="insert-dropdown" :class="{ open: openDropdownId === exhibit.id }">
                <button
                  class="insert-btn"
                  @click.stop="toggleDropdown(exhibit.id)"
                  title="Insert at cursor"
                >
                  Insert
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="6,9 12,15 18,9"/>
                  </svg>
                </button>
                <div class="dropdown-menu" @click.stop>
                  <button @click="insertExhibit(exhibit, 'content')">As content</button>
                  <button @click="insertExhibit(exhibit, 'suggestion')">As suggestion</button>
                  <button @click="insertExhibit(exhibit, 'structured')">As structured content</button>
                </div>
              </div>
            </div>
          </div>

          <div v-if="exhibits.length === 0" class="empty-state">
            <p>No exhibits yet.</p>
            <p>Click "+ Add" to upload a DOCX file.</p>
          </div>
        </div>

        <div v-if="isInserting" class="inserting-overlay">
          <div class="spinner"></div>
          <span>Inserting exhibit...</span>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup>
import { ref, shallowRef, onMounted, onUnmounted } from 'vue';
import { SuperDoc } from 'superdoc';
import DocumentEditor from './components/DocumentEditor.vue';

// Load a default document on startup for easy demo
const documentFile = ref('/main-document.docx');
const mainFileInput = ref(null);
const exhibitFileInput = ref(null);
const documentEditorRef = ref(null);
const editor = shallowRef(null);
const isInserting = ref(false);
const openDropdownId = ref(null);

const toggleDropdown = (exhibitId) => {
  openDropdownId.value = openDropdownId.value === exhibitId ? null : exhibitId;
};

// Close dropdown when clicking outside
const closeDropdown = () => {
  openDropdownId.value = null;
};

onMounted(() => {
  document.addEventListener('click', closeDropdown);
});

onUnmounted(() => {
  document.removeEventListener('click', closeDropdown);
});

// Sample exhibits - in a real app these would come from a database
const exhibits = ref([
  {
    id: 'exhibit-a',
    name: 'Exhibit A',
    description: 'Sample document for insertion',
    url: '/exhibits/exhibit-a.docx'
  }
]);

const handleMainFileChange = (event) => {
  const file = event.target.files?.[0];
  if (file) {
    documentFile.value = file;
  }
};

const handleEditorReady = (editorInstance) => {
  console.log('Editor ready', editorInstance);
  editor.value = editorInstance;
};

const handleExhibitUpload = (event) => {
  const file = event.target.files?.[0];
  if (file) {
    // Create a new exhibit from the uploaded file
    const exhibit = {
      id: `exhibit-${Date.now()}`,
      name: file.name.replace('.docx', ''),
      description: 'Uploaded exhibit',
      file: file // Store the File object directly
    };
    exhibits.value.push(exhibit);

    // Reset the input
    event.target.value = '';
  }
};

const downloadExhibit = async (exhibit) => {
  try {
    let blob;
    if (exhibit.file) {
      blob = exhibit.file;
    } else {
      const response = await fetch(exhibit.url);
      blob = await response.blob();
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${exhibit.name}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Failed to download exhibit:', error);
    alert('Failed to download exhibit');
  }
};

/**
 * Insert an exhibit into the document
 * @param {Object} exhibit - The exhibit to insert
 * @param {'content' | 'suggestion' | 'structured'} mode - How to insert the exhibit
 */
const insertExhibit = async (exhibit, mode = 'content') => {
  if (!editor.value) {
    alert('Please load a document first');
    return;
  }

  // Close the dropdown
  openDropdownId.value = null;
  isInserting.value = true;

  try {
    // Get the exhibit file
    let exhibitFile;
    if (exhibit.file) {
      exhibitFile = exhibit.file;
    } else {
      const response = await fetch(exhibit.url);
      exhibitFile = await response.blob();
    }

    // Create a hidden container for loading the exhibit
    const hiddenContainer = document.createElement('div');
    hiddenContainer.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;';
    document.body.appendChild(hiddenContainer);

    // Load the exhibit in a hidden SuperDoc instance to extract its content
    const exhibitSuperdoc = new SuperDoc({
      selector: hiddenContainer,
      document: exhibitFile,
      documentMode: 'viewing',
      pagination: false,
      rulers: false,
    });

    // Wait for the exhibit to load
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout loading exhibit')), 10000);

      exhibitSuperdoc.on('editorCreate', ({ editor: exhibitEditor }) => {
        clearTimeout(timeout);

        // Give it a moment to fully initialize
        setTimeout(async () => {
          try {
            // Get the exhibit content as native ProseMirror JSON
            // This preserves all formatting and structure
            const docJson = exhibitEditor.getJSON();

            console.log('Exhibit JSON:', JSON.stringify(docJson, null, 2));

            if (!docJson?.content?.length) {
              throw new Error('Exhibit document is empty');
            }

            // Insert using native schema format
            const mainEditor = editor.value;

            if (mode === 'structured') {
              // Insert as structured content (SDT / Content Control)
              //
              // Note: The Document API's create.contentControl only accepts string content.
              // For complex DOCX content with full formatting, we use insertContent with
              // a structuredContentBlock wrapper, which preserves all ProseMirror JSON.

              // Generate a unique ID for the SDT (MS Word requires integer IDs)
              const sdtId = String(Math.floor(Math.random() * 2147483647));

              // Build the SDT node JSON with proper structure
              const sdtNode = {
                type: 'structuredContentBlock',
                attrs: {
                  id: sdtId,
                  alias: exhibit.name,
                  tag: 'exhibit_content',
                },
                content: docJson.content,
              };

              console.log('Inserting SDT node:', JSON.stringify(sdtNode, null, 2));

              // Insert the structured content block with the exhibit content inside
              mainEditor.commands.insertContent(sdtNode, { contentType: 'schema' });
            } else {
              // If inserting as suggestion, temporarily switch to suggesting mode
              const previousMode = mainEditor.options.documentMode;
              if (mode === 'suggestion') {
                mainEditor.setDocumentMode('suggesting');
              }

              // Insert content
              mainEditor.commands.insertContent(docJson, {
                contentType: 'schema'
              });

              // Restore previous mode if we changed it
              if (mode === 'suggestion') {
                mainEditor.setDocumentMode(previousMode);
              }
            }

            // Clean up
            exhibitSuperdoc.destroy();
            document.body.removeChild(hiddenContainer);

            resolve();
          } catch (err) {
            reject(err);
          }
        }, 500);
      });

      exhibitSuperdoc.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    console.log(`Inserted exhibit: ${exhibit.name} (mode: ${mode})`);
  } catch (error) {
    console.error('Failed to insert exhibit:', error);
    alert(`Failed to insert exhibit: ${error.message}`);
  } finally {
    isInserting.value = false;
  }
};
</script>

<style>
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.app {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f5f5f5;
}

header {
  padding: 1rem;
  background: #fff;
  border-bottom: 1px solid #e0e0e0;
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-shrink: 0;
}

header h1 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
}

header button {
  padding: 0.5rem 1rem;
  background: #1355ff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
}

header button:hover {
  background: #0044ff;
}

.hidden {
  display: none;
}

.main-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.editor-area {
  flex: 1;
  overflow: auto;
  padding: 1rem;
}

.exhibit-panel {
  width: 320px;
  background: #fff;
  border-left: 1px solid #e0e0e0;
  display: flex;
  flex-direction: column;
  position: relative;
}

.panel-header {
  padding: 1rem;
  border-bottom: 1px solid #e0e0e0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.panel-header h2 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.upload-btn {
  padding: 0.375rem 0.75rem;
  background: #f0f0f0;
  border: 1px solid #d0d0d0;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
}

.upload-btn:hover {
  background: #e0e0e0;
}

.exhibits-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
}

.exhibit-card {
  background: #fafafa;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 0.5rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.exhibit-card:hover {
  background: #f0f7ff;
  border-color: #1355ff;
  box-shadow: 0 2px 8px rgba(19, 85, 255, 0.1);
}

.exhibit-info h3 {
  margin: 0 0 0.25rem 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: #333;
}

.exhibit-info p {
  margin: 0;
  font-size: 0.8rem;
  color: #666;
}

.exhibit-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.download-btn, .insert-btn {
  padding: 0.375rem 0.75rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.75rem;
  transition: all 0.15s ease;
}

.download-btn {
  background: transparent;
  border: 1px solid #d0d0d0;
  color: #666;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.375rem;
}

.download-btn:hover {
  background: #f0f0f0;
  color: #333;
}

.insert-dropdown {
  position: relative;
  flex: 1;
}

.insert-btn {
  width: 100%;
  background: #1355ff;
  border: none;
  color: white;
  border-radius: 4px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 0.75rem;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  padding: 0.375rem 0.75rem;
}

.insert-btn:hover {
  background: #0044ff;
}

.insert-btn svg {
  transition: transform 0.15s ease;
}

.insert-dropdown.open .insert-btn svg {
  transform: rotate(180deg);
}

.dropdown-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 100;
  opacity: 0;
  visibility: hidden;
  transform: translateY(-4px);
  transition: all 0.15s ease;
}

.insert-dropdown.open .dropdown-menu {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}

.dropdown-menu button {
  display: block;
  width: 100%;
  padding: 0.5rem 0.75rem;
  background: none;
  border: none;
  text-align: left;
  font-size: 0.8rem;
  color: #333;
  cursor: pointer;
  transition: background 0.1s ease;
}

.dropdown-menu button:first-child {
  border-radius: 5px 5px 0 0;
}

.dropdown-menu button:last-child {
  border-radius: 0 0 5px 5px;
}

.dropdown-menu button:hover {
  background: #f0f7ff;
}

.empty-state {
  text-align: center;
  padding: 2rem 1rem;
  color: #888;
}

.empty-state p {
  margin: 0.25rem 0;
  font-size: 0.875rem;
}

.inserting-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.9);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  z-index: 10;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #e0e0e0;
  border-top-color: #1355ff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
