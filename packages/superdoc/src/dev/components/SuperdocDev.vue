<script setup>
import '@superdoc/common/styles/common-styles.css';
import '../dev-styles.css';
import { nextTick, onMounted, onBeforeUnmount, provide, ref, shallowRef, computed, watch } from 'vue';

import { SuperDoc } from '@superdoc/index.js';
import { DOCX, PDF, HTML } from '@superdoc/common';
import { getFileObject } from '@superdoc/common';
import BasicUpload from '@superdoc/common/components/BasicUpload.vue';
import SuperdocLogo from './superdoc-logo.webp?url';
import { fieldAnnotationHelpers } from '@superdoc/super-editor';
import { toolbarIcons } from '../../../../super-editor/src/components/toolbar/toolbarIcons';
import BlankDOCX from '@superdoc/common/data/blank.docx?url';
import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs';
import SidebarSearch from './sidebar/SidebarSearch.vue';
import SidebarFieldAnnotations from './sidebar/SidebarFieldAnnotations.vue';
import SidebarLayout from './sidebar/SidebarLayout.vue';
import { HocuspocusProvider } from '@hocuspocus/provider';
import * as Y from 'yjs';

// note:
// Or set worker globally outside the component.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

/* For local dev */
const superdoc = shallowRef(null);
const activeEditor = shallowRef(null);

const title = ref('initial title');
const currentFile = ref(null);
const commentsPanel = ref(null);
const showCommentsPanel = ref(true);
const sidebarInstanceKey = ref(0);

const urlParams = new URLSearchParams(window.location.search);
const wordBaselineServiceUrl = 'http://127.0.0.1:9185';
const clampOpacity = (v) => Math.min(1, Math.max(0, v));
const overlayOpacityFromUrl = Number.parseFloat(urlParams.get('wordOverlayOpacity') ?? '0.45');
const isInternal = urlParams.has('internal');
const testUserEmail = urlParams.get('email') || 'user@superdoc.com';
const testUserName = urlParams.get('name') || `SuperDoc ${Math.floor(1000 + Math.random() * 9000)}`;
const userRole = urlParams.get('role') || 'editor';
const useLayoutEngine = ref(urlParams.get('layout') !== '0');
const useWebLayout = ref(urlParams.get('view') === 'web');
const useCollaboration = urlParams.get('collab') === '1';
const useWordOverlay = ref(urlParams.get('wordOverlay') !== '0');
const wordOverlayOpacity = ref(Number.isFinite(overlayOpacityFromUrl) ? clampOpacity(overlayOpacityFromUrl) : 0.45);
const wordOverlayBlendMode = ref(urlParams.get('wordOverlayBlend') || 'difference');
const generatedWordScreenshots = ref([]);
const isGeneratingWordBaseline = ref(false);
const wordBaselineStatus = ref('');
const wordBaselineError = ref('');
const wordOverlayOpacityLabel = computed(() => `${Math.round(wordOverlayOpacity.value * 100)}%`);
const wordOverlayAvailable = computed(
  () => useLayoutEngine.value && !useWebLayout.value && generatedWordScreenshots.value.length > 0,
);
let wordOverlayLayoutUnsubscribe = null;

// Collaboration state
const ydocRef = shallowRef(null);
const providerRef = shallowRef(null);
const collabReady = ref(false);
const superdocLogo = SuperdocLogo;
const uploadedFileName = ref('');
const uploadDisplayName = computed(() => uploadedFileName.value || 'No file chosen');

// URL loading
const documentUrl = ref('');
const isLoadingUrl = ref(false);

const handleLoadFromUrl = async () => {
  const url = documentUrl.value.trim();
  if (!url) return;

  isLoadingUrl.value = true;
  try {
    const file = await getFileObject(url, 'document.docx', DOCX);
    await handleNewFile(file);
  } catch (err) {
    console.error('Failed to load from URL:', err);
    const message = err instanceof Error ? err.message : String(err);
    alert(`Failed to load document: ${message}`);
  } finally {
    isLoadingUrl.value = false;
  }
};

const user = {
  name: testUserName,
  email: testUserEmail,
};

const getSuperdocRoot = () => document.getElementById('superdoc');

const removeWordOverlay = () => {
  const root = getSuperdocRoot();
  if (!root) return;
  root.querySelectorAll('.dev-word-overlay-image').forEach((node) => node.remove());
  root.querySelectorAll('.dev-word-overlay-page-host').forEach((node) => {
    node.classList.remove('dev-word-overlay-page-host');
  });
};

const applyWordOverlay = () => {
  const root = getSuperdocRoot();
  if (!root) return;

  if (!useWordOverlay.value || !wordOverlayAvailable.value) {
    removeWordOverlay();
    return;
  }

  const pageNodes = Array.from(root.querySelectorAll('.superdoc-page[data-page-index]'));
  pageNodes.forEach((pageNode, index) => {
    const pageIndexRaw = Number.parseInt(pageNode.getAttribute('data-page-index') ?? String(index), 10);
    const pageNumber = Number.isFinite(pageIndexRaw) ? pageIndexRaw + 1 : index + 1;
    const screenshotUrl = generatedWordScreenshots.value[pageNumber - 1];
    let overlayNode = pageNode.querySelector(':scope > .dev-word-overlay-image');

    if (!screenshotUrl) {
      overlayNode?.remove();
      pageNode.classList.remove('dev-word-overlay-page-host');
      return;
    }

    if (!overlayNode) {
      overlayNode = document.createElement('img');
      overlayNode.className = 'dev-word-overlay-image';
      overlayNode.setAttribute('alt', `Word screenshot page ${pageNumber}`);
      overlayNode.setAttribute('draggable', 'false');
      pageNode.appendChild(overlayNode);
    }

    pageNode.classList.add('dev-word-overlay-page-host');
    overlayNode.setAttribute('src', screenshotUrl);
    overlayNode.style.opacity = String(wordOverlayOpacity.value);
    overlayNode.style.mixBlendMode = wordOverlayBlendMode.value;
  });
};

