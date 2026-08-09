/**
 * Consumer typecheck: v2 root "superdoc" entry point.
 *
 * Exercises the supported runtime values and representative public types
 * exposed by the root facade. Removed v1 subpaths are covered by the
 * v2-only resolution snapshot family, not by positive imports here.
 */
import {
  BlankDOCX,
  DOCX,
  HTML,
  PDF,
  SuperDoc,
  buildTheme,
  compareVersions,
  createTheme,
  defineSuperDocExtension,
  getFileObject,
} from 'superdoc';

import type {
  AwarenessState,
  Config,
  Document,
  DocumentMode,
  ExportParams,
  SearchMatch,
  SuperDocExtension,
  SuperDocExtensionContext,
  SuperDocReadyPayload,
  SuperDocState,
  BorrowedSuperDocUI,
  SuperDocUI,
  SuperDocVisibleRange,
  SuperDocVisualApi,
  SuperDocVisualHandle,
  SuperDocVisualOptions,
  SuperDocVisualTarget,
  SuperDocViewportMetrics,
  SuperDocZoomState,
  SurfaceRequest,
  UpgradeToCollaborationOptions,
  ViewingVisibilityConfig,
} from 'superdoc';

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertNotAny<T> = IsAny<T> extends true ? never : true;

const _SuperDoc: AssertNotAny<typeof SuperDoc> = true;
const _createTheme: AssertNotAny<typeof createTheme> = true;
const _buildTheme: AssertNotAny<typeof buildTheme> = true;
const _defineExtension: AssertNotAny<typeof defineSuperDocExtension> = true;
const _getFileObject: AssertNotAny<typeof getFileObject> = true;
const _compareVersions: AssertNotAny<typeof compareVersions> = true;
const _BlankDOCX: AssertNotAny<typeof BlankDOCX> = true;

const _mimeTypes: string[] = [DOCX, PDF, HTML];

const config: Config = {
  selector: '#editor',
  documentMode: 'editing',
};

// Both documented mount forms must typecheck for `selector` and `toolbar`.
// The runtime toolbar resolver accepts a selector string or an element
// (`internal/toolbar/built-in/general.js`), so the public type must too.
declare const toolbarElement: HTMLElement;
const _mountBySelector: Config = { selector: '#editor', toolbar: '#toolbar' };
const _mountByElement: Config = { selector: toolbarElement, toolbar: toolbarElement };

// The nested selector is deliberately narrower: `findElementBySelector` is
// only reached with a string there. Widening the top-level `toolbar` must not
// silently widen this one.
const _nestedSelectorRejectsElement: Config = {
  selector: '#editor',
  // @ts-expect-error modules.toolbar.selector accepts a string selector only
  modules: { toolbar: { selector: toolbarElement } },
};

// Omitting `document` is supported: SuperDoc seeds a blank DOCX.
const _blankDocument: Config = { selector: '#editor' };

const instance = new SuperDoc(config);

const documentMode: DocumentMode = 'viewing';
const exportParams: ExportParams = { exportType: ['docx'] };
const state: SuperDocState = instance.state;
const viewingVisibility: ViewingVisibilityConfig = { visible: true };

// `instance.ui` is the documented custom-UI entry point, so it must resolve
// from the root entry alone — no `superdoc/ui` import and no `any` collapse.
// It is the *borrowed* handle: the instance owns teardown.
const ui: BorrowedSuperDocUI = instance.ui;

// The ownership rule is enforced by the type, not by documentation. A consumer
// destroying the instance's controller would freeze command state for the
// built-in toolbar and every other reader, so the method is not on this type.
// @ts-expect-error `destroy()` belongs to the owner; `superdoc.destroy()` does it.
instance.ui.destroy();

// The owned form still has it, because `createSuperDocUI()` hands over ownership.
declare const ownedController: SuperDocUI;
ownedController.destroy();

// The canonical first thing an application does with it: observe comments.
// `observe` hands back an unsubscribe function.
const stopObservingComments: () => void = ui.comments.observe((comments) => {
  const total: number = comments.total;
  const status: 'ready' | 'pending' | 'stale' = comments.listStatus;
  void [total, status];
});

