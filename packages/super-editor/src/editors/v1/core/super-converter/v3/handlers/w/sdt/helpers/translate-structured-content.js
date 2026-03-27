import { translateChildNodes } from '@converter/v2/exporter/helpers/translateChildNodes';
import { convertSdtContentToRuns } from './convert-sdt-content-to-runs.js';

/**
 * @param {Object} params - The parameters for translation.
 * @returns {Object|Array|Object[]} The XML representation.
 */
export function translateStructuredContent(params) {
  const { node, isFinalDoc, preserveSdtWrappers } = params;

  const childContent = translateChildNodes({ ...params, node });
  const childElements = Array.isArray(childContent) ? childContent : [childContent];

  // SDT flattening only applies to UI/editor export paths (isFinalDoc without
  // preserveSdtWrappers). Document API export paths set preserveSdtWrappers=true
  // to maintain full SDT fidelity in the output DOCX.
  if (isFinalDoc && !preserveSdtWrappers) {
    if (node?.type === 'structuredContent') {
      return convertSdtContentToRuns(childElements);
    }

    if (node?.type === 'structuredContentBlock') {
      return childElements.length === 1 ? childElements[0] : childElements;
    }
  }

  // We build the sdt node elements here, and re-add passthrough sdtPr node
  const sdtContent = { name: 'w:sdtContent', elements: childElements };
  const sdtPr = generateSdtPrTagForStructuredContent({ node });
  const nodeElements = [sdtPr, sdtContent];

  const result = {
    name: 'w:sdt',
    elements: nodeElements,
  };

  return result;
}

/** Maps control types to their sdtPr element names for OOXML export. */
const CONTROL_TYPE_ELEMENT_MAP = {
  text: 'w:text',
  date: 'w:date',
  checkbox: 'w14:checkbox',
  comboBox: 'w:comboBox',
  dropDownList: 'w:dropDownList',
  repeatingSection: 'w15:repeatingSection',
  repeatingSectionItem: 'w15:repeatingSectionItem',
  group: 'w:group',
};

const DEFAULT_CHECKBOX_SYMBOL_FONT = 'MS Gothic';
const DEFAULT_CHECKBOX_CHECKED_HEX = '2612';
const DEFAULT_CHECKBOX_UNCHECKED_HEX = '2610';

function buildDefaultTypeElement(controlType) {
  const typeElementName = controlType && CONTROL_TYPE_ELEMENT_MAP[controlType];
  if (!typeElementName) return null;

  if (controlType === 'checkbox') {
    return {
      name: typeElementName,
      type: 'element',
      elements: [
        { name: 'w14:checked', type: 'element', attributes: { 'w14:val': '0' } },
        {
          name: 'w14:checkedState',
          type: 'element',
          attributes: { 'w14:font': DEFAULT_CHECKBOX_SYMBOL_FONT, 'w14:val': DEFAULT_CHECKBOX_CHECKED_HEX },
        },
        {
          name: 'w14:uncheckedState',
          type: 'element',
          attributes: { 'w14:font': DEFAULT_CHECKBOX_SYMBOL_FONT, 'w14:val': DEFAULT_CHECKBOX_UNCHECKED_HEX },
        },
      ],
    };
  }

  if (controlType === 'comboBox' || controlType === 'dropDownList') {
    return { name: typeElementName, type: 'element', elements: [] };
  }

  if (controlType === 'repeatingSection') {
    return {
      name: typeElementName,
      type: 'element',
      elements: [{ name: 'w15:allowInsertDeleteSection', type: 'element', attributes: { 'w15:val': '1' } }],
    };
  }

  if (controlType === 'date') {
    return {
      name: typeElementName,
      type: 'element',
      elements: [
        { name: 'w:dateFormat', type: 'element', attributes: { 'w:val': 'M/d/yyyy' } },
        { name: 'w:lid', type: 'element', attributes: { 'w:val': 'en-US' } },
        { name: 'w:storeMappedDataAs', type: 'element', attributes: { 'w:val': 'dateTime' } },
        { name: 'w:calendar', type: 'element', attributes: { 'w:val': 'gregorian' } },
      ],
    };
  }

  return { name: typeElementName, type: 'element' };
}

function generateSdtPrTagForStructuredContent({ node }) {
  const { attrs = {} } = node;

  const id = {
    name: 'w:id',
    type: 'element',
    attributes: { 'w:val': attrs.id },
  };
  const alias = {
    name: 'w:alias',
    type: 'element',
    attributes: { 'w:val': attrs.alias },
  };
  const tag = {
    name: 'w:tag',
    type: 'element',
    attributes: { 'w:val': attrs.tag },
  };
  const lock = {
    name: 'w:lock',
    type: 'element',
    attributes: { 'w:val': attrs.lockMode },
  };

  const resultElements = [];
  if (attrs.id != null) resultElements.push(id);
  if (attrs.alias) resultElements.push(alias);
  if (attrs.tag) resultElements.push(tag);
  if (attrs.lockMode && attrs.lockMode !== 'unlocked') resultElements.push(lock);

  if (attrs.sdtPr) {
    const elements = attrs.sdtPr.elements || [];
    const elementsToExclude = ['w:id', 'w:alias', 'w:tag', 'w:lock'];
    const restElements = elements.filter((el) => !elementsToExclude.includes(el.name));
    const result = {
      name: 'w:sdtPr',
      type: 'element',
      elements: [...resultElements, ...restElements],
    };
    return result;
  }

  // When sdtPr is absent (newly created controls), emit the type-specific
  // element from attrs.controlType so the OOXML is semantically correct.
  const controlType = attrs.controlType || attrs.type;
  const typeElement = buildDefaultTypeElement(controlType);
  if (typeElement) {
    resultElements.push(typeElement);
  }

  const result = {
    name: 'w:sdtPr',
    type: 'element',
    elements: resultElements,
  };

  return result;
}
