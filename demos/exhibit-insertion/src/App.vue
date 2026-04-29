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
              <button
                class="insert-btn"
                @click.stop="insertExhibit(exhibit, false)"
                title="Insert at cursor"
              >
                Insert
              </button>
              <button
                class="suggest-btn"
                @click.stop="insertExhibit(exhibit, true)"
                title="Insert as suggestion"
              >
                Suggest
              </button>
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
import { ref, shallowRef } from 'vue';
import { SuperDoc } from 'superdoc';
import DocumentEditor from './components/DocumentEditor.vue';

// Load a default document on startup for easy demo
const documentFile = ref('/main-document.docx');
const mainFileInput = ref(null);
const exhibitFileInput = ref(null);
const documentEditorRef = ref(null);
const editor = shallowRef(null);
const isInserting = ref(false);

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

const insertExhibit = async (exhibit, asSuggestion = false) => {
  if (!editor.value) {
    alert('Please load a document first');
    return;
  }

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

            // If inserting as suggestion, temporarily switch to suggesting mode
            const previousMode = mainEditor.options.documentMode;
            if (asSuggestion) {
              mainEditor.setDocumentMode('suggesting');
            }

            // Insert content
            mainEditor.commands.insertContent(docJson, {
              contentType: 'schema'
            });

            // Restore previous mode if we changed it
            if (asSuggestion) {
              mainEditor.setDocumentMode(previousMode);
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

    console.log(`Inserted exhibit: ${exhibit.name}`);
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

.insert-btn, .suggest-btn {
  background: #1355ff;
  border: none;
  color: white;
  flex: 1;
  border-radius: 4px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 0.75rem;
  font-weight: 500;
}

.insert-btn:hover, .suggest-btn:hover {
  background: #0044ff;
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
