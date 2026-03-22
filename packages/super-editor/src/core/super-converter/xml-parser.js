/**
 * Fast XML-to-JSON parser using sax.js directly.
 *
 * Produces the same JSON structure as xml-js's non-compact format:
 *   { declaration?, elements: [{ type, name, attributes, elements, text }] }
 *
 * This is a purpose-built tree builder that bypasses xml-js's overhead:
 * - No options validation / key lookups per node
 * - No manipulateAttributes / addField generic dispatch
 * - No parent pointer set + delete per element
 * - Hardcoded property names for the non-compact format we use
 *
 * Uses the same sax.js parser that xml-js uses internally.
 */
import sax from 'sax';

/**
 * Parse an XML string into the xml-js non-compact JSON format.
 *
 * @param {string} xml - Raw XML string
 * @returns {object} JSON object matching the xml-js non-compact output shape
 */
export function xmlToJson(xml) {
  const parser = sax.parser(true, { strictEntities: true, position: false });

  const root = {};
  let current = root;
  // Use an explicit stack instead of parent pointers on each node
  const stack = [];

  parser.onprocessinginstruction = function (pi) {
    if (pi.name.toLowerCase() === 'xml') {
      // XML declaration
      const attrs = {};
      const re = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
      let m;
      while ((m = re.exec(pi.body)) !== null) {
        attrs[m[1]] = m[2] !== undefined ? m[2] : m[3];
      }
      current.declaration = { attributes: attrs };
    }
  };

  parser.onopentag = function (node) {
    const element = { type: 'element', name: node.name };

    // Copy attributes directly — sax already parsed them
    const attrKeys = Object.keys(node.attributes);
    if (attrKeys.length > 0) {
      element.attributes = node.attributes;
    }

    // Attach to parent
    if (!current.elements) {
      current.elements = [];
    }
    current.elements.push(element);

    // Push current onto stack, descend into new element
    stack.push(current);
    current = element;
  };

  parser.onclosetag = function () {
    current = stack.pop();
  };

  parser.ontext = function (text) {
    // Match xml-js behavior: skip whitespace-only text between elements
    if (!text.trim()) return;

    if (!current.elements) {
      current.elements = [];
    }
    current.elements.push({ type: 'text', text: text });
  };

  parser.oncdata = function (cdata) {
    if (!current.elements) {
      current.elements = [];
    }
    current.elements.push({ type: 'cdata', cdata: cdata });
  };

  parser.oncomment = function (comment) {
    if (!current.elements) {
      current.elements = [];
    }
    current.elements.push({ type: 'comment', comment: comment });
  };

  parser.onerror = function (error) {
    // Match xml-js: store the error but don't resume.
    // sax will throw on close() for malformed XML.
    error.note = error;
  };

  parser.write(xml).close();

  return root;
}
