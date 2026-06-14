import 'superdoc/style.css';
import { SuperDoc } from 'superdoc';
import { createSuperDocUI } from 'superdoc/ui';
import { superdocFonts } from '@superdoc-dev/fonts';

type SuperDocUIInstance = ReturnType<typeof createSuperDocUI>;

type SuperDocConfig = ConstructorParameters<typeof SuperDoc>[0];
type SuperDocInstance = InstanceType<typeof SuperDoc>;
type SuperDocReadyPayload = Parameters<NonNullable<SuperDocConfig['onReady']>>[0];
type OverrideType = 'markdown' | 'html' | 'text';
type StoryLocator =
  | { kind: 'story'; storyType: 'body' }
  | { kind: 'story'; storyType: 'headerFooterPart'; refId: string }
  | { kind: 'story'; storyType: 'footnote' | 'endnote'; noteId: string };
type ContentOverrideInput = {
  contentOverride?: string;
  overrideType?: OverrideType;
};
type BehaviorHarnessCommentSnapshot = {
  commentId?: string;
  importedId?: string;
  trackedChange?: boolean;
  trackedChangeText?: string | null;
  trackedChangeType?: string | null;
  trackedChangeDisplayType?: string | null;
  trackedChangeStory?: StoryLocator | null;
  trackedChangeStoryKind?: string | null;
  trackedChangeStoryLabel?: string;
  trackedChangeAnchorKey?: string | null;
  deletedText?: string | null;
  resolvedTime?: number | null;
};
type BehaviorHarnessApi = {
  getActiveStorySession: () => StoryLocator | null;
  getActiveStoryText: () => string | null;
  getBodyStoryText: () => string | null;
  getCommentsSnapshot: () => BehaviorHarnessCommentSnapshot[];
  getEditorCommentPositions: () => Record<string, unknown>;
  getActiveCommentId: () => string | null;
};

type HarnessWindow = Window &
  typeof globalThis & {
    superdocReady?: boolean;
    superdoc?: SuperDocInstance;
    editor?: unknown;
    behaviorHarness?: BehaviorHarnessApi;
    behaviorHarnessInit?: (input?: ContentOverrideInput) => void;
    /**
     * Optional `superdoc/ui` controller — created lazily by behavior
     * tests that exercise `createSuperDocUI`. Tests call
     * `window.__bootSuperDocUI()` after `superdocReady` flips, then
     * read state through `window.superdocUI` (or call its action
     * methods directly).
     */
    superdocUI?: SuperDocUIInstance;
    __bootSuperDocUI?: () => SuperDocUIInstance;
  };

const harnessWindow = window as HarnessWindow;

const params = new URLSearchParams(location.search);
const layout = params.get('layout') !== '0';
const showCaret = params.get('showCaret') === '1';
const showSelection = params.get('showSelection') === '1';
const toolbar = params.get('toolbar');
const responsiveToContainer = params.get('responsiveToContainer') === '1';
const comments = params.get('comments');
const trackChanges = params.get('trackChanges') === '1';
const replacementsParam = params.get('replacements');
const replacements: 'paired' | 'independent' = replacementsParam === 'independent' ? 'independent' : 'paired';
const allowSelectionInViewMode = params.get('allowSelectionInViewMode') === '1';
const documentMode = params.get('documentMode') as 'editing' | 'viewing' | 'suggesting' | null;
const contentOverride = params.get('contentOverride') ?? undefined;
const overrideType = (params.get('overrideType') as OverrideType | null) ?? undefined;
const previewScroll = params.get('previewScroll') === '1';
const blockPreviewScrollEvents = params.get('blockPreviewScrollEvents') === '1';
// Bundled-font mode for the font-availability specs. Unset = the rich pack (back-compat: existing
// specs assert the rich toolbar), see resolveHarnessFontsConfig.
const fontsMode = params.get('fonts');

if (!showCaret) {
  document.documentElement.style.setProperty('caret-color', 'transparent', 'important');
}

if (previewScroll) {
  const harnessMain = document.querySelector<HTMLElement>('#harness-main');
  if (harnessMain) {
    harnessMain.style.height = '720px';
    harnessMain.style.overflowY = 'auto';
    if (blockPreviewScrollEvents) {
      harnessMain.addEventListener(
        'scroll',
        (event) => {
          event.stopImmediatePropagation();
        },
        { capture: true },
      );
    }
  }
}

let instance: SuperDocInstance | null = null;
const commentsPanel = document.querySelector<HTMLElement>('#comments-panel');

