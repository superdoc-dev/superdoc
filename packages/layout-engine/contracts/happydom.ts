import { Window } from 'happy-dom';

const window = new Window();

// Register globals
Object.assign(globalThis, {
  window,
  document: window.document,
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  Node: window.Node,
  Blob: window.Blob,
});
