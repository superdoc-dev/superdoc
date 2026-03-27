import { ListHelpers } from '@helpers/list-numbering-helpers.js';

const removeWhitespaces = (node) => {
  const children = node.childNodes;

  for (let i = children.length - 1; i >= 0; i -= 1) {
    const child = children[i];

    if (child.nodeType === 3 && child.nodeValue && /^(\n\s\s|\n)$/.test(child.nodeValue)) {
      node.removeChild(child);
    } else if (child.nodeType === 1) {
      removeWhitespaces(child);
    }
  }

  return node;
};

/**
 * Flattens ALL lists to ensure each list contains exactly ONE list item.
 * Handles both multi-item lists and nested lists.
 */
export function flattenListsInHtml(html, editor, domDocument) {
  const resolvedDocument =
    domDocument ??
    editor?.options?.document ??
    editor?.options?.mockDocument ??
    (typeof document !== 'undefined' ? document : null);

  const win = resolvedDocument?.defaultView ?? (typeof window !== 'undefined' ? window : null);
  const DOMParserConstructor = win?.DOMParser ?? (typeof DOMParser !== 'undefined' ? DOMParser : null);
  if (!DOMParserConstructor) {
    console.warn(
      '[super-editor] HTML list processing requires a DOM. Provide { document } (e.g. from JSDOM), set DOM globals, or run in a browser environment. Skipping list flattening.',
    );
    return html;
  }

  const parser = new DOMParserConstructor();

  const doc = removeWhitespaces(parser.parseFromString(html, 'text/html'));

  // Keep processing until all lists are flattened
  let foundList;
  while ((foundList = findListToFlatten(doc))) {
    flattenFoundList(foundList, editor);
  }

  return doc.body.innerHTML;
}

/**
 * Finds the first list that needs flattening:
 * 1. Lists without data-list-id (completely unprocessed)
 * 2. Lists with more than one <li> child
 * 3. Lists with nested lists inside them
 */
function findListToFlatten(doc) {
  // First priority: unprocessed lists
  let list = doc.querySelector('ol:not([data-list-id]), ul:not([data-list-id])');
  if (list) return list;

  // Second priority: lists with multiple items
  const allLists = doc.querySelectorAll('ol[data-list-id], ul[data-list-id]');
  for (const list of allLists) {
    const liChildren = Array.from(list.children).filter((c) => c.tagName.toLowerCase() === 'li');
    if (liChildren.length > 1) {
      return list;
    }

    // Third priority: lists with nested lists
    const nestedLists = list.querySelectorAll('ol, ul');
    if (nestedLists.length > 0) {
      return list;
    }

    // Finally: even single-item lists should be flattened when they carry list metadata
    if (liChildren.length === 1) {
      return list;
    }
  }

  return null;
}

/**
 * Flattens a single list by:
 * 1. Ensuring it has proper data-list-id
 * 2. Splitting multi-item lists into single-item lists
 * 3. Extracting nested lists and processing them recursively
 */
function flattenFoundList(listElem, editor) {
  const localDoc = listElem.ownerDocument;
  const tag = listElem.tagName.toLowerCase();

  // Ensure the list has a data-list-id
  let rootNumId = listElem.getAttribute('data-list-id');
  if (!rootNumId) {
    rootNumId = ListHelpers.getNewListId(editor);
    ListHelpers.generateNewListDefinition({
      numId: rootNumId,
      listType: tag === 'ol' ? 'orderedList' : 'bulletList',
      editor,
    });
  }

  // Calculate the level of this list
  let level = Number(listElem.getAttribute('data-level'));
  if (Number.isNaN(level)) {
    level = 0;
  }
  let ancestor = listElem.parentElement;
  while (ancestor && ancestor !== localDoc.body) {
    if (ancestor.tagName && ancestor.tagName.toLowerCase() === 'li') {
      level++;
    }
    ancestor = ancestor.parentElement;
  }

  // Get all direct <li> children
  const items = Array.from(listElem.children).filter((c) => c.tagName.toLowerCase() === 'li');

  // Create single-item lists for each item
  const newLists = [];

  items.forEach((li) => {
    // Extract any nested lists first
    const nestedLists = Array.from(li.querySelectorAll('ol, ul'));
    const nestedListsData = nestedLists.map((nl) => ({
      element: nl.cloneNode(true),
      parent: nl.parentNode,
    }));

    // Remove nested lists from the li
    nestedLists.forEach((nl) => nl.parentNode.removeChild(nl));

    // Create a new single-item list for this li
    let listNumberingType = tag === 'ol' ? 'decimal' : 'bullet';
    try {
      const details = ListHelpers.getListDefinitionDetails?.({
        numId: rootNumId,
        level,
        editor,
      });
      if (details?.listNumberingType) {
        listNumberingType = details.listNumberingType;
      }
    } catch {
      // ignore lookup failures; fallback will be used
    }

    const newList = createSingleItemList({ li, rootNumId, level, listNumberingType });
    newLists.push(newList);

    // Add the nested lists (they'll be processed in the next iteration)
    nestedListsData.forEach((data) => {
      // save level for next iteration because parent list is already flattened
      data.element.setAttribute('data-level', level + 1);
      const nestedTag = data.element.tagName?.toLowerCase();
      if (nestedTag === tag) {
        data.element.setAttribute('data-list-id', rootNumId);
      }
      newLists.push(data.element);
    });
  });

  // Replace the original list with the new single-item lists
  const parent = listElem.parentNode;
  const nextSibling = listElem.nextSibling;
  parent.removeChild(listElem);

  newLists.forEach((list) => {
    parent.insertBefore(list, nextSibling);
  });
}