function getEditorText(editor: any): string | null {
  const state = editor?.state;
  const doc = state?.doc;
  if (!doc || typeof doc.textBetween !== 'function' || typeof doc.content?.size !== 'number') return null;
  return doc.textBetween(0, doc.content.size, '\n', '\n');
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function buildBehaviorHarnessApi(): BehaviorHarnessApi {
  return {
    getActiveStorySession: () => {
      const session = (harnessWindow.editor as any)?.presentationEditor
        ?.getStorySessionManager?.()
        ?.getActiveSession?.();
      return session?.locator ?? null;
    },
    getActiveStoryText: () => {
      const activeEditor = (harnessWindow.editor as any)?.presentationEditor?.getActiveEditor?.();
      if (!activeEditor || activeEditor === harnessWindow.editor) return null;
      return getEditorText(activeEditor);
    },
    getBodyStoryText: () => getEditorText(harnessWindow.editor),
    getCommentsSnapshot: () => {
      const comments = (harnessWindow.superdoc as any)?.commentsStore?.commentsList ?? [];
      return comments.map((comment: any) => {
        const raw = typeof comment?.getValues === 'function' ? comment.getValues() : comment;
        return cloneJson({
          commentId: raw?.commentId,
          importedId: raw?.importedId,
          trackedChange: raw?.trackedChange === true,
          trackedChangeText: raw?.trackedChangeText ?? null,
          trackedChangeType: raw?.trackedChangeType ?? null,
          trackedChangeDisplayType: raw?.trackedChangeDisplayType ?? null,
          trackedChangeStory: raw?.trackedChangeStory ?? null,
          trackedChangeStoryKind: raw?.trackedChangeStoryKind ?? null,
          trackedChangeStoryLabel: raw?.trackedChangeStoryLabel ?? '',
          trackedChangeAnchorKey: raw?.trackedChangeAnchorKey ?? null,
          deletedText: raw?.deletedText ?? null,
          resolvedTime: raw?.resolvedTime ?? null,
        });
      });
    },
    getEditorCommentPositions: () => {
      const positions = (harnessWindow.superdoc as any)?.commentsStore?.editorCommentPositions ?? {};
      return cloneJson(positions);
    },
    getActiveCommentId: () => {
      const activeComment = (harnessWindow.superdoc as any)?.commentsStore?.activeComment;
      return activeComment == null ? null : String(activeComment);
    },
  };
}

function applyContentOverride(config: SuperDocConfig, input?: ContentOverrideInput) {
  if (!input?.contentOverride || !input?.overrideType) return;

  if (input.overrideType === 'markdown') {
    config.markdown = input.contentOverride;
    return;
  }

  if (input.overrideType === 'html') {
    config.html = input.contentOverride;
    return;
  }

  // SuperDoc config does not expose a plain-text bootstrap field directly.
  // Use markdown as a lossless text carrier for behavior harness purposes.
  if (input.overrideType === 'text') {
    config.markdown = input.contentOverride;
  }
}

/**
 * Bundled-font config for the harness, chosen by the `fonts` query param so the font-availability
 * specs can drive each mode from one harness. `null` (no param) keeps the rich pack so existing
 * behavior specs are unaffected. Curation goes through the RAW `fonts.bundled` path - what a CDN or
 * plain-JS consumer hand-writes, and what `createSuperDocFonts` feeds underneath.
 */
function resolveHarnessFontsConfig(mode: string | null): SuperDocConfig['fonts'] | undefined {
  switch (mode) {
    case 'no-pack':
      // No pack configured: conservative baseline toolbar, logical names render with system fonts,
      // and nothing fetches a bundled substitute.
      return undefined;
    case 'include-calibri':
      return { assetBaseUrl: '/fonts/', bundled: { include: ['Calibri'] } };
    case 'exclude-cooper':
      return { assetBaseUrl: '/fonts/', bundled: { exclude: ['Cooper Black'] } };
    case 'bad-raw':
      // Malformed raw config: a bare string where an array is required. Must warn once and fall back
      // to the full pack, never crash init (guards the fonts.bundled coercion).
      return { assetBaseUrl: '/fonts/', bundled: { include: 'Calibri' as unknown as string[] } };
    case 'bad-url':
      // Pack configured but the assets are not served there: faces 404 on use, with a clear warning.
      return { assetBaseUrl: '/__missing-fonts__/' };
    case 'package':
      // The real `@superdoc-dev/fonts` DX: no assetBaseUrl, the package resolves each face to a
      // bundler-emitted asset URL. Proves the import-and-go path users copy from the docs.
      return superdocFonts as SuperDocConfig['fonts'];
    case 'pack':
      // A configured pack whose assets are actually SERVED (see the /bundled-fonts middleware), so
      // face-load specs can assert a real 200. Distinct from the default base on purpose.
      return { assetBaseUrl: '/bundled-fonts/' };
    default:
      // The rich pack advertised but NOT served: substitutes appear in the toolbar but are never
      // fetched, so rendered text keeps logical names. This is the default every non-font spec runs
      // under, so it must stay served-nowhere (see harness/vite.config.ts).
      return { assetBaseUrl: '/fonts/' };
  }
}

const harnessFonts = resolveHarnessFontsConfig(fontsMode);

function init(file?: File, content?: ContentOverrideInput) {
  if (instance) {
    instance.destroy();
    instance = null;
  }

  harnessWindow.superdocReady = false;

  const config: SuperDocConfig = {
    selector: '#editor',
    useLayoutEngine: layout,
    telemetry: { enabled: false },
    // Bundled-font config, selected by the `fonts` query param (default keeps the rich pack so
    // existing specs are unaffected). See resolveHarnessFontsConfig.
    ...(harnessFonts !== undefined ? { fonts: harnessFonts } : {}),
    onReady: ({ superdoc }: SuperDocReadyPayload) => {
      harnessWindow.superdoc = superdoc;
      if (comments === 'panel' && commentsPanel) {
        commentsPanel.replaceChildren();
        superdoc.addCommentsList(commentsPanel);
      }
      superdoc.activeEditor.on('create', (payload: unknown) => {
        if (!payload || typeof payload !== 'object' || !('editor' in payload)) return;
        harnessWindow.editor = (payload as { editor: unknown }).editor;
      });
      harnessWindow.behaviorHarness = buildBehaviorHarnessApi();
      // Lazy-construct the `superdoc/ui` controller on first request.
      // We don't auto-build it because most behavior tests don't need
      // it, and constructing it eagerly would add edge events to the
      // editor for every test run. Tests that exercise `createSuperDocUI`
      // call `window.__bootSuperDocUI()` after `superdocReady`.
      harnessWindow.__bootSuperDocUI = () => {
        if (!harnessWindow.superdocUI) {
          harnessWindow.superdocUI = createSuperDocUI({ superdoc });
        }
        return harnessWindow.superdocUI;
      };
      harnessWindow.superdocReady = true;
    },
  };

  if (file) {
    config.document = file;
  } else {
    applyContentOverride(config, content);
  }

  // Toolbar — pass selector string, not DOM element
  // (SuperToolbar.findElementBySelector expects a string)
  if (toolbar && toolbar !== 'none') {
    config.toolbar = '#toolbar';
  }

  if (responsiveToContainer) {
    config.modules = {
      ...(config.modules ?? {}),
      toolbar: { responsiveToContainer: true },
    };
  }

  // Comments
  if (comments === 'on' || comments === 'panel') {
    config.comments = { visible: true };
    if (comments === 'panel') {
      config.modules = {
        ...(config.modules ?? {}),
        comments: {
          ...((config.modules as Record<string, unknown> | undefined)?.comments as Record<string, unknown> | undefined),
        },
      };
    }
  } else if (comments === 'readonly') {
    config.comments = { visible: true, readOnly: true };
  } else if (comments === 'disabled') {
    // Explicitly disable the comments module (modules: { comments: false }).
    // This matches the customer config pattern that triggers different scroll behavior.
    config.modules = { ...(config.modules ?? {}), comments: false };
  }

  // Track changes — use the canonical modules.trackChanges surface so the
  // harness can exercise the replacements enum end-to-end.
  if (trackChanges || replacementsParam) {
    config.modules = {
      ...(config.modules ?? {}),
      trackChanges: {
        ...(trackChanges ? { visible: true } : {}),
        replacements,
      },
    };
  }

  // Selection in viewing mode
  if (allowSelectionInViewMode) {
    config.allowSelectionInViewMode = true;
  }

  // Document mode
  if (documentMode) {
    config.documentMode = documentMode;
  }

  instance = new SuperDoc(config);
  if (commentsPanel) {
    commentsPanel.classList.toggle('is-visible', comments === 'panel');
    if (comments !== 'panel') commentsPanel.replaceChildren();
  }

  if (!showSelection) {
    const style = document.createElement('style');
    style.textContent = `
      .superdoc-selection-overlay,
      .superdoc-caret { display: none !important; }
    `;
    document.head.appendChild(style);
  }
}

const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
if (!fileInput) {
  throw new Error('Behavior harness requires an input[type="file"] element.');
}

fileInput.addEventListener('change', (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) init(file);
});

harnessWindow.behaviorHarnessInit = (input?: ContentOverrideInput) => {
  init(undefined, input);
};

init(undefined, { contentOverride, overrideType });
