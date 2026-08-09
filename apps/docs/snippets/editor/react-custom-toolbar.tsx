import { useEffect, useRef, useState } from 'react';
import { SuperDoc } from 'superdoc';
import type { CommandExecutionResult } from 'superdoc/ui';
import { SuperDocUIProvider, useSetSuperDoc, useSuperDocCommand, useSuperDocUI } from 'superdoc/ui/react';
import 'superdoc/style.css';

type ReportExecution = (label: string, result: CommandExecutionResult) => void;

function describeExecution(label: string, result: CommandExecutionResult): string {
  if (result === false) return `${label} is unavailable.`;
  if (typeof result === 'object' && !result.success) return result.failure.message;
  return `${label} updated.`;
}

export function App() {
  return (
    <SuperDocUIProvider>
      <CustomToolbar />
      <Editor />
    </SuperDocUIProvider>
  );
}

function CustomToolbar() {
  // Toggling Bold on and then off reports the same text twice. Storing the
  // message alone would let React skip the second update, so the count keys a
  // span *inside* the live region: the region element itself stays mounted (a
  // region inserted already-populated is not reliably announced) while its
  // content changes on every execution.
  const [status, setStatus] = useState({ id: 0, message: 'Toolbar ready.' });
  const reportExecution: ReportExecution = (label, result) =>
    setStatus((previous) => ({ id: previous.id + 1, message: describeExecution(label, result) }));

  return (
    <>
      <div aria-label='Document controls' role='toolbar'>
        <CommandButton id='undo' label='Undo' reportExecution={reportExecution} />
        <CommandButton id='bold' label='Bold' reportExecution={reportExecution} toggle />
        <DocumentModeSelect reportExecution={reportExecution} />
        <CommandButton id='zoom-fit-width' label='Fit width' reportExecution={reportExecution} />
      </div>
      <p aria-live='polite' role='status'>
        <span key={status.id}>{status.message}</span>
      </p>
    </>
  );
}

function CommandButton({
  id,
  label,
  reportExecution,
  toggle = false,
}: {
  id: string;
  label: string;
  reportExecution: ReportExecution;
  toggle?: boolean;
}) {
  const ui = useSuperDocUI();
  const state = useSuperDocCommand(id);

  const execute = async () => {
    if (!ui) return;
    reportExecution(label, await ui.commands.executeAsync(id));
  };

  return (
    <button
      aria-pressed={toggle ? state.active : undefined}
      disabled={!state.enabled}
      onClick={() => void execute()}
      title={state.reason ?? label}
      type='button'
    >
      {label}
    </button>
  );
}

function DocumentModeSelect({ reportExecution }: { reportExecution: ReportExecution }) {
  const ui = useSuperDocUI();
  const state = useSuperDocCommand('document-mode');
  const mode = typeof state.value === 'string' ? state.value : 'editing';

  const setMode = async (value: string) => {
    if (!ui) return;
    reportExecution('Document mode', await ui.commands.executeAsync('document-mode', value));
  };

  return (
    <select
      aria-label='Document mode'
      disabled={!state.enabled}
      onChange={(event) => void setMode(event.currentTarget.value)}
      value={mode}
    >
      <option value='editing'>Editing</option>
      <option value='suggesting'>Suggesting</option>
      <option value='viewing'>Viewing</option>
    </select>
  );
}

function Editor() {
  const setSuperDoc = useSetSuperDoc();
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editorRef.current) return;

    const superdoc = new SuperDoc({
      selector: editorRef.current,
      document: '/contract.docx',
      onReady: ({ superdoc: readySuperDoc }) => setSuperDoc(readySuperDoc),
    });

    return () => superdoc.destroy();
  }, [setSuperDoc]);

  return <div ref={editorRef} style={{ height: '70vh' }} />;
}
