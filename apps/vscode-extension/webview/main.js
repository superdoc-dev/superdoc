// SuperDoc integration for VS Code webview
/* global document, window, setTimeout, clearTimeout, acquireVsCodeApi, File */

import superdocCss from 'superdoc/style.css';

let vscode = null;

function debug(message) {
    if (!vscode) {
        return;
    }
    vscode.postMessage({ type: 'debug', message: `[Webview] - ${message}` });
}

debug('Webview main.js loading...');

// Test if DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeWebview);
} else {
    initializeWebview();
}

function initializeWebview() {
    debug('DOM ready, initializing webview...');
    
    // Inject SuperDoc CSS
    if (superdocCss) {
        const style = document.createElement('style');
        style.textContent = superdocCss;
        document.head.appendChild(style);
        debug('CSS injected');
    }
    debug('Done initializing webview');
}

vscode = acquireVsCodeApi();
debug('VS Code API acquired');

// Import SuperDoc - will be bundled by esbuild
import { SuperDoc } from 'superdoc';
debug('SuperDoc imported');

let editor = null;
let currentFileData = null;
let saveTimeout = null;
let isInitialLoad = true;

// Configuration
const AUTO_SAVE_DELAY = 1000; // milliseconds

// Initialize editor with file data
function initializeEditor(fileArrayBuffer) {
    debug('Initializing editor with file buffer');

    try {
        // Convert ArrayBuffer to File object
        const file = new File([fileArrayBuffer], 'document.docx', {
            type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        });

        debug(`File created: ${file.name}, ${file.size} bytes`);

        // Clean up previous editor instance
        if (editor) {
            debug('Destroying previous editor...');
            try {
                if (editor.destroy) {
                    editor.destroy();
                }
            } catch (e) {
                debug(`Error destroying previous editor: ${e.message}`);
            }
            editor = null;
            debug('Destroyed previous editor');
        }

        // Reset state for new editor
        isInitialLoad = true;

        // Check if DOM elements exist
        const superdocElement = document.getElementById('superdoc');
        const toolbarElement = document.getElementById('superdoc-toolbar');

        // Clear existing content from containers
        if (superdocElement) {
            superdocElement.innerHTML = '';
        }
        if (toolbarElement) {
            toolbarElement.innerHTML = '';
        }
        
        if (!superdocElement || !toolbarElement) {
            throw new Error('Required DOM elements not found (#superdoc or #superdoc-toolbar)');
        }
        
        debug('DOM elements found, creating SuperDoc...');
        
        try {
            editor = new SuperDoc({
                selector: '#superdoc',
                toolbar: '#superdoc-toolbar',
                document: file,
                documentMode: 'editing',
                pagination: true,
                rulers: true,
                onReady: () => {
                    debug('SuperDoc is ready');
                    isInitialLoad = false;
                    setupEditorListeners();
                },
                onEditorCreate: () => {
                    debug('Editor created');
                },
                onError: (error) => {
                    debug(`SuperDoc error: ${error.message || error}`);
                }
            });
            
            debug('SuperDoc init complete');
            
        } catch (constructorError) {
            debug(`SuperDoc constructor failed: ${constructorError.message}`);
        }

    } catch (error) {
        debug(`Failed to initialize SuperDoc: ${error.message}`);
    }
}

// Setup editor listeners for content changes (debounced save on update)
function setupEditorListeners() {
    if (!editor?.activeEditor) {
        debug('No editor or activeEditor available');
        return;
    }

    debug('Setting up editor update listener');

    editor.activeEditor.on('update', async ({ editor: editorInstance }) => {
        if (isInitialLoad) return;

        const html = editorInstance.getHTML();
        debug(`Content updated: ${html?.length || 0} chars`);
        scheduleAutoSave();
    });

    debug('Editor update listener ready');
}

// Schedule auto-save with debouncing
function scheduleAutoSave() {
    // Clear existing timeout
    if (saveTimeout) {
        clearTimeout(saveTimeout);
    }

    // Schedule new save
    saveTimeout = setTimeout(() => {
        saveDocument();
    }, AUTO_SAVE_DELAY);
}

// Save document back to VS Code
async function saveDocument() {
    if (!editor) {
        debug('No editor available for saving');
        return;
    }

    try {
        debug('Starting document save...');

        const blob = await editor.export({ format: 'docx' });
        if (!blob) {
            debug('Failed to export - no blob returned');
            return;
        }

        debug(`Exported blob size: ${blob.size} bytes`);

        const arrayBuffer = await blob.arrayBuffer();
        const contentArray = Array.from(new Uint8Array(arrayBuffer));

        vscode.postMessage({
            type: 'update',
            content: contentArray
        });

        debug(`Document sent to VS Code (${contentArray.length} bytes)`);
    } catch (error) {
        debug(`Error saving document: ${error.message}`);
    }
}

// Handle messages from VS Code
window.addEventListener('message', async event => {
    const message = event.data;
    if (!message?.type) {
        return;
    }

    debug(`Received message: ${message.type}`);

    switch (message.type) {
        case 'update':
            if (message.content?.data) {
                currentFileData = new Uint8Array(message.content.data).buffer;
                debug(`Initial file data received: ${currentFileData.byteLength} bytes`);
                initializeEditor(currentFileData);
            }
            break;

        case 'reload':
            if (message.content?.data) {
                debug('External file change detected - reloading editor');
                currentFileData = new Uint8Array(message.content.data).buffer;
                debug(`Reload data received: ${currentFileData.byteLength} bytes`);
                initializeEditor(currentFileData);
                debug('Editor re-initialized from external change');
            }
            break;
    }
});

// Notify VS Code that the webview is ready
debug('Notifying VS Code that webview is ready');
vscode.postMessage({ type: 'ready' });

// Handle keyboard shortcuts
document.addEventListener('keydown', (event) => {
    // Ctrl/Cmd + S to save
    if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        saveDocument();
        vscode.postMessage({ type: 'save' });
    }
});