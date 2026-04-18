// @ts-check
import { createLogger } from './logger/logger.js';
import { StateValidators } from './validators/state/index.js';
import { XmlValidators } from './validators/xml/index.js';

/**
 * @typedef {import('./types.js').ElementInfo} ElementInfo
 * @typedef {import('./types.js').DocumentAnalysis} DocumentAnalysis
 * @typedef {import('./types.js').ValidatorFunction} ValidatorFunction
 * @typedef {import('./types.js').ValidatorRequirements} ValidatorRequirements
 * @typedef {import('./types.js').SuperValidatorOptions} SuperValidatorOptions
 * @typedef {import('./types.js').Editor} Editor
 * @typedef {import('./types.js').ValidatorLogger} ValidatorLogger
 * @typedef {import('./types.js').StateValidator} StateValidator
 * @typedef {import('prosemirror-model').Mark} Mark
 * @typedef {import('prosemirror-model').Node} Node
 */

/**
 * Main class for validating XML documents in the Super Editor.
 */
export class SuperValidator {
  /** @type {Editor} */
  #editor;

  /** @type {any} */
  #stateValidators;

  /** @type {any} */
  #xmlValidators;

  /** @type {Set<string>} */
  #requiredNodeTypes;

  /** @type {Set<string>} */
  #requiredMarkTypes;

  /**
   * Create a SuperValidator instance.
   * @param {SuperValidatorOptions} options - Options for the validator.
   */
  constructor(options) {
    this.#editor = options.editor;
    this.dryRun = options.dryRun || false;
    this.debug = options.debug || false;
    this.logger = createLogger(this.debug);

    // Initialize validators and collect their requirements
    const { stateValidators, xmlValidators, nodeTypes, markTypes } = this.#initializeValidators();
    this.#stateValidators = stateValidators;
    this.#xmlValidators = xmlValidators;
    this.#requiredNodeTypes = nodeTypes;
    this.#requiredMarkTypes = markTypes;
  }

  /**
   * Initialize all validators and collect their element requirements
   * @returns {{ stateValidators: Record<string, ValidatorFunction>, xmlValidators: Record<string, ValidatorFunction>, nodeTypes: Set<string>, markTypes: Set<string> }}
   */
  #initializeValidators() {
    const requiredNodes = new Set();
    const requiredMarks = new Set();

    const initializeValidatorSet = (validatorFactories) => {
      return Object.fromEntries(
        Object.entries(validatorFactories).map(([key, factory]) => {
          const validatorLogger = this.logger.withPrefix(key);
          /** @type {ValidatorFunction} */
          const validator = factory({ editor: this.#editor, logger: validatorLogger });

          // Collect requirements from this validator
          this.#collectValidatorRequirements(validator, requiredNodes, requiredMarks);

          return [key, validator];
        }),
      );
    };

    const stateValidators = initializeValidatorSet(StateValidators);
    const xmlValidators = initializeValidatorSet(XmlValidators);

    return {
      stateValidators: stateValidators,
      xmlValidators: xmlValidators,
      nodeTypes: requiredNodes,
      markTypes: requiredMarks,
    };
  }

  /**
   * Extract and collect requirements from a validator
   * @param {ValidatorFunction} validator
   * @param {Set<string>} requiredNodes
   * @param {Set<string>} requiredMarks
   */
  #collectValidatorRequirements(validator, requiredNodes, requiredMarks) {
    if (!validator.requiredElements) return;

    if (typeof validator.requiredElements === 'object') {
      if (validator.requiredElements.nodes) {
        validator.requiredElements.nodes.forEach((nodeType) => {
          requiredNodes.add(nodeType);
        });
      }
      if (validator.requiredElements.marks) {
        validator.requiredElements.marks.forEach((markType) => {
          requiredMarks.add(markType);
        });
      }
    }
  }

  /**
   * Analyze the document to collect all required elements
   * @returns {DocumentAnalysis}
   */
  #analyzeDocument() {
    const { doc } = this.#editor.state;

    /** @type {DocumentAnalysis} */
    const analysis = {};

    // Initialize arrays for required element types
    this.#requiredNodeTypes.forEach((type) => (analysis[type] = []));
    this.#requiredMarkTypes.forEach((type) => (analysis[type] = []));

    /**
     * @param {Node} node
     * @param {number} pos
     */
    const collectElements = (node, pos) => {
      // Collect nodes by type
      if (this.#requiredNodeTypes.has(node.type.name)) {
        analysis[node.type.name].push({ node, pos });
      }

      // Collect marks from text nodes
      if (node.isText && node.marks) {
        node.marks.forEach(
          /** @param {Mark} mark */
          (mark) => {
            if (this.#requiredMarkTypes.has(mark.type.name)) {
              analysis[mark.type.name].push({
                mark,
                node,
                pos,
                from: pos,
                to: pos + node.nodeSize,
              });
            }
          },
        );
      }
    };

    doc.descendants(collectElements);
    return analysis;
  }

  /**
   * Validate the active document in the editor. Triggered automatically on editor initialization.
   * @returns {{ modified: boolean, results: Array<{ key: string, results: string[] }> }}
   */
  validateActiveDocument() {
    const state = this.#editor.state;
    if (!state) return { modified: false, results: [] };

    const { tr } = state;

    const documentAnalysis = this.#analyzeDocument();
    this.logger.debug('Document analysis:', documentAnalysis);

    let hasModifiedDocument = false;
    const validationResults = [];
    Object.entries(this.#stateValidators).forEach(([key, validator]) => {
      this.logger.debug(`🕵 Validating with ${key}...`);

      const { results, modified } = validator(tr, documentAnalysis);
      validationResults.push({ key, results });

      hasModifiedDocument = hasModifiedDocument || modified;
    });

    if (!this.dryRun) {
      this.#dispatchWithFallback(tr);
    } else {
      this.logger.debug('DRY RUN: No changes applied to the document.');
    }

    this.logger.debug('Results:', validationResults);
    return { modified: hasModifiedDocument, results: validationResults };
  }

  /**
   * Validate the exported document in the editor. Triggered automatically on editor export.
   * @returns {{ modified: boolean, results: Array<{ key: string, results: string[] }> }}
   */
  validateDocumentExport() {
    const state = this.#editor.state;
    if (!state) return { modified: false, results: [] };
    const { tr } = state;

    let hasModifiedDocument = false;
    const validationResults = [];

    // Run XML validators
    Object.entries(this.#xmlValidators).forEach(([key, validator]) => {
      this.logger.debug(`🕵 Validating export with ${key}...`);

      const { results, modified } = validator();
      validationResults.push({ key, results });

      hasModifiedDocument = hasModifiedDocument || modified;
    });

    if (!this.dryRun && hasModifiedDocument) {
      this.#dispatchWithFallback(tr);
    } else {
      this.logger.debug('DRY RUN: No export changes applied to the document.');
    }

    this.logger.debug('Export validation results:', validationResults);
    return { modified: hasModifiedDocument, results: validationResults };
  }

  /**
   * Dispatch a transaction using the editor's public API if available, or fall back to the view.
   * @param {import('prosemirror-state').Transaction} tr
   */
  #dispatchWithFallback(tr) {
    if (typeof this.#editor?.dispatch === 'function') {
      this.#editor.dispatch(tr);
      return;
    }
    this.#editor?.view?.dispatch?.(tr);
  }
}