const scheduleWordOverlayApply = () => {
  nextTick(() => {
    requestAnimationFrame(() => {
      applyWordOverlay();
    });
  });
};

const detachWordOverlayListener = () => {
  if (typeof wordOverlayLayoutUnsubscribe === 'function') {
    wordOverlayLayoutUnsubscribe();
  }
  wordOverlayLayoutUnsubscribe = null;
};

const bindWordOverlayListener = (editor) => {
  detachWordOverlayListener();
  const presentationEditor = editor?.presentationEditor;
  if (presentationEditor?.onLayoutUpdated) {
    wordOverlayLayoutUnsubscribe = presentationEditor.onLayoutUpdated(() => {
      scheduleWordOverlayApply();
    });
  }
  scheduleWordOverlayApply();
};

const clearGeneratedWordBaseline = () => {
  generatedWordScreenshots.value = [];
  wordBaselineStatus.value = '';
  wordBaselineError.value = '';
  scheduleWordOverlayApply();
};

const commentPermissionResolver = ({ permission, comment, defaultDecision, currentUser }) => {
  if (!comment) return defaultDecision;

  // Example: hide tracked-change buttons for matching author email domain
  if (
    comment.trackedChange &&
    comment.creatorEmail?.endsWith('@example.com') &&
    ['RESOLVE_OWN', 'REJECT_OWN'].includes(permission)
  ) {
    return false;
  }

  // Allow default behaviour for everything else
  return defaultDecision;
};

const handleNewFile = async (file) => {
  clearGeneratedWordBaseline();
  uploadedFileName.value = file?.name || '';
  // Generate a file url
  const url = URL.createObjectURL(file);

  // Detect file type by extension
  const fileExtension = file.name.split('.').pop()?.toLowerCase();
  const isMarkdown = fileExtension === 'md';
  const isHtml = fileExtension === 'html' || fileExtension === 'htm';

  if (isMarkdown || isHtml) {
    // For text-based files, read the content and use a blank DOCX as base
    const content = await readFileAsText(file);
    currentFile.value = await getFileObject(BlankDOCX, 'blank.docx', DOCX);

    // Store the content to be passed to SuperDoc
    if (isMarkdown) {
      currentFile.value.markdownContent = content;
    } else if (isHtml) {
      currentFile.value.htmlContent = content;
    }
  } else {
    // For binary files (DOCX, PDF), use as-is
    currentFile.value = await getFileObject(url, file.name, file.type);
  }

  // In collab mode, use replaceFile() on the existing editor instead of
  // destroying and recreating SuperDoc. This avoids the Y.js race condition
  // where empty room state overwrites the DOCX content during reinit.
  if (useCollaboration && activeEditor.value && !isMarkdown && !isHtml) {
    try {
      await activeEditor.value.replaceFile(currentFile.value);
      console.log('[collab] Replaced file via editor.replaceFile()');
    } catch (err) {
      console.error('[collab] replaceFile failed, falling back to full reinit:', err);
      nextTick(() => init());
    }
  } else {
    nextTick(() => init());
  }

  sidebarInstanceKey.value += 1;
};

/**
 * Read a file as text content
 * @param {File} file - The file to read
 * @returns {Promise<string>} The file content as text
 */
const readFileAsText = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(e);
    reader.readAsText(file);
  });
};

