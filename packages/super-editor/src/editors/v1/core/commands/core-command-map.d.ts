import type * as CoreCommandExports from './index.js';
import type { CommandProps } from '../types/ChainedCommands.js';

type ExtractCommandSignature<F> = F extends (...args: infer A) => (props: CommandProps) => infer R
  ? (...args: A) => R
  : (...args: unknown[]) => unknown;

type CoreCommandNames =
  | 'first'
  | 'command'
  | 'insertTabChar'
  | 'insertTabCharacter'
  | 'insertTabNode'
  | 'setMeta'
  | 'splitBlock'
  | 'liftEmptyBlock'
  | 'createParagraphNear'
  | 'newlineInCode'
  | 'exitCode'
  | 'setMark'
  | 'unsetMark'
  | 'unsetAllMarks'
  | 'toggleMark'
  | 'toggleMarkCascade'
  | 'isStyleTokenEnabled'
  | 'clearNodes'
  | 'setNode'
  | 'toggleNode'
  | 'selectAll'
  | 'deleteSelection'
  | 'updateAttributes'
  | 'resetAttributes'
  | 'joinUp'
  | 'joinDown'
  | 'joinBackward'
  | 'joinForward'
  | 'selectNodeBackward'
  | 'selectNodeForward'
  | 'selectTextblockStart'
  | 'selectTextblockEnd'
  | 'insertContent'
  | 'insertContentAt'
  | 'insertParagraphAt'
  | 'insertHeadingAt'
  | 'undoInputRule'
  | 'setSectionPageMarginsAtSelection'
  | 'toggleList'
  | 'increaseListIndent'
  | 'decreaseListIndent'
  | 'changeListLevel'
  | 'updateNumberingProperties'
  | 'removeNumberingProperties'
  | 'insertListItemAt'
  | 'setListTypeAt'
  | 'exitListItemAt'
  | 'restoreSelection'
  | 'setTextSelection'
  | 'insertTableAt'
  | 'getSelectionMarks'
  | 'backspaceEmptyRunParagraph'
  | 'backspaceSkipEmptyRun'
  | 'backspaceNextToRun'
  | 'backspaceAcrossRuns'
  | 'backspaceAtomBefore'
  | 'selectInlineSdtBeforeRunStart'
  | 'selectInlineSdtAfterRunEnd'
  | 'selectBlockSdtBeforeTextBlockStart'
  | 'selectBlockSdtAfterTextBlockEnd'
  | 'deleteBlockSdtAtTextBlockStart'
  | 'moveIntoBlockSdtBeforeTextBlockStart'
  | 'moveIntoBlockSdtAfterTextBlockEnd'
  | 'deleteSkipEmptyRun'
  | 'deleteNextToRun'
  | 'deleteAtomAfter'
  | 'skipTab';

export type CoreCommandSignatures = {
  [K in CoreCommandNames]: ExtractCommandSignature<(typeof CoreCommandExports)[K]>;
};

declare module '../types/ChainedCommands.js' {
  interface CoreCommandMap extends CoreCommandSignatures {}
}
