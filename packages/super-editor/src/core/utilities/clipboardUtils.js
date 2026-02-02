// @ts-check
// clipboardUtils.js

import { DOMParser } from 'prosemirror-model';

/**
 * @typedef {import('prosemirror-state').EditorState} EditorState
 * @typedef {import('prosemirror-model').Node} ProseMirrorNode
 * @typedef {import('prosemirror-model').Fragment} Fragment
 */

/**
 * Checks if clipboard read permission is granted and handles permission prompts.
 * Returns true if clipboard-read permission is granted. If state is "prompt" it will
 * proactively trigger a readText() call which will surface the browser permission
 * dialog to the user. Falls back gracefully in older browsers that lack the
 * Permissions API.
 * @returns {Promise<boolean>} Whether clipboard read permission is granted
 */
export async function ensureClipboardPermission() {
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    return false;
  }

  // Some older browsers do not expose navigator.permissions – assume granted
  if (!navigator.permissions || typeof navigator.permissions.query !== 'function') {
    return true;
  }

  try {
    // @ts-expect-error - clipboard-read is valid at runtime but not in TS lib DOM typing
    const status = await navigator.permissions.query({ name: 'clipboard-read' });

    if (status.state === 'granted') {
      return true;
    }

    if (status.state === 'prompt') {
      // Trigger a readText() to make the browser show its permission prompt.
      try {
        await navigator.clipboard.readText();
        return true;
      } catch {
        return false;
      }
    }

    // If we hit this area this is state === 'denied'
    return false;
  } catch {
    return false;
  }
}

/**
 * Reads raw HTML and text from the system clipboard (for use in paste actions).
 * @returns {Promise<{ html: string, text: string }>}
 */
export async function readClipboardRaw() {
  let html = '';
  let text = '';
  const hasPermission = await ensureClipboardPermission();

  if (hasPermission && navigator.clipboard && navigator.clipboard.read) {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        if (item.types.includes('text/html')) {
          html = await (await item.getType('text/html')).text();
        }
        if (item.types.includes('text/plain')) {
          text = await (await item.getType('text/plain')).text();
        }
      }
    } catch {
      try {
        text = await navigator.clipboard.readText();
      } catch {}
    }
  }
  return { html, text: text || '' };
}

/**
 * Reads content from the system clipboard and parses it into a ProseMirror fragment.
 * Attempts to read HTML first, falling back to plain text if necessary.
 * @param {EditorState} state - The ProseMirror editor state, used for schema and parsing.
 * @returns {Promise<Fragment|ProseMirrorNode|null>} A promise that resolves to a ProseMirror fragment or text node, or null if reading fails.
 */
export async function readFromClipboard(state) {
  let html = '';
  let text = '';
  const hasPermission = await ensureClipboardPermission();

  if (hasPermission && navigator.clipboard && navigator.clipboard.read) {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        if (item.types.includes('text/html')) {
          html = await (await item.getType('text/html')).text();
          break;
        } else if (item.types.includes('text/plain')) {
          text = await (await item.getType('text/plain')).text();
        }
      }
    } catch {
      // Fallback to plain text read; may still fail if permission denied
      try {
        text = await navigator.clipboard.readText();
      } catch {}
    }
  } else {
    // permissions denied or API unavailable; leave content empty
  }
  let content = null;
  if (html) {
    try {
      content = DOMParser.fromSchema(state.schema).parseSlice(
        new window.DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body,
      ).content;
    } catch (e) {
      console.error('error parsing html', e);
      // fallback to text
      content = state.schema.text(text);
    }
  }
  if (!content && text) {
    content = state.schema.text(text);
  }
  return content;
}
