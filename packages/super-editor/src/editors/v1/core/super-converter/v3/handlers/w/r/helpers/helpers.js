// @ts-check
import { EAST_ASIAN_CHARACTER_REGEX } from '../../../constants/east-asian-regex.js';

const containsEastAsianCharacters = (text) => EAST_ASIAN_CHARACTER_REGEX.test(text);

export const resolveFontFamily = (textStyleAttrs, text) => {
  if (!text) return textStyleAttrs;
  const eastAsiaFont = textStyleAttrs?.eastAsiaFontFamily;
  if (!eastAsiaFont) return textStyleAttrs;
  const normalized = { ...textStyleAttrs };
  delete normalized.eastAsiaFontFamily;
  const shouldUseEastAsia = typeof text === 'string' && containsEastAsianCharacters(text);
  if (!shouldUseEastAsia) return normalized;
  return { ...normalized, fontFamily: eastAsiaFont };
};

export const cloneMark = (mark) => {
  if (!mark || typeof mark !== 'object') return mark;
  const cloned = { ...mark };
  if (mark.attrs && typeof mark.attrs === 'object') {
    cloned.attrs = { ...mark.attrs };
    if (Array.isArray(mark.attrs.runProperties)) {
      cloned.attrs.runProperties = mark.attrs.runProperties.map((entry) => ({
        xmlName: entry?.xmlName,
        attributes: { ...(entry?.attributes || {}) },
      }));
    }
  }
  return cloned;
};

export const cloneXmlNode = (nodeLike) => {
  if (!nodeLike || typeof nodeLike !== 'object') return nodeLike;
  return {
    name: nodeLike.name,
    type: nodeLike.type,
    attributes: nodeLike.attributes ? { ...nodeLike.attributes } : undefined,
    elements: Array.isArray(nodeLike.elements) ? nodeLike.elements.map((el) => cloneXmlNode(el)) : undefined,
    text: nodeLike.text,
  };
};

export const applyRunPropertiesTemplate = (runNode, runPropertiesTemplate) => {
  if (!runNode || !runPropertiesTemplate) return;

  if (!Array.isArray(runNode.elements)) runNode.elements = [];
  let runProps = runNode.elements.find((el) => el?.name === 'w:rPr');
  if (!runProps) {
    runProps = { name: 'w:rPr', elements: [] };
    runNode.elements.unshift(runProps);
  }

  if (!Array.isArray(runProps.elements)) runProps.elements = [];

  if (runPropertiesTemplate.attributes) {
    runProps.attributes = {
      ...(runProps.attributes || {}),
      ...runPropertiesTemplate.attributes,
    };
  }

  const isValidRunPropName = (name) => typeof name === 'string' && name.includes(':');

  runProps.elements = runProps.elements.filter((entry) => isValidRunPropName(entry?.name));

  const existingNames = new Set(runProps.elements.map((el) => el?.name));

  (runPropertiesTemplate.elements || []).forEach((entry) => {
    if (!isValidRunPropName(entry?.name) || existingNames.has(entry.name)) return;
    runProps.elements.push(cloneXmlNode(entry));
    existingNames.add(entry.name);
  });
};