/**
 * Creates a single-item list from an <li> element
 */
export function createSingleItemList({ li, rootNumId, level, listNumberingType }) {
  const localDoc = li.ownerDocument;

  // Create new list and list item
  const newItem = localDoc.createElement('p');

  // Copy attributes from original li (except the ones we'll set ourselves)
  Array.from(li.attributes).forEach((attr) => {
    if (
      !attr.name.startsWith('data-num-') &&
      !attr.name.startsWith('data-level') &&
      !attr.name.startsWith('data-list-')
    ) {
      newItem.setAttribute(attr.name, attr.value);
    }
  });

  // Set list attributes
  newItem.setAttribute('data-num-id', rootNumId);
  newItem.setAttribute('data-level', String(level));
  if (listNumberingType) {
    newItem.setAttribute('data-list-numbering-type', listNumberingType);
  }

  // Copy child nodes
  Array.from(li.childNodes).forEach((node) => {
    if (node.tagName === 'P') {
      // unwrap nested <p> inside <li>
      Array.from(node.childNodes).forEach((childNode) => {
        newItem.appendChild(childNode.cloneNode(true));
      });
      return;
    }
    newItem.appendChild(node.cloneNode(true));
  });

  return newItem;
}

/**
 * Converts flatten lists back to normal list structure.
 */
export function unflattenListsInHtml(html, domDocument) {
  const win = domDocument?.defaultView ?? (typeof window !== 'undefined' ? window : null);
  const DOMParserConstructor = win?.DOMParser ?? (typeof DOMParser !== 'undefined' ? DOMParser : null);
  if (!DOMParserConstructor) {
    console.warn(
      '[super-editor] HTML list processing requires a DOM. Provide { document } (e.g. from JSDOM), set DOM globals, or run in a browser environment. Skipping list unflattening.',
    );
    return html;
  }

  const parser = new DOMParserConstructor();
  const doc = parser.parseFromString(html, 'text/html');
  const allNodes = [...doc.body.children];

  const listSequences = [];
  let currentSequence = null;

  allNodes.forEach((node) => {
    const isListParagraph = node.tagName === 'P' && node.hasAttribute('data-num-id');

    if (isListParagraph) {
      const listId = node.getAttribute('data-num-id');

      if (currentSequence && currentSequence.id === listId) {
        currentSequence.items.push(node);
      } else {
        currentSequence = {
          id: listId,
          items: [node],
        };
        listSequences.push(currentSequence);
      }
    } else {
      currentSequence = null;
    }
  });

  // Process each sequence in reverse order to avoid index issues.
  listSequences.reverse().forEach((sequence) => {
    const sequenceItems = sequence.items;

    if (sequenceItems.length === 0) {
      return;
    }

    const items = sequenceItems
      .map((element) => {
        const level = parseInt(element.getAttribute('data-level') || '0', 10);
        const listNumberingType = element.getAttribute('data-list-numbering-type') || '';
        const listLevel = parseListLevelAttribute(element.getAttribute('data-list-level'));

        return {
          element,
          level,
          numId: element.getAttribute('data-num-id'),
          listNumberingType,
          listLevel,
        };
      })
      .filter(Boolean);

    if (items.length === 0) {
      return;
    }

    const rootList = buildNestedList({ items });
    if (!rootList) {
      return;
    }

    const firstParagraph = sequenceItems[0];

    // Replace the first paragraph with the new nested structure.
    firstParagraph?.parentNode?.insertBefore(rootList, firstParagraph);

    // Remove all original list paragraphs in this sequence.
    sequenceItems.forEach((element) => {
      element.parentNode?.removeChild(element);
    });
  });

  return doc.body.innerHTML;
}

