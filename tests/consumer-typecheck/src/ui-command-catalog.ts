/**
 * Consumer typecheck: the Plan B command catalog surface resolves from the
 * canonical `superdoc/ui` (and `superdoc/ui/react`) package paths and exposes
 * the built-in command ids, command state, and command/toolbar handle types a
 * custom toolbar drives — not free-form `string`, not `any`.
 *
 * This is the migration-only posture (Workstream 9/10): there is no
 * `superdoc/headless-toolbar*` import path; the full toolbar command catalog is
 * reached through `superdoc/ui`.
 */
import { createSuperDocUI, BUILT_IN_COMMAND_IDS } from 'superdoc/ui';
import type {
  SuperDocUI,
  SuperDocLike,
  CommandsHandle,
  CommandHandle,
  CommandState,
  CommandExecutionResult,
  ToolbarHandle,
  SuperDocUIReason,
} from 'superdoc/ui';
import { useSuperDocCommand, useSuperDocToolbar } from 'superdoc/ui/react';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type AssertEqual<A, B> = Equal<A, B> extends true ? true : never;

// The 14 canonical built-in ids are present as a value catalog.
const _bold: string = BUILT_IN_COMMAND_IDS.bold;
const _acceptAll: string = BUILT_IN_COMMAND_IDS.acceptAllChanges;
void _bold;
void _acceptAll;

declare const ui: SuperDocUI;
const commands: CommandsHandle = ui.commands;

// has / get / execute / ids are the catalog access surface.
const _has: AssertEqual<ReturnType<CommandsHandle['has']>, boolean> = true;
const _ids: AssertEqual<CommandsHandle['ids'], readonly string[]> = true;
const _execute: AssertEqual<ReturnType<CommandsHandle['execute']>, CommandExecutionResult> = true;
const _executeAsync: AssertEqual<ReturnType<CommandsHandle['executeAsync']>, Promise<CommandExecutionResult>> = true;
void commands.has('zoom');
void commands.execute('font-size', '12pt');
void commands.executeAsync('font-size', '12pt');
void commands.execute('track-changes-accept-selection');

// A command handle exposes typed state, including the stable disabled reason.
const handle: CommandHandle = commands.get('document-mode');
const state: CommandState = handle.getState();
// Reasons are usually taxonomy members, but v2 edit-command snapshots pass
// their own strings (e.g. 'history-empty') through verbatim — the public type
// deliberately admits them while keeping taxonomy completion.
const _reason: SuperDocUIReason | (string & {}) | undefined = state.reason;
const _supported: boolean = state.supported;
const _enabled: boolean = state.enabled;
const _handleExecute: AssertEqual<ReturnType<CommandHandle['execute']>, CommandExecutionResult> = true;
const _handleExecuteAsync: AssertEqual<
  ReturnType<CommandHandle['executeAsync']>,
  Promise<CommandExecutionResult>
> = true;
void _reason;
void _supported;
void _enabled;
void handle.execute({ mode: 'editing' });
void handle.executeAsync({ mode: 'editing' });

// Toolbar handle executes by id too.
const toolbar: ToolbarHandle = ui.toolbar;
const _toolbarExecute: AssertEqual<ReturnType<ToolbarHandle['execute']>, CommandExecutionResult> = true;
const _toolbarExecuteAsync: AssertEqual<
  ReturnType<ToolbarHandle['executeAsync']>,
  Promise<CommandExecutionResult>
> = true;
void toolbar.execute('zoom-fit-width');
void toolbar.executeAsync('zoom-fit-width');

// React bindings resolve the same command/toolbar state types.
function _reactProbe(): void {
  const cmdState: CommandState = useSuperDocCommand('bold');
  void cmdState.reason;
  void useSuperDocToolbar().commands;
}
void _reactProbe;

// The controller factory accepts a structural host.
declare const host: SuperDocLike;
void (() => createSuperDocUI({ superdoc: host }));

void [_has, _ids, _execute, _executeAsync, _handleExecute, _handleExecuteAsync, _toolbarExecute, _toolbarExecuteAsync];
