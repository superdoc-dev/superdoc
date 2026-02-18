/**
 * Handler for copied content which transforms list for Google Docs/Word.
 *
 * @param {string} html The copied html content
 * @returns {string} Result html to be inserted in clipboard data
 */

export const transformListsInCopiedContent = (html) => {
  const container = document.createElement('div');
  container.innerHTML = html;

  const result = [];
  const stack = [];

  const flushStackUntil = (level) => {
    while (stack.length && stack[stack.length - 1].level >= level) {
      const top = stack.pop();
      if (stack.length) {
        stack[stack.length - 1].el.appendChild(top.el);
      } else {
        result.push(top.el.outerHTML);
      }
    }
  };

  Array.from(container.childNodes).forEach((node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) {
      result.push(node.outerHTML || node.textContent);
      return;
    }

    if (node.tagName.toLowerCase() === 'ol' || node.tagName.toLowerCase() === 'ul') {
      const child = getFirstElementChild(node);
      const level = getLevel(child);
      const numFmt = child.getAttribute('data-num-fmt');
      const lvlText = child.getAttribute('data-lvl-text');
      const tag = node.tagName.toLowerCase();

      const li = child.cloneNode(true);
      li.setAttribute('aria-level', level + 1);
      li.style.setProperty('list-style-type', getListStyleType(numFmt, lvlText));

      // if current level not open, create new list
      if (!stack.length || stack[stack.length - 1].level < level) {
        const newList = document.createElement(tag);
        stack.push({ tag, level, el: newList });
      } else if (stack[stack.length - 1].level > level) {
        flushStackUntil(level + 1);
      } else if (stack[stack.length - 1].tag !== tag) {
        flushStackUntil(level);
        const newList = document.createElement(tag);
        stack.push({ tag, level, el: newList });
      }
      stack[stack.length - 1].el.appendChild(li);
    } else {
      flushStackUntil(0);
      result.push(node.outerHTML);
    }
  });

  // Flush remaining stack
  flushStackUntil(0);

  return result.join('');
};

/**
 * Returns value for list-style-type attribute of copied content
 */
export const getListStyleType = (numFmt, lvlText) => {
  const bulletFmtMap = new Map([
    ['●', 'disc'],
    ['◦', 'circle'],
    ['▪', 'square'],
  ]);

  if (numFmt === 'bullet') return bulletFmtMap.get(lvlText) || 'disc';

  const fmtMap = new Map([
    ['decimal', 'decimal'],
    ['lowerLetter', 'lower-alpha'],
    ['upperLetter', 'upper-alpha'],
    ['lowerRoman', 'lower-roman'],
    ['upperRoman', 'upper-roman'],
  ]);

  return lvlText.startsWith('0') ? 'decimal-leading-zero' : fmtMap.get(numFmt);
};

/**
 * Get first child of Element type
 */
function getFirstElementChild(node) {
  return Array.from(node.childNodes).find((n) => n.nodeType === Node.ELEMENT_NODE) || null;
}

/**
 * Returns parsed list level
 */
export const getLevel = (node) => {
  const lvl = node.getAttribute('data-level');
  return lvl ? parseInt(lvl, 10) : 0;
};
