import 'superdoc/style.css';
import { SuperDoc } from 'superdoc';

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

if (!showCaret) {
  document.documentElement.style.setProperty('caret-color', 'transparent', 'important');
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
