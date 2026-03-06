import { Doc as YDoc } from 'yjs';
import { createDocumentApi } from '@superdoc/document-api';
import { getDocumentApiAdapters } from '@superdoc/super-editor/document-api-adapters';
import { BLANK_DOCX_BASE64 } from '@superdoc/super-editor/blank-docx';

const source = Buffer.from(BLANK_DOCX_BASE64, 'base64');
const noop = () => {};
const provider = {
  synced: true,
  awareness: { on: noop, off: noop, getStates: () => new Map(), setLocalState: noop, setLocalStateField: noop },
  on: noop,
  off: noop,
  connect: noop,
  disconnect: noop,
  destroy: noop,
};

async function run(label, moduleName) {
  const mod = await import(moduleName);
  const Editor = mod.Editor;
  const ydoc = new YDoc();
  const events = [];
  const editor = await Editor.open(Buffer.from(source), {
    documentId: `compare-${label}`,
    user: { name: 'Agent', email: 'agent@superdoc.dev', image: null },
    ydoc,
    collaborationProvider: provider,
    isNewFile: true,
    isCommentsEnabled: true,
    isHeadless: true,
    telemetry: { enabled: false },
  });

  const pluginKeys = editor.state.plugins.map((p) => p.key || '');
  editor.on('commentsUpdate', (e) => events.push(e));

  Object.defineProperty(editor, 'doc', { value: createDocumentApi(getDocumentApiAdapters(editor)), configurable: true });
  const receipt = editor.doc.create.paragraph({ at: { kind: 'documentEnd' }, text: 'hello world' }, { changeMode: 'tracked' });

  const comments = ydoc.getArray('comments').toJSON();
  const commentsPlugin = editor.state.plugins.find((plugin) => plugin.key?.startsWith?.('comments'));
  console.log('\n===', label, moduleName, '===');
  console.log(JSON.stringify({
    hasCommentsPlugin: Boolean(commentsPlugin),
    hasCommentsKey: pluginKeys.includes('comments$'),
    receipt,
    eventsCount: events.length,
    commentsCount: comments.length,
  }, null, 2));

  editor.destroy();
}

await run('superdoc-subpath', 'superdoc/super-editor');
await run('scoped-package', '@superdoc/super-editor');