const init = async () => {
  // If the dev shell re-initializes (e.g. on file upload), tear down the previous instance first.
  detachWordOverlayListener();
  removeWordOverlay();
  superdoc.value?.destroy?.();
  superdoc.value = null;
  activeEditor.value = null;

  let testId = 'document-123';

  // eslint-disable-next-line no-unused-vars
  const testDocumentId = 'doc123';

  // Prepare document config only if a file was uploaded
  // If no file, SuperDoc will automatically create a blank document
  let documentConfig = null;
  if (currentFile.value) {
    documentConfig = {
      data: currentFile.value,
      id: testId,
    };

    // Add markdown/HTML content if present
    if (currentFile.value.markdownContent) {
      documentConfig.markdown = currentFile.value.markdownContent;
    }
    if (currentFile.value.htmlContent) {
      documentConfig.html = currentFile.value.htmlContent;
    }
  }

  const config = {
    superdocId: 'superdoc-dev',
    selector: '#superdoc',
    toolbar: 'toolbar',
    toolbarGroups: ['center'],
    role: userRole,
    documentMode: 'editing',
    licenseKey: 'public_license_key_superdocinternal_ad7035140c4b',
    telemetry: {
      enabled: true,
      metadata: {
        source: 'superdoc-dev',
      },
    },
    comments: {
      visible: true,
    },
    trackChanges: {
      visible: true,
    },
    toolbarGroups: ['left', 'center', 'right'],
    pagination: useLayoutEngine.value && !useWebLayout.value,
    viewOptions: { layout: useWebLayout.value ? 'web' : 'print' },
    // Web layout mode requires Layout Engine to be OFF (uses ProseMirror's native rendering)
    useLayoutEngine: useLayoutEngine.value && !useWebLayout.value,
    rulers: true,
    rulerContainer: '#ruler-container',
    annotations: true,
    isInternal,
    // disableContextMenu: true,
    // format: 'docx',
    // html: '<p>Hello world</p>',
    // isDev: true,
    user,
    title: 'Test document',
    users: [
      { name: 'Nick Bernal', email: 'nick@harbourshare.com', access: 'internal' },
      { name: 'Eric Doversberger', email: 'eric@harbourshare.com', access: 'external' },
    ],
    // Only pass document config if a file was uploaded, otherwise SuperDoc creates blank
    ...(documentConfig ? { document: documentConfig } : {}),
    // documents: [
    //   {
    //     data: currentFile.value,
    //     id: testId,
    //   },
    // ],
    // cspNonce: 'testnonce123',
    modules: {
      comments: {
        // comments: sampleComments,
        // overflow: true,
        // selector: 'comments-panel',
        // useInternalExternalComments: true,
        // suppressInternalExternal: true,
        permissionResolver: commentPermissionResolver,
      },
      toolbar: {
        selector: 'toolbar',
        toolbarGroups: ['left', 'center', 'right'],
        // groups: {
        //   center: ['bold'],
        //   right: ['documentMode']
        // },
        // fonts: null,
        // hideButtons: false,
        // responsiveToContainer: true,
        excludeItems: [], // ['italic', 'bold'],
        // texts: {},
      },
      // Test custom context menu configuration
      contextMenu: {
        // includeDefaultItems: true, // Include default items
        // customItems: [
        //   {
        //     id: 'custom-section',
        //     items: [
        //       {
        //         id: 'show-context',
        //         label: 'Show Context',
        //         showWhen: (context) => context.trigger === 'click',
        //         render: (context) => {
        //           const container = document.createElement('div');
        //           container.style.display = 'flex';
        //           container.style.alignItems = 'center';
        //           container.innerHTML = `
        //             <span style="margin-right: 8px;">🔍</span>
        //             <span>Show Context</span>
        //           `;
        //           return container;
        //         },
        //         action: (editor, context) => {
        //           console.log('context', context);
        //         }
        //       },
        //       {
        //         id:'delete table',
        //         label: 'Delete Table',
        //         render: (context) => {
        //           const container = document.createElement('div');
        //           container.style.display = 'flex';
        //           container.style.alignItems = 'center';
        //           container.innerHTML = `
        //             <span style="margin-right: 8px;">🗑️</span>
        //             <span>Delete Table</span>
        //           `;
        //           return container;
        //         },
        //         action: (editor) => {
        //           editor.commands.deleteTable();
        //         },
        //         showWhen: (context) => context.isInTable
        //       },
        //       {
        //         id: 'highlight-text',
        //         label: 'Highlight Selection',
        //         showWhen: (context) => ['slash', 'click'].includes(context.trigger),
        //         render: (context) => {
        //           const container = document.createElement('div');
        //           container.style.display = 'flex';
        //           container.style.alignItems = 'center';
        //           container.innerHTML = `
        //             <span style="margin-right: 8px; color: #ffa500;">✨</span>
        //             <span>Highlight "${context.selectedText || 'text'}"</span>
        //           `;
        //           return container;
        //         },
        //         action: (editor) => {
        //           editor.commands.setHighlight('#ffff00');
        //         },
        //         showWhen: (context) => context.hasSelection
        //       },
        //       {
        //         id: 'insert-emoji',
        //         label: 'Insert Emoji',
        //         showWhen: (context) => (context.trigger === 'click' || context.trigger === 'slash') && context.hasSelection,
        //         render: (context) => {
        //           const container = document.createElement('div');
        //           container.style.display = 'flex';
        //           container.style.alignItems = 'center';
        //           container.innerHTML = `
        //             <span style="margin-right: 8px;">😀</span>
        //             <span>Insert Emoji</span>
        //           `;
        //           return container;
        //         },
        //         action: (editor) => {
        //           editor.commands.insertContent('¯\\_(ツ)_/¯');
        //         }
        //       },
        //     ]
        //   }
        // ],
        // // Alternative: use menuProvider function
        // // @todo: decide if we want to expose this in the documentation or not for simplicity?
        // menuProvider: (context, defaultSections) => {
        //   return [
        //     ...defaultSections,
        //     {
        //       id: 'dynamic-section',
        //       items: [
        //         {
        //           id: 'dynamic-item',
        //           label: `Custom for ${context.documentMode}`,
        //           showWhen: (context) => ['slash', 'click'].includes(context.trigger),
        //           action: (editor) => {
        //             editor.commands.insertContent(`Mode: ${context.documentMode} `);
        //           }
        //         }
        //       ]
        //     }
        //   ];
        // }
      },
      // 'hrbr-fields': {},

      // Collaboration - enabled via ?collab=1 URL param
      // Run `pnpm run collab-server` first, then open http://localhost:5173?collab=1
      ...(useCollaboration && ydocRef.value && providerRef.value
        ? {
            collaboration: {
              ydoc: ydocRef.value,
              provider: providerRef.value,
            },
          }
        : {}),
      ai: {
        // Provide your Harbour API key here for direct endpoint access
        // apiKey: 'test',
        // Optional: Provide a custom endpoint for AI services
        // endpoint: 'https://sd-dev-express-gateway-i6xtm.ondigitalocean.app/insights',
      },
      pdf: {
        pdfLib: pdfjsLib,
        setWorker: false,
        // workerSrc: getWorkerSrcFromCDN(pdfjsLib.version),
        // textLayer: true,
        // outputScale: 1.5,
      },
      // whiteboard: {
      //   enabled: true,
      // },
    },
    onEditorCreate,
    onContentError,
    // handleImageUpload: async (file) => url,
    // Override icons.
    toolbarIcons: {},
    onCommentsUpdate,
    onCommentsListChange: ({ isRendered }) => {
      isCommentsListOpen.value = isRendered;
    },
  };

  superdoc.value = new SuperDoc(config);
  superdoc.value?.on('ready', () => {
    superdoc.value.addCommentsList(commentsPanel.value);
  });
  superdoc.value?.on('exception', (error) => {
    console.error('SuperDoc exception:', error);
  });

  window.superdoc = superdoc.value;

  // const ydoc = superdoc.value.ydoc;
  // const metaMap = ydoc.getMap('meta');
  // metaMap.observe((event) => {
  //   const { keysChanged } = event;
  //   keysChanged.forEach((key) => {
  //     if (key === 'title') {
  //       title.value = metaMap.get('title');
  //     }
  //   });
  // });
};

