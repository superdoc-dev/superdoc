import { defineStore } from 'pinia';
import { ref, reactive, computed } from 'vue';
import { useCommentsStore } from './comments-store';
import { getFileObject, DOCX, PDF } from '@superdoc/common';
import { normalizeDocumentEntry } from '@superdoc/core/helpers/file.js';
import useDocument from '@superdoc/composables/use-document';
import BlankDOCX from '@superdoc/common/data/blank.docx?url';

export const useSuperdocStore = defineStore('superdoc', () => {
  const currentConfig = ref(null);
  let exceptionHandler = null;
  const commentsStore = useCommentsStore();
  const documents = ref([]);
  const documentBounds = ref([]);
  const pages = reactive({});
  const documentUsers = ref([]);
  const activeZoom = ref(100);
  const isReady = ref(false);
  const isInternal = ref(false);

  const users = ref([]);

  const user = reactive({ name: null, email: null });
  const modules = reactive({});

  const activeSelection = ref(null);
  const selectionPosition = ref({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    source: null,
  });

  const reset = () => {
    documents.value = [];
    documentBounds.value = [];
    Object.assign(pages, {});
    documentUsers.value = [];
    isReady.value = false;
    user.name = null;
    user.email = null;
    Object.assign(modules, {});
    activeSelection.value = null;
  };

  const documentScroll = reactive({
    scrollTop: 0,
    scrollLeft: 0,
  });

  const setExceptionHandler = (handler) => {
    exceptionHandler = typeof handler === 'function' ? handler : null;
  };

  const emitException = (payload) => {
    const handler = exceptionHandler || currentConfig.value?.onException;
    if (typeof handler === 'function') handler(payload);
  };

  const init = async (config) => {
    reset();
    currentConfig.value = config;
    const { documents: configDocs, modules: configModules, user: configUser, users: configUsers } = config;

    documentUsers.value = configUsers || [];

    // Init current user
    Object.assign(user, configUser);

    // Set up module config
    Object.assign(modules, configModules);
    if (!Object.prototype.hasOwnProperty.call(modules, 'comments')) {
      modules.comments = {};
    }

    // For shorthand 'format' key, we can initialize a blank docx
    if (!configDocs?.length && !config.modules.collaboration) {
      const newDoc = await getFileObject(BlankDOCX, 'blank.docx', DOCX);
      const newDocConfig = {
        type: DOCX,
        data: newDoc,
        name: 'blank.docx',
        isNewFile: true,
      };

      if (config.html) newDocConfig.html = config.html;
      if (config.markdown) newDocConfig.markdown = config.markdown;
      configDocs.push(newDocConfig);
    }

    // Initialize documents
    await initializeDocuments(configDocs);
    isReady.value = true;
  };

  /**
   * Initialize the documents for this SuperDoc. Changes the store's documents array ref directly.
   * @param {Array[Object]} docsToProcess The documents to process from the config
   * @returns {Promise<void>}
   */
  const initializeDocuments = async (docsToProcess = []) => {
    if (!docsToProcess) return [];

    for (let doc of docsToProcess) {
      if (!doc) {
        emitException({
          error: new Error('Received empty document entry during initialization.'),
          stage: 'document-init',
          document: doc,
        });
        console.warn('[superdoc] Skipping empty document entry.');
        continue;
      }

      try {
        // Ensure the document object has data (ie: if loading from URL)
        let docWithData = await _initializeDocumentData(doc);

        if (!docWithData) {
          emitException({
            error: new Error('Document could not be initialized with the provided configuration.'),
            stage: 'document-init',
            document: doc,
          });
          console.warn('[superdoc] Skipping document due to invalid configuration:', doc);
          continue;
        }

        // Create composable and append to our documents
        const smartDoc = useDocument(docWithData, currentConfig.value);
        documents.value.push(smartDoc);
      } catch (e) {
        emitException({ error: e, stage: 'document-init', document: doc });
        console.warn('[superdoc] Error initializing document:', doc, 'with error:', e, 'Skipping document.');
      }
    }
  };

  /**
   * Convert a Blob to a File object when a filename is required
   * @param {Blob} blob The blob to convert
   * @param {string} name The filename to assign
   * @param {string} type The mime type
   * @returns {File} The file object
   */
  const _blobToFile = (blob, name, type) => {
    return new File([blob], name, { type });
  };

  /**
   * Initialize the document data by fetching the file if necessary
   * @param {Object} doc The document config
   * @returns {Promise<Object>} The document object with data
   */
  const _initializeDocumentData = async (doc) => {
    // Normalize any uploader-specific wrapper to a native File/Blob upfront
    doc = normalizeDocumentEntry(doc);
    if (currentConfig.value?.html) doc.html = currentConfig.value.html;

    // Use docx as default if no type provided
    if (!doc.data && doc.url && !doc.type) doc.type = DOCX;

    // If in collaboration mode, return the document as is
    if (currentConfig.value?.modules.collaboration && !doc.isNewFile) {
      return { ...doc, data: null, url: null };
    }

    // If we already have data (File/Blob), ensure it has the expected metadata
    if (doc.data instanceof File) {
      let fileName = doc.name;
      const extension = doc.type === DOCX ? '.docx' : doc.type === PDF ? '.pdf' : '.bin';
      if (!fileName) {
        fileName = `document${extension}`;
      } else if (!fileName.includes('.')) {
        fileName = `${fileName}${extension}`;
      }

      if (doc.data.name !== fileName) {
        const fileObject = _blobToFile(doc.data, fileName, doc.data.type || doc.type);
        return { ...doc, name: fileName, data: fileObject };
      }

      if (!doc.name) return { ...doc, name: fileName };

      return doc;
    }
    // If we have a Blob object, convert it to a File with appropriate name
    else if (doc.data instanceof Blob) {
      // Use provided name or generate a default name based on type
      let fileName = doc.name;
      if (!fileName) {
        const extension = doc.type === DOCX ? '.docx' : doc.type === PDF ? '.pdf' : '.bin';
        fileName = `document${extension}`;
      }
      const fileObject = _blobToFile(doc.data, fileName, doc.data.type || doc.type);
      return { ...doc, data: fileObject };
    }
    // If we have any other data object, return it as is (for backward compatibility)
    else if (doc.data) return doc;
    // If we have a URL, fetch the file and return it
    else if (doc.url && doc.type) {
      if (doc.type.toLowerCase() === 'docx') doc.type = DOCX;
      else if (doc.type.toLowerCase() === 'pdf') doc.type = PDF;
      try {
        const fileObject = await getFileObject(doc.url, doc.name || 'document', doc.type);
        return { ...doc, data: fileObject };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.debug('[SuperDoc] Failed to fetch document from URL:', message);
        throw err;
      }
    }
    // Invalid configuration
    return null;
  };

  const areDocumentsReady = computed(() => {
    for (let obj of documents.value.filter((doc) => doc.type === 'pdf')) {
      if (!obj.isReady) return false;
    }
    return true;
  });

  const getDocument = (documentId) => documents.value.find((doc) => doc.id === documentId);
  const getPageBounds = (documentId, page) => {
    const matchedPage = pages[documentId];
    if (!matchedPage) return;
    const pageInfo = matchedPage.find((p) => p.page == page);
    if (!pageInfo || !pageInfo.container) return;

    const containerBounds = pageInfo.container.getBoundingClientRect();
    const { height } = containerBounds;
    const totalHeight = height * (page - 1);
    return {
      top: totalHeight,
    };
  };

  const handlePageReady = (documentId, index, containerBounds) => {
    if (!pages[documentId]) pages[documentId] = [];
    pages[documentId].push({ page: index, containerBounds });

    const doc = getDocument(documentId);
    if (!doc) return;

    doc.pageContainers.push({
      page: index,
      containerBounds,
    });
  };

  return {
    commentsStore,
    documents,
    documentBounds,
    pages,
    documentUsers,
    users,
    activeZoom,
    documentScroll,
    isInternal,

    selectionPosition,
    activeSelection,

    isReady,

    user,
    modules,

    // Getters
    areDocumentsReady,

    // Actions
    init,
    setExceptionHandler,
    reset,
    handlePageReady,
    getDocument,
    getPageBounds,
  };
});
