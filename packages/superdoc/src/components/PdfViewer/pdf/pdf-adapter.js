// @ts-check
import { range } from '../helpers/range.js';

/**
 * @typedef {import('pdfjs-dist').PDFDocumentProxy} PDFDocumentProxy
 * @typedef {import('pdfjs-dist').PDFPageProxy} PDFPageProxy
 */

/**
 * @typedef {'pdfjs'} AdapterType
 */

/**
 * @typedef {Object} PDFConfig
 * @property {AdapterType} adapter
 * @property {any} [pdfLib]
 * @property {any} [pdfViewer]
 * @property {string} [workerSrc]
 * @property {boolean} [setWorker]
 * @property {0 | 1} [textLayerMode]
 */

/**
 * @typedef {Object} PDFJSConfig
 * @property {any} pdfLib
 * @property {any} pdfViewer
 * @property {string} [workerSrc]
 * @property {0 | 1} [textLayerMode]
 * @property {boolean} [setWorker]
 */

/**
 * @typedef {Object} RenderPagesOptions
 * @property {string} documentId
 * @property {PDFDocumentProxy} pdfDocument
 * @property {HTMLElement} viewerContainer
 * @property {function(string, ...any): void} [emit]
 */

/**
 * @typedef {Object} PageSize
 * @property {number} width
 * @property {number} height
 */

/**
 * @abstract
 */
class PDFAdapter {
  /**
   * @throws {Error}
   */
  constructor() {
    const proto = Object.getPrototypeOf(this);
    if (proto.constructor === PDFAdapter) {
      throw new Error('Abstract class should not be instanciated');
    }
  }
}

export class PDFJSAdapter extends PDFAdapter {
  /**
   * @param {PDFJSConfig} config
   */
  constructor(config) {
    super();
    this.pdfLib = config.pdfLib;
    this.pdfViewer = config.pdfViewer;
    this.workerSrc = config.workerSrc;
    this.textLayerMode = config.textLayerMode ?? 0;
    if (config.setWorker) {
      if (this.workerSrc) {
        this.pdfLib.GlobalWorkerOptions.workerSrc = config.workerSrc;
      } else {
        // Fallback to CDN version.
        this.pdfLib.GlobalWorkerOptions.workerSrc = getWorkerSrcFromCDN(this.pdfLib.version);
      }
    }
    /** @type {any[]} */
    this.pdfPageViews = [];
  }

  /**
   * @param {string | ArrayBuffer | Uint8Array} file
   * @returns {Promise<PDFDocumentProxy>}
   */
  async getDocument(file) {
    const loadingTask = this.pdfLib.getDocument(file);
    const document = await loadingTask.promise;
    return document;
  }

  /**
   * @param {RenderPagesOptions} options
   * @returns {Promise<void>}
   */
  async renderPages({ documentId, pdfDocument, viewerContainer, emit = () => {} }) {
    try {
      this.pdfPageViews = [];

      const numPages = pdfDocument.numPages;
      const firstPage = 1;

      const pdfjsPages = await getPdfjsPages(pdfDocument, firstPage, numPages);
      for (const [index, page] of pdfjsPages.entries()) {
        const container = document.createElement('div');
        container.classList.add('pdf-page');
        container.dataset.pageNumber = (index + 1).toString();
        container.id = `${documentId}-page-${index + 1}`;
        viewerContainer.append(container);

        const { width, height } = this.getOriginalPageSize(page);
        const scale = 1;

        const eventBus = new this.pdfViewer.EventBus();
        const pdfPageView = new this.pdfViewer.PDFPageView({
          container,
          id: index + 1,
          scale,
          defaultViewport: page.getViewport({ scale }),
          eventBus,
          textLayerMode: this.textLayerMode,
        });
        this.pdfPageViews.push(pdfPageView);

        const containerBounds = container.getBoundingClientRect();
        // @ts-expect-error - Adding custom properties to DOMRect for internal use
        containerBounds.originalWidth = width;
        // @ts-expect-error - Adding custom properties to DOMRect for internal use
        containerBounds.originalHeight = height;

        pdfPageView.setPdfPage(page);
        await pdfPageView.draw();

        emit('page-loaded', documentId, index, containerBounds);

        emit('page-ready', {
          documentId,
          pageIndex: index,
          width: containerBounds.width,
          height: containerBounds.height,
          originalWidth: width,
          originalHeight: height,
        });
      }

      emit('ready', documentId, viewerContainer);
    } catch (err) {
      console.error('Error loading PDF:', err);
    }
  }

  /**
   * @param {PDFPageProxy} page
   * @returns {PageSize}
   */
  getOriginalPageSize(page) {
    const viewport = page.getViewport({ scale: 1 });
    const width = viewport.width;
    const height = viewport.height;
    return { width, height };
  }

  /**
   * @return {void}
   */
  destroy() {
    this.pdfPageViews.forEach((view) => view.destroy());
    this.pdfPageViews = [];
  }
}

export class PDFAdapterFactory {
  /**
   * @param {PDFJSConfig & {adapter: AdapterType}} config
   * @returns {PDFAdapter}
   * @throws {Error}
   */
  static create(config) {
    const adapters = {
      pdfjs: () => {
        return new PDFJSAdapter(config);
      },
      default: () => {
        throw new Error('Unsupported adapter');
      },
    };
    const adapter = adapters[config.adapter] ?? adapters.default;
    return adapter();
  }
}

/**
 * @param {Partial<PDFConfig>} [config]
 * @returns {PDFConfig}
 */
export const createPDFConfig = (config) => {
  /** @type {PDFConfig} */
  const defaultConfig = {
    adapter: 'pdfjs',
  };

  return {
    ...defaultConfig,
    ...config,
  };
};

/**
 * @param {PDFDocumentProxy} pdf
 * @param {number} firstPage
 * @param {number} lastPage
 * @returns {Promise<PDFPageProxy[]>}
 */
export async function getPdfjsPages(pdf, firstPage, lastPage) {
  const pagesPromises = range(firstPage, lastPage + 1).map((num) => pdf.getPage(num));
  return await Promise.all(pagesPromises);
}

/**
 * @param {number} version
 * @returns {string}
 */
export function getWorkerSrcFromCDN(version) {
  return `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.mjs`;
}