// A command handle carries state, an unsubscribe-returning observer, and
// execution. Annotating each member is the point: a collapsed handle type
// would still satisfy a bare `void ui.commands.get('bold')`.
const bold = ui.commands.get('bold');
const boldEnabled: boolean = bold.getState().enabled;
const boldActive: boolean = bold.getState().active;
const stopObservingBold: () => void = bold.observe((commandState) => void commandState.enabled);
const boldExecution: Promise<unknown> = ui.commands.executeAsync('bold');

// The exact shape the custom-UI docs teach: bind in `onReady` and read the
// controller off the payload's instance. This is a separate assertion from
// `instance.ui` above because the payload is a different type; if `onReady`
// ever stops carrying a fully typed instance, the published example breaks and
// this is what catches it.
new SuperDoc({
  selector: '#editor',
  onReady: ({ superdoc: readySuperDoc }) => {
    const readyUi: BorrowedSuperDocUI = readySuperDoc.ui;
    const readyBoldEnabled: boolean = readyUi.commands.get('bold').getState().enabled;
    void readyBoldEnabled;
  },
});

declare const document: Document;
declare const awareness: AwarenessState;
declare const searchMatch: SearchMatch;
declare const viewportMetrics: SuperDocViewportMetrics;
declare const zoomState: SuperDocZoomState;
declare const readyPayload: SuperDocReadyPayload;
declare const extension: SuperDocExtension;
declare const extensionContext: SuperDocExtensionContext;
declare const visibleRange: SuperDocVisibleRange;
declare const surfaceRequest: SurfaceRequest;
declare const upgradeOptions: UpgradeToCollaborationOptions;

// The headline beginner path: one query + one `replace(...)` builds a search
// highlight. Also exercises per-target overrides and the advanced low-level
// `ctx.decorations.register(...)` provider, which must remain compatible.
const searchHighlights: SuperDocExtension = defineSuperDocExtension({
  id: 'acme.search',
  activate(ctx) {
    const visualApi: SuperDocVisualApi = ctx.visuals;
    const options: SuperDocVisualOptions = { className: 'acme-hl', data: { source: 'search' }, scope: 'text' };
    const highlights: SuperDocVisualHandle = visualApi.highlight('matches', options);

    ctx.commands.register({
      id: 'acme.search.refresh',
      async execute({ doc }) {
        const result = await doc.query.match({ select: { type: 'text', pattern: 'ACME' } });
        const targets: SuperDocVisualTarget[] = result.items.map((item) => item.target);
        highlights.replace(targets);
        // Per-target override layered through the same handle.
        highlights.add([{ target: result.items[0]!.target, className: 'acme-hl-strong' }]);
      },
    });

    ctx.onMutation({ affects: ['text'] }, () => highlights.invalidate());

    // Advanced escape hatch still type-checks.
    ctx.decorations.register({
      id: 'acme.search.lowlevel',
      provide: ({ visible }) =>
        ctx.anchors
          .collection('acme.search.lowlevel')
          .visibleIn(visible)
          .map((anchor) => ({ type: 'text', anchor, className: 'acme-hl' })),
    });
  },
});

void [
  _SuperDoc,
  _mountBySelector,
  _mountByElement,
  _nestedSelectorRejectsElement,
  _blankDocument,
  _createTheme,
  _buildTheme,
  _defineExtension,
  _getFileObject,
  _compareVersions,
  _BlankDOCX,
  _mimeTypes,
  documentMode,
  exportParams,
  state,
  viewingVisibility,
  ui,
  stopObservingComments,
  boldEnabled,
  boldActive,
  stopObservingBold,
  boldExecution,
  document,
  awareness,
  searchMatch,
  viewportMetrics,
  zoomState,
  readyPayload,
  extension,
  extensionContext,
  visibleRange,
  surfaceRequest,
  upgradeOptions,
  searchHighlights,
];
