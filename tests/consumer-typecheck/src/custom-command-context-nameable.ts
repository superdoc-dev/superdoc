/**
 * Consumer typecheck: a custom command's callback can be written as a named
 * function, not only inline.
 *
 * Every other custom-command fixture registers with an inline arrow, so the
 * parameter is contextually typed and the name of its type never comes up. That
 * is how `CustomCommandContext` stayed unexported while appearing in both
 * `execute` and `getState` on `CustomCommandRegistration`: the interface asks a
 * consumer to supply functions of a type they had no way to import.
 *
 * The moment the handler moves out of the call, which is what happens as soon
 * as it grows past a couple of lines or wants a unit test, the annotation is
 * mandatory. This fixture pins that path.
 */
import { createSuperDocUI } from 'superdoc/ui';
import type { CustomCommandContext, CustomCommandRegistration, WorkflowReceipt } from 'superdoc/ui';

/** Extracted, annotated, and independently testable. */
function insertClauseHeading(context: CustomCommandContext): WorkflowReceipt {
  return context.insertText('Clause ');
}

/** Payload-generic form, since the interface is parameterized. */
function applyLabel(context: CustomCommandContext<{ label: string }>): WorkflowReceipt {
  return context.insertText(context.payload?.label ?? '');
}

/** Reading state off the context outside the registration call. */
function isEditable(context: CustomCommandContext): boolean {
  return context.documentMode === 'editing' && context.doc !== null;
}

// The registration object can be built up as a typed value first, which also
// requires the context type to be nameable.
const registration: CustomCommandRegistration = {
  id: 'insert-clause-heading',
  execute: insertClauseHeading,
  getState: (context) => ({ enabled: isEditable(context), supported: true }),
};

const ui = createSuperDocUI({ superdoc: { activeEditor: null } });
ui.commands.register(registration);
ui.commands.register({ id: 'apply-label', execute: applyLabel });

void applyLabel;
