import type { CliOperationId } from '../cli';
import type { CommandContext, CommandExecution } from './types';
import { runClose } from '../commands/close';
import { runExecuteCode } from '../commands/execute-code';
import { runInsertLineBreak, runInsertTab } from '../commands/insert-inline-special';
import { runOpen } from '../commands/open';
import {
  runPresetDispatchCommand,
  runPresetGetCatalogCommand,
  runPresetGetMcpPromptCommand,
  runPresetGetSystemPromptCommand,
  runPresetGetToolsCommand,
  runPresetListCommand,
} from '../commands/preset';
import { runSave } from '../commands/save';
import { runSessionClose } from '../commands/session-close';
import { runSessionList } from '../commands/session-list';
import { runSessionSave } from '../commands/session-save';
import { runSessionSetDefault } from '../commands/session-set-default';

export type OperationRunner = (tokens: string[], context: CommandContext) => Promise<CommandExecution>;

const LEGACY_RUNNERS: Partial<Record<CliOperationId, OperationRunner>> = {
  'doc.open': runOpen,
  'doc.save': runSave,
  'doc.close': runClose,
  'doc.insertTab': runInsertTab,
  'doc.insertLineBreak': runInsertLineBreak,
  'doc.executeCode': runExecuteCode,
  'doc.session.list': runSessionList,
  'doc.session.save': runSessionSave,
  'doc.session.close': runSessionClose,
  'doc.session.setDefault': runSessionSetDefault,
  'doc.preset.list': runPresetListCommand,
  'doc.preset.getCatalog': runPresetGetCatalogCommand,
  'doc.preset.getTools': runPresetGetToolsCommand,
  'doc.preset.getSystemPrompt': runPresetGetSystemPromptCommand,
  'doc.preset.getMcpPrompt': runPresetGetMcpPromptCommand,
  'doc.preset.dispatch': runPresetDispatchCommand,
};

export function getLegacyRunner(operationId: CliOperationId): OperationRunner | undefined {
  return LEGACY_RUNNERS[operationId];
}
