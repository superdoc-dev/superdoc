import { SuperDoc } from 'superdoc';
import type { CommandExecutionResult } from 'superdoc/ui';
import 'superdoc/style.css';

const clauseText = document.querySelector<HTMLInputElement>('#clause-text');
const insertClause = document.querySelector<HTMLButtonElement>('#insert-clause');
const status = document.querySelector<HTMLOutputElement>('#command-status');

if (!clauseText || !insertClause || !status) throw new Error('The custom command controls are incomplete.');

let disposeCommand: (() => void) | null = null;
let stopCommandState: (() => void) | null = null;
let removeHandlers: (() => void) | null = null;

const report = (result: CommandExecutionResult) => {
  if (result === false) {
    status.value = 'The clause could not be inserted.';
  } else if (typeof result === 'object' && !result.success) {
    status.value = result.failure.message;
  } else {
    status.value = 'Clause inserted.';
  }
};

const superdoc = new SuperDoc({
  selector: '#editor',
  document: '/contract.docx',
  onReady: ({ superdoc: readySuperDoc }) => {
    const ui = readySuperDoc.ui;
    const registration = ui.commands.register<{ text: string }>({
      id: 'insert-standard-clause',
      shortcut: 'Mod-Shift-K',
      getState: ({ state, documentMode }) => ({
        enabled: state.ready && documentMode !== 'viewing',
        disabled: !state.ready || documentMode === 'viewing',
        active: false,
        supported: true,
        reason: !state.ready ? 'not-ready' : documentMode === 'viewing' ? 'document-readonly' : undefined,
      }),
      execute: ({ payload, insertText }) => insertText(payload?.text ?? ''),
    });
    const command = registration.handle;

    const render = () => {
      const commandState = command.getState();
      insertClause.disabled = !commandState.enabled;
      insertClause.title = commandState.reason ?? '';
    };
    const run = async () => report(await command.executeAsync({ text: clauseText.value }));
    const runShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        void run();
      }
    };

    stopCommandState = command.observe(render);
    insertClause.addEventListener('click', run);
    window.addEventListener('keydown', runShortcut);

    removeHandlers = () => {
      insertClause.removeEventListener('click', run);
      window.removeEventListener('keydown', runShortcut);
    };
    disposeCommand = registration.unregister;
  },
});

window.addEventListener('beforeunload', () => {
  stopCommandState?.();
  removeHandlers?.();
  disposeCommand?.();
  superdoc.destroy();
});
