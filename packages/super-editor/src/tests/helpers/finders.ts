import type { Element } from 'xml-js';

export const findFirstChild = (element: Element, name: string): Element | undefined =>
  element.elements?.find((element) => element.name === name);

export const findFirstDescendant = (
  element: Element,
  name: string,
  allowSelf: boolean = false,
): Element | undefined => {
  if (allowSelf && element.name === name) {
    return element;
  }
  if (element.elements) {
    for (const child of element.elements) {
      let result = findFirstDescendant(child, name, true);
      if (result) {
        return result;
      }
    }
  }
};

export const findAllDescendants = (element: Element, name: string, allowSelf: boolean = false): Element[] => {
  const result: Element[] = [];

  if (allowSelf && element.name === name) {
    result.push(element);
  }
  if (element.elements) {
    for (const child of element.elements) {
      result.push(...findAllDescendants(child, name, true));
    }
  }
  return result;
};