/**
 * Builds a nested list structure from flat items.
 */
function buildNestedList({ items }) {
  if (!items.length) {
    return null;
  }

  const [rootItem] = items;
  const doc = rootItem.element.ownerDocument;
  const rootListTag = getListTagForType(rootItem.listNumberingType);
  const rootList = doc.createElement(rootListTag);

  if (rootItem.numId) {
    rootList.setAttribute('data-list-id', rootItem.numId);
  }
  rootList.setAttribute('data-level', String(rootItem.level ?? 0));

  applyStartAttribute(rootList, rootItem.listLevel, 0);

  const lastLevelItem = new Map();
  items.forEach((item) => {
    const { element: paragraph, level } = item;
    const listItem = createListItemFromParagraph(paragraph);
    const cleanLi = cleanListItem(listItem);

    if (level === 0) {
      rootList.append(cleanLi);
      lastLevelItem.set(0, cleanLi);
    } else {
      const parentLi = lastLevelItem.get(level - 1);

      if (!parentLi) {
        rootList.append(cleanLi);
        lastLevelItem.set(level, cleanLi);
        return;
      }

      const listTag = getListTagForType(item.listNumberingType);
      let nestedList = findNestedList(parentLi, listTag);

      if (!nestedList) {
        nestedList = doc.createElement(listTag);
        if (item.numId) {
          nestedList.setAttribute('data-list-id', item.numId);
        }
        parentLi.append(nestedList);
      }
      nestedList.setAttribute('data-level', String(level));

      applyStartAttribute(nestedList, item.listLevel, level);
      nestedList.append(cleanLi);
      lastLevelItem.set(level, cleanLi);
    }

    // Trim references for deeper levels if we move back up the hierarchy.
    [...lastLevelItem.keys()].forEach((storedLevel) => {
      if (storedLevel > level) {
        lastLevelItem.delete(storedLevel);
      }
    });
  });

  return rootList;
}

function createListItemFromParagraph(paragraph) {
  const doc = paragraph.ownerDocument;
  const listItem = doc.createElement('li');

  Array.from(paragraph.childNodes).forEach((node) => {
    listItem.appendChild(node.cloneNode(true));
  });

  Array.from(paragraph.attributes).forEach((attr) => {
    if (!LIST_METADATA_ATTRIBUTES.has(attr.name)) {
      listItem.setAttribute(attr.name, attr.value);
    }
  });

  return listItem;
}

function findNestedList(parentLi, listTag) {
  const lowerTag = listTag.toLowerCase();
  return Array.from(parentLi.children).find((child) => child.tagName && child.tagName.toLowerCase() === lowerTag);
}

function getListTagForType(listNumberingType) {
  const type = listNumberingType?.toLowerCase();
  if (!type || type === 'bullet' || type === 'image' || type === 'none') {
    return 'ul';
  }
  return 'ol';
}

function applyStartAttribute(listNode, listLevel, level) {
  if (!listNode || listNode.tagName?.toLowerCase() !== 'ol') {
    return;
  }

  const startValue = getStartValueForLevel(listLevel, level);
  if (startValue && startValue > 1 && !listNode.hasAttribute('start')) {
    listNode.setAttribute('start', String(startValue));
  }
}

function getStartValueForLevel(listLevel, level) {
  if (!Array.isArray(listLevel)) {
    return null;
  }
  const value = listLevel[level];
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseListLevelAttribute(raw) {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((value) => Number(value)) : null;
  } catch {
    return null;
  }
}

const LIST_METADATA_ATTRIBUTES = new Set([
  'data-num-id',
  'data-level',
  'data-num-fmt',
  'data-lvl-text',
  'data-list-level',
  'data-marker-type',
  'data-list-numbering-type',
]);

/**
 * Removes flatten attributes from list item.
 */
function cleanListItem(listItem) {
  const attrs = [
    'data-num-id',
    'data-level',
    'data-num-fmt',
    'data-lvl-text',
    'data-list-level',
    'data-marker-type',
    'data-list-numbering-type',
    'aria-label',
  ];
  attrs.forEach((attr) => {
    listItem.removeAttribute(attr);
  });
  return listItem;
}