const onCommentsUpdate = () => {};

const onContentError = ({ editor, error, documentId, file }) => {
  console.debug('Content error on', documentId, error);
};

const exportHTML = async (commentsType) => {
  console.debug('Exporting HTML', { commentsType });

  // Get HTML content from SuperDoc
  const htmlArray = superdoc.value.getHTML();
  const html = htmlArray.join('');

  // Create a Blob from the HTML
  const blob = new Blob([html], { type: 'text/html' });

  // Create a download link and trigger the download
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${title.value || 'document'}.html`;

  // Trigger the download
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Clean up the URL
  URL.revokeObjectURL(url);

  console.debug('HTML exported successfully');
};

const exportDocx = async (commentsType) => {
  console.debug('Exporting docx', { commentsType });
  await superdoc.value.export({ commentsType });
};

const exportDocxBlob = async () => {
  const blob = await superdoc.value.export({ commentsType: 'external', triggerDownload: false });
  console.debug(blob);
};

const blobToBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Unable to encode DOCX export'));
        return;
      }

      const commaIndex = result.indexOf(',');
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => {
      reject(reader.error || new Error('Failed to read DOCX export blob'));
    };
    reader.readAsDataURL(blob);
  });

const getWordBaselineFileName = () => {
  const source = uploadedFileName.value || currentFile.value?.name || title.value || 'document';
  const trimmedSource = String(source).trim() || 'document';
  const withoutExtension = trimmedSource.replace(/\.[^.]+$/, '') || 'document';
  return `${withoutExtension}.docx`;
};

const generateWordBaseline = async () => {
  if (!superdoc.value) {
    wordBaselineError.value = 'SuperDoc is not ready yet.';
    return;
  }

  isGeneratingWordBaseline.value = true;
  wordBaselineError.value = '';
  wordBaselineStatus.value = 'Exporting current document...';

  try {
    const exportBlob = await superdoc.value.export({
      commentsType: 'external',
      triggerDownload: false,
    });

    if (!(exportBlob instanceof Blob)) {
      throw new Error('SuperDoc export did not return a DOCX blob');
    }

    const response = await fetch(`${wordBaselineServiceUrl}/api/word-baseline`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileName: getWordBaselineFileName(),
        docxBase64: await blobToBase64(exportBlob),
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || `Word reference request failed (${response.status})`);
    }

    if (!Array.isArray(payload?.pages) || payload.pages.length === 0) {
      throw new Error('Word reference request completed but returned no page images');
    }

    generatedWordScreenshots.value = payload.pages;
    useWordOverlay.value = true;
    wordBaselineStatus.value = `Generated ${payload.pages.length} Word reference page(s).`;
    scheduleWordOverlayApply();
  } catch (error) {
    wordBaselineStatus.value = '';
    wordBaselineError.value = error instanceof Error ? error.message : String(error);
    console.error('[SuperDoc Dev] Failed to generate Word reference:', error);
  } finally {
    isGeneratingWordBaseline.value = false;
  }
};

const toggleWordOverlay = () => {
  useWordOverlay.value = !useWordOverlay.value;
};

const setWordOverlayOpacity = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return;
  wordOverlayOpacity.value = clampOpacity(numericValue);
};

const setWordOverlayBlendMode = (value) => {
  wordOverlayBlendMode.value = String(value || 'difference');
};

const downloadBlob = (blob, fileName) => {
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const getActiveDocumentEntry = () => {
  const docsSource = superdoc.value?.superdocStore?.documents;
  const documents = Array.isArray(docsSource) ? docsSource : docsSource?.value;
  if (!documents?.length) return null;

  const activeDocId = activeEditor.value?.options?.documentId;
  if (activeDocId) {
    const activeDoc = documents.find((doc) => doc.id === activeDocId);
    if (activeDoc) return activeDoc;
  }

  return documents[0] ?? null;
};

const onEditorCreate = ({ editor }) => {
  activeEditor.value = editor;
  window.editor = editor;
  bindWordOverlayListener(editor);

  editor.on('fieldAnnotationClicked', (params) => {
    console.log('fieldAnnotationClicked', { params });
  });

  editor.on('fieldAnnotationSelected', (params) => {
    console.log('fieldAnnotationSelected', { params });
  });

  editor.on('fieldAnnotationDoubleClicked', (params) => {
    console.log('fieldAnnotationDoubleClicked', { params });
  });
};

watch(
  [useWordOverlay, wordOverlayOpacity, wordOverlayBlendMode, generatedWordScreenshots, useLayoutEngine, useWebLayout],
  () => {
    scheduleWordOverlayApply();
  },
);

const handleTitleChange = (e) => {
  title.value = e.target.innerText;

  const ydoc = superdoc.value.ydoc;
  const metaMap = ydoc.getMap('meta');
  metaMap.set('title', title.value);
  console.debug('Title changed', metaMap.toJSON());
};

const isCommentsListOpen = ref(false);
const toggleCommentsPanel = () => {
  if (isCommentsListOpen.value) {
    superdoc.value?.removeCommentsList();
  } else {
    superdoc.value?.addCommentsList(commentsPanel.value);
  }
};

onMounted(async () => {
  // Initialize collaboration if enabled via ?collab=1
  if (useCollaboration) {
    const ydoc = new Y.Doc();
    const provider = new HocuspocusProvider({
      url: 'ws://localhost:3050',
      name: urlParams.get('room') || 'superdoc-dev-room',
      document: ydoc,
    });

    ydocRef.value = ydoc;
    providerRef.value = provider;

    // Wait for sync before loading document
    await new Promise((resolve) => {
      provider.on('synced', () => {
        collabReady.value = true;
        resolve();
      });
      // Fallback timeout in case sync doesn't fire
      setTimeout(() => {
        collabReady.value = true;
        resolve();
      }, 3000);
    });

    console.log('[collab] Provider synced, initializing SuperDoc');
  }

  // Initialize SuperDoc - it will automatically create a blank document
  init();
});

onBeforeUnmount(() => {
  detachWordOverlayListener();
  removeWordOverlay();

  // Ensure SuperDoc tears down global listeners (e.g., PresentationEditor input bridge)
  superdoc.value?.destroy?.();
  superdoc.value = null;
  activeEditor.value = null;

  // Cleanup collaboration provider
  if (providerRef.value) {
    providerRef.value.destroy();
    providerRef.value = null;
  }
  ydocRef.value = null;
});

const toggleLayoutEngine = () => {
  const nextValue = !useLayoutEngine.value;
  const url = new URL(window.location.href);
  url.searchParams.set('layout', nextValue ? '1' : '0');
  window.location.href = url.toString();
};

const toggleViewLayout = () => {
  const nextValue = !useWebLayout.value;
  const url = new URL(window.location.href);
  url.searchParams.set('view', nextValue ? 'web' : 'print');
  window.location.href = url.toString();
};

const showExportMenu = ref(false);
const closeExportMenu = () => {
  showExportMenu.value = false;
};

const sidebarOptions = [
  {
    id: 'off',
    label: 'Off',
    component: null,
  },
  {
    id: 'search',
    label: 'Search',
    component: SidebarSearch,
  },
  {
    id: 'fields',
    label: 'Field Annotations',
    component: SidebarFieldAnnotations,
  },
  {
    id: 'layout',
    label: 'Layout',
    component: SidebarLayout,
  },
];
const activeSidebarId = ref('layout');
const activeSidebar = computed(
  () => sidebarOptions.find((option) => option.id === activeSidebarId.value) ?? sidebarOptions[0],
);
const activeSidebarComponent = computed(() => activeSidebar.value?.component ?? null);
const activeSidebarLabel = computed(() => activeSidebar.value?.label ?? 'None');
const activeSidebarProps = computed(() => {
  if (activeSidebarId.value !== 'layout') return {};
  return {
    useWordOverlay: useWordOverlay.value,
    isGeneratingWordBaseline: isGeneratingWordBaseline.value,
    generatedCount: generatedWordScreenshots.value.length,
    wordOverlayOpacity: wordOverlayOpacity.value,
    wordOverlayOpacityLabel: wordOverlayOpacityLabel.value,
    wordOverlayBlendMode: wordOverlayBlendMode.value,
    wordBaselineStatus: wordBaselineStatus.value,
    wordBaselineError: wordBaselineError.value,
    wordOverlayAvailable: wordOverlayAvailable.value,
  };
});
const showSidebarMenu = ref(false);
const closeSidebarMenu = () => {
  showSidebarMenu.value = false;
};
const setActiveSidebar = (id) => {
  activeSidebarId.value = id;
  closeSidebarMenu();
};

// Scroll test mode - adds content above editor to make page scrollable (for testing focus scroll bugs)
const scrollTestMode = ref(urlParams.get('scrolltest') === '1');
const toggleScrollTestMode = () => {
  const url = new URL(window.location.href);
  url.searchParams.set('scrolltest', scrollTestMode.value ? '0' : '1');
  window.location.href = url.toString();
};

// Debug: Track all scroll changes when in scroll test mode
if (scrollTestMode.value) {
  let lastScrollY = 0;
  window.addEventListener('scroll', () => {
    if (Math.abs(window.scrollY - lastScrollY) > 10) {
      console.log('[SCROLL-DEBUG] Scroll changed:', lastScrollY, '→', window.scrollY);
      console.trace('[SCROLL-DEBUG] Stack trace:');
      lastScrollY = window.scrollY;
    }
  });

  // Also intercept scrollTo calls
  const originalScrollTo = window.scrollTo.bind(window);
  window.scrollTo = function (...args) {
    console.log('[SCROLL-DEBUG] scrollTo called:', args);
    console.trace('[SCROLL-DEBUG] scrollTo stack:');
    return originalScrollTo(...args);
  };
}
</script>

<template>
  <div class="dev-app" :class="{ 'dev-app--scroll-test': scrollTestMode }">
    <div class="dev-app__layout">
      <div class="dev-app__header">
        <div class="dev-app__brand">
          <div class="dev-app__logo">
            <img :src="superdocLogo" alt="SuperDoc logo" />
          </div>
          <div class="dev-app__brand-meta">
            <div class="dev-app__meta-row">
              <span class="dev-app__pill">SUPERDOC LABS</span>
              <span class="badge">Layout Engine: {{ useLayoutEngine && !useWebLayout ? 'ON' : 'OFF' }}</span>
              <span v-if="useWebLayout" class="badge">Web Layout: ON</span>
              <span v-if="scrollTestMode" class="badge badge--warning">Scroll Test: ON</span>
              <span v-if="useCollaboration" class="badge badge--collab">Collab: ON</span>
            </div>
            <h2 class="dev-app__title">SuperDoc Dev</h2>
            <div class="dev-app__header-layout-toggle">
              <div class="dev-app__upload-control">
                <div class="dev-app__upload-button">
                  <span class="dev-app__upload-btn">Upload file</span>
                  <BasicUpload class="dev-app__upload-input" @file-change="handleNewFile" />
                </div>
                <span class="dev-app__upload-filename">{{ uploadDisplayName }}</span>
              </div>
              <div class="dev-app__url-control">
                <input
                  v-model="documentUrl"
                  type="text"
                  class="dev-app__url-input"
                  placeholder="Paste document URL..."
                  @keydown.enter="handleLoadFromUrl"
                />
                <button
                  class="dev-app__url-btn"
                  :disabled="isLoadingUrl || !documentUrl.trim()"
                  @click="handleLoadFromUrl"
                >
                  {{ isLoadingUrl ? 'Loading...' : 'Load URL' }}
                </button>
              </div>
            </div>
          </div>
        </div>
        <div class="dev-app__header-actions">
          <div class="dev-app__header-buttons">
            <div class="dev-app__dropdown" @mouseleave="closeSidebarMenu">
              <button
                class="dev-app__header-export-btn dev-app__dropdown-trigger"
                :class="{ 'is-open': showSidebarMenu }"
                @click="showSidebarMenu = !showSidebarMenu"
              >
                <span>Sidebar: {{ activeSidebarLabel }}</span>
                <span class="caret">▾</span>
              </button>
              <div v-if="showSidebarMenu" class="dev-app__dropdown-menu">
                <button
                  v-for="option in sidebarOptions"
                  :key="option.id"
                  class="dev-app__dropdown-item"
                  @click="setActiveSidebar(option.id)"
                >
                  {{ option.label }}
                </button>
              </div>
            </div>
            <div class="dev-app__dropdown" @mouseleave="closeExportMenu">
              <button
                class="dev-app__header-export-btn dev-app__dropdown-trigger"
                :class="{ 'is-open': showExportMenu }"
                @click="showExportMenu = !showExportMenu"
              >
                <span>Export</span>
                <span class="caret">▾</span>
              </button>
              <div v-if="showExportMenu" class="dev-app__dropdown-menu">
                <button
                  class="dev-app__dropdown-item"
                  @click="
                    exportHTML();
                    closeExportMenu();
                  "
                >
                  Export HTML
                </button>
                <button
                  class="dev-app__dropdown-item"
                  @click="
                    exportDocx();
                    closeExportMenu();
                  "
                >
                  Export Docx
                </button>
                <button
                  class="dev-app__dropdown-item"
                  @click="
                    exportDocx('clean');
                    closeExportMenu();
                  "
                >
                  Export clean Docx
                </button>
                <button
                  class="dev-app__dropdown-item"
                  @click="
                    exportDocx('external');
                    closeExportMenu();
                  "
                >
                  Export external Docx
                </button>
                <button
                  class="dev-app__dropdown-item"
                  @click="
                    exportDocxBlob();
                    closeExportMenu();
                  "
                >
                  Export Docx Blob
                </button>
              </div>
            </div>
            <button class="dev-app__header-export-btn" @click="toggleLayoutEngine">
              Turn Layout Engine {{ useLayoutEngine ? 'off' : 'on' }} (reloads)
            </button>
            <button class="dev-app__header-export-btn" @click="toggleViewLayout">
              Turn Web Layout {{ useWebLayout ? 'off' : 'on' }} (reloads)
            </button>
          </div>
        </div>
      </div>

      <!-- Spacer to push content down and make page scrollable (for testing focus scroll bugs) -->
      <div v-if="scrollTestMode" class="dev-app__scroll-test-spacer">
        <div class="dev-app__scroll-test-notice">
          <strong>⚠️ SCROLL TEST MODE</strong>
          <p>
            Scroll down to see the editor. This mode tests that clicking/typing in the editor doesn't cause page jumps.
          </p>
          <p>If clicking or typing causes the page to scroll back up here, the bug is present.</p>
        </div>
      </div>

      <div class="dev-app__toolbar-ruler-container">
        <div id="toolbar" class="sd-toolbar"></div>
        <div id="ruler-container" class="sd-ruler"></div>
      </div>

      <div class="dev-app__main">
        <div class="dev-app__view">
          <div class="dev-app__content">
            <div class="dev-app__content-container" :class="{ 'dev-app__content-container--web-layout': useWebLayout }">
              <div id="superdoc"></div>
            </div>
          </div>
        </div>
      </div>
      <div v-if="activeSidebarComponent" class="dev-app__sidebar">
        <div class="dev-app__sidebar-content">
          <component
            :is="activeSidebarComponent"
            :key="`${activeSidebarId}-${sidebarInstanceKey}`"
            v-bind="activeSidebarProps"
            @close="setActiveSidebar('off')"
            @toggle-overlay="toggleWordOverlay"
            @generate-baseline="generateWordBaseline"
            @clear-generated-baseline="clearGeneratedWordBaseline"
            @update:word-overlay-opacity="setWordOverlayOpacity"
            @update:word-overlay-blend-mode="setWordOverlayBlendMode"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style>
.dev-app__toolbar-ruler-container {
  position: sticky;
  top: 0;
  z-index: 100;
  background: white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.sd-toolbar {
  width: 100%;
  background: white;
  position: relative;
  z-index: 1;
}

.sd-ruler {
  display: flex;
  justify-content: center;
  background: #f5f5f5;
  border-top: 1px solid #e0e0e0;
  padding: 0;
  min-height: 25px;
}

/* Hide the ruler container when no ruler is rendered inside it */
.sd-ruler:not(:has(.ruler)) {
  display: none;
}

.comments-panel {
  width: 320px;
}

@media screen and (max-width: 1024px) {
  .superdoc {
    max-width: calc(100vw - 10px);
  }
}
</style>

<style scoped>
.temp-comment {
  margin: 5px;
  border: 1px solid black;
  display: flex;
  flex-direction: column;
}

.comments-panel {
  position: absolute;
  right: 0;
  height: 100%;
  background-color: #fafafa;
  z-index: 100;
}

.dev-app {
  background-color: #b9bfce;
  --header-height: 154px;
  --toolbar-height: 39px;

  width: 100%;
  height: 100vh;
}

.dev-app__layout {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100vh;
  position: relative;
}

.dev-app__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 24px;
  background-color: #0f172a;
  color: #e2e8f0;
  padding: 24px;
  box-sizing: border-box;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  position: relative;
  z-index: 120;
}

.dev-app__header::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 12px;
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0));
  pointer-events: none;
}

.dev-app__brand {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1 1 auto;
}

.dev-app__logo {
  width: 64px;
  height: 64px;
  border-radius: 14px;
  overflow: hidden;
  background: radial-gradient(circle at 30% 30%, #38bdf8, #6366f1);
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.dev-app__logo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 14px;
}

.dev-app__brand-meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dev-app__pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 12px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.18);
  color: #cbd5e1;
  font-weight: 600;
  letter-spacing: 0.08em;
  font-size: 10px;
  width: fit-content;
}

.dev-app__meta-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.dev-app__title {
  margin: 0;
  color: #f8fafc;
  font-size: 22px;
  line-height: 1.2;
}

.dev-app__subtitle {
  margin: 0;
  color: #cbd5e1;
  font-size: 14px;
}

.dev-app__header-layout-toggle {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.badge {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  background: rgba(59, 130, 246, 0.15);
  border-radius: 10px;
  font-weight: 700;
  color: #bfdbfe;
  letter-spacing: 0.02em;
  font-size: 12px;
  pointer-events: none;
}

.badge--warning {
  background: rgba(251, 191, 36, 0.2);
  color: #fcd34d;
}

.badge--collab {
  background: rgba(34, 197, 94, 0.2);
  color: #86efac;
}

.dev-app__upload-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 6px;
}

.dev-app__upload-label {
  color: #cbd5e1;
  font-size: 13px;
}

.dev-app__upload-control {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.dev-app__upload-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.dev-app__upload-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(59, 130, 246, 0.2);
  color: #e2e8f0;
  border: 1px solid rgba(59, 130, 246, 0.35);
  padding: 8px 14px;
  border-radius: 10px;
  font-weight: 700;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.1s ease;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.4);
}

.dev-app__upload-btn:hover {
  background: rgba(59, 130, 246, 0.3);
  border-color: rgba(59, 130, 246, 0.5);
  box-shadow: 0 10px 22px rgba(15, 23, 42, 0.5);
}

.dev-app__upload-input {
  position: absolute;
  inset: 0;
}

:deep(.dev-app__upload-input input[type='file']) {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
  appearance: none;
  border: none;
  background: transparent;
  color: transparent;
  z-index: 2;
}

.dev-app__upload-hint {
  color: #94a3b8;
  font-size: 12px;
}

.dev-app__url-control {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.dev-app__url-input {
  flex: 1;
  min-width: 280px;
  padding: 8px 12px;
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.6);
  color: #e2e8f0;
  font-size: 13px;
}

.dev-app__url-input::placeholder {
  color: #64748b;
}

.dev-app__url-input:focus {
  outline: none;
  border-color: rgba(59, 130, 246, 0.5);
  background: rgba(15, 23, 42, 0.8);
}

.dev-app__url-btn {
  padding: 8px 14px;
  border: 1px solid rgba(59, 130, 246, 0.35);
  border-radius: 8px;
  background: rgba(59, 130, 246, 0.2);
  color: #e2e8f0;
  font-weight: 600;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease;
  white-space: nowrap;
}

.dev-app__url-btn:hover:not(:disabled) {
  background: rgba(59, 130, 246, 0.3);
  border-color: rgba(59, 130, 246, 0.5);
}

.dev-app__url-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dev-app__header-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: flex-end;
}

.dev-app__header-upload {
  display: flex;
  align-items: center;
  gap: 10px;
}

.dev-app__upload-label {
  color: #cbd5e1;
  font-size: 14px;
}

.dev-app__header-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.dev-app__header-export-btn {
  background: rgba(148, 163, 184, 0.12);
  color: #e2e8f0;
  border: 1px solid rgba(148, 163, 184, 0.2);
  padding: 8px 12px;
  border-radius: 10px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.1s ease;
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.25);
}

.dev-app__header-export-btn:hover:not(:disabled) {
  background: rgba(148, 163, 184, 0.2);
  border-color: rgba(148, 163, 184, 0.35);
  box-shadow: 0 10px 22px rgba(0, 0, 0, 0.28);
}

.dev-app__header-export-btn:active:not(:disabled) {
  transform: translateY(1px);
  background: rgba(148, 163, 184, 0.28);
}

.dev-app__header-export-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  box-shadow: none;
}

.dev-app__dropdown {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.dev-app__dropdown-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.dev-app__dropdown-trigger .caret {
  display: inline-block;
  transition: transform 0.15s ease;
}

.dev-app__dropdown-trigger.is-open .caret {
  transform: rotate(180deg);
}

.dev-app__dropdown-menu {
  position: absolute;
  top: 105%;
  right: 0;
  min-width: 180px;
  background: #0b1221;
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
  padding: 6px;
  z-index: 200;
  display: grid;
  gap: 4px;
}

.dev-app__dropdown-item {
  background: transparent;
  color: #e2e8f0;
  border: 1px solid transparent;
  padding: 8px 10px;
  border-radius: 8px;
  text-align: left;
  font-weight: 600;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease;
}

.dev-app__dropdown-item:hover {
  background: rgba(148, 163, 184, 0.12);
  border-color: rgba(148, 163, 184, 0.25);
}

.dev-app__main {
  display: flex;
  justify-content: center;
  overflow: auto;
  /* Test: creates a containing block for position:fixed elements (like context menu) */
  backdrop-filter: blur(0.5px);
}

.dev-app__sidebar {
  position: absolute;
  top: 0;
  right: 0;
  height: 100vh;
  width: 350px;
  max-width: 350px;
  background: #f8fafc;
  border-left: 1px solid rgba(15, 23, 42, 0.12);
  box-shadow: -12px 0 28px rgba(15, 23, 42, 0.2);
  z-index: 200;
  display: flex;
  flex-direction: column;
}

.dev-app__sidebar-content {
  flex: 1 1 auto;
  overflow: auto;
  padding: 16px;
}

.dev-app__view {
  display: flex;
  padding-top: 20px;
}

.dev-app__content {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
}

.dev-app__content-container {
  width: auto;
}

/* Web layout mode: dev app container styling */
.dev-app__content-container--web-layout {
  width: 100%;
  max-width: 100%;
  padding: 0 16px;
  box-sizing: border-box;
  overflow-x: hidden;
}

/* Web layout mode: prevent centering to allow full-width layout */
.dev-app__content:has(.dev-app__content-container--web-layout) {
  align-items: stretch;
}

.dev-app__view:has(.dev-app__content-container--web-layout) {
  width: 100%;
}

.dev-app__main:has(.dev-app__content-container--web-layout) {
  overflow-x: hidden;
}

:deep(.dev-word-overlay-page-host) {
  position: relative;
  overflow: hidden;
}

:deep(.dev-word-overlay-image) {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: fill;
  pointer-events: none;
  z-index: 120;
}

.dev-app__inputs-panel {
  display: grid;
  height: calc(100vh - var(--header-height) - var(--toolbar-height));
  background: #fff;
  border-right: 1px solid #dbdbdb;
}

.dev-app__inputs-panel-content {
  display: grid;
  overflow-y: auto;
  scrollbar-width: none;
}

/* Scroll Test Mode - makes page scrollable to test focus scroll bugs */
.dev-app--scroll-test {
  height: auto;
  min-height: 100vh;
}

.dev-app--scroll-test .dev-app__layout {
  height: auto;
  min-height: 100vh;
}

.dev-app--scroll-test .dev-app__main {
  overflow: visible;
}

.dev-app__scroll-test-spacer {
  height: 120vh;
  background: linear-gradient(180deg, #1e293b 0%, #334155 50%, #475569 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.dev-app__scroll-test-notice {
  background: rgba(251, 191, 36, 0.15);
  border: 2px solid rgba(251, 191, 36, 0.5);
  border-radius: 12px;
  padding: 24px 32px;
  max-width: 500px;
  text-align: center;
  color: #fcd34d;
}

.dev-app__scroll-test-notice strong {
  font-size: 18px;
  display: block;
  margin-bottom: 12px;
}

.dev-app__scroll-test-notice p {
  margin: 8px 0;
  font-size: 14px;
  line-height: 1.5;
  color: #fde68a;
}

/* Mobile responsive styles */
@media screen and (max-width: 768px) {
  .dev-app {
    --header-height: auto;
    overflow-x: hidden;
  }

  .dev-app__layout {
    overflow-x: hidden;
  }

  .dev-app__header {
    flex-direction: column;
    align-items: stretch;
    gap: 16px;
    padding: 16px;
  }

  .dev-app__brand {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .dev-app__logo {
    width: 48px;
    height: 48px;
  }

  .dev-app__title {
    font-size: 18px;
  }

  .dev-app__meta-row {
    flex-wrap: wrap;
    gap: 6px;
  }

  .dev-app__header-actions {
    align-items: stretch;
    width: 100%;
  }

  .dev-app__header-buttons {
    flex-direction: column;
    gap: 8px;
  }

  .dev-app__header-export-btn {
    width: 100%;
    text-align: center;
  }

  .dev-app__upload-control {
    flex-direction: column;
    align-items: stretch;
  }

  .dev-app__url-form {
    flex-direction: column;
  }

  .dev-app__url-input {
    width: 100%;
  }

  .dev-app__main {
    overflow-x: hidden;
  }

  .dev-app__view {
    padding-top: 10px;
    overflow-x: hidden;
  }
}
</style>
