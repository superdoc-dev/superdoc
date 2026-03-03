import type { Editor } from '../../core/Editor.js';
import type { PartChangedPayload } from '../../core/types/EditorEvents.js';
import { translator as docDefaultsTranslator } from '../../core/super-converter/v3/handlers/w/docDefaults/docDefaults-translator.js';
import { translator as latentStylesTranslator } from '../../core/super-converter/v3/handlers/w/latentStyles/latentStyles-translator.js';
import { translator as styleTranslator } from '../../core/super-converter/v3/handlers/w/style/style-translator.js';
import {
  ensureTranslatedLinkedStylesModel,
  type TranslatedLinkedStylesModel,
} from '../../core/super-converter/translated-linked-styles-model.js';
import {
  syncDocDefaultsToConvertedXml,
  syncLatentStylesToConvertedXml,
  syncAllStyleDefinitionsToConvertedXml,
  type SubtreeTranslator,
} from '../styles-xml-sync.js';
import { commitXmlModelMutation, type CommitXmlModelMutationResult } from './commit-xml-model-mutation.js';
import type { OutOfBandMutationOptions } from '../out-of-band-mutation.js';

type StylesConverterForMutation = Parameters<typeof syncDocDefaultsToConvertedXml>[0];

interface CommitStylesMutationConfig<TMutationResult> {
  editor: Editor;
  converter: StylesConverterForMutation;
  options: OutOfBandMutationOptions;
  source: string;
  mutate: (context: { model: TranslatedLinkedStylesModel; dryRun: boolean }) => TMutationResult;
  diffScopePaths?: readonly string[];
}

/**
 * Styles-specific model mutation wrapper.
 *
 * Provides the shared style model normalization, XML synchronization, and
 * unified `stylesChanged` event emission so callers only supply mutation logic.
 *
 * XML sync is routed automatically based on which top-level branches changed:
 * - `docDefaults.*` → syncs `w:docDefaults`
 * - `latentStyles.*` → syncs `w:latentStyles`
 * - `styles.*` → syncs all `w:style` elements
 */
export function commitStylesMutation<TMutationResult>(
  config: CommitStylesMutationConfig<TMutationResult>,
): CommitXmlModelMutationResult<TMutationResult> {
  return commitXmlModelMutation<StylesConverterForMutation, TranslatedLinkedStylesModel, TMutationResult>({
    editor: config.editor,
    converter: config.converter,
    options: config.options,
    ensureModel: (converter) => ensureTranslatedLinkedStylesModel(converter),
    mutate: config.mutate,
    syncXml: ({ converter, changedPaths }) => {
      syncChangedSubtrees(converter, changedPaths);
    },
    emitChanged: ({ editor, changedPaths }) => {
      editor.emit('partChanged', {
        partId: 'styles',
        changedPaths,
        source: config.source,
      } satisfies PartChangedPayload);
    },
    diffScopePaths: config.diffScopePaths,
  });
}

// ---------------------------------------------------------------------------
// Internal routing
// ---------------------------------------------------------------------------

function syncChangedSubtrees(converter: StylesConverterForMutation, changedPaths: string[]): void {
  let needsDocDefaults = false;
  let needsLatentStyles = false;
  let needsStyles = false;

  for (const path of changedPaths) {
    if (path.startsWith('docDefaults')) needsDocDefaults = true;
    else if (path.startsWith('latentStyles')) needsLatentStyles = true;
    else if (path.startsWith('styles')) needsStyles = true;
  }

  if (needsDocDefaults) {
    syncDocDefaultsToConvertedXml(converter, docDefaultsTranslator as unknown as SubtreeTranslator);
  }
  if (needsLatentStyles) {
    syncLatentStylesToConvertedXml(converter, latentStylesTranslator as unknown as SubtreeTranslator);
  }
  if (needsStyles) {
    syncAllStyleDefinitionsToConvertedXml(converter, styleTranslator as unknown as SubtreeTranslator);
  }
}
