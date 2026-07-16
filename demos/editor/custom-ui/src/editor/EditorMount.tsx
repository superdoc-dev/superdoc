import { SuperDocEditor } from '@superdoc-dev/react';
import '@superdoc-dev/react/style.css';
import { useSetSuperDoc } from 'superdoc/ui/react';

const CURRENT_USER = { name: 'Alex Rivera', email: 'alex@example.com' };

// Disable SuperDoc's built-in floating-comment UI. The custom Activity
// sidebar drives comments through `ui.comments` instead, so the
// platform's bubble / floating composer / right-sidebar would just
// duplicate the consumer's UI surface.
//
// Imported comments still flow through the engine: `Editor.exportDocx`
// reads from `converter.comments` when no UI-store snapshot is
// passed, and `SuperDoc.exportEditorsToDOCX` no longer overrides
// that fallback with an empty array. The round-trip is preserved
// regardless of the UI flag.
//
// `trackChanges.replacements: 'independent'` opts out of the default
// 'paired' replacement model. With 'paired', a typed-over selection
// surfaces as a single review entity (the deletion half is folded
// into the insertion). With 'independent' each half gets its own id
// — matching the Word / ECMA-376 §17.13.5 revision model and what a
// review sidebar typically wants to render as two distinct rows.
const MODULES = {
  comments: false as const,
  trackChanges: { replacements: 'independent' as const },
};

// Telemetry opt-out is the default the example demonstrates. The
// SuperDoc default is `enabled: true`; consumers building their own
// privacy / consent story typically want it disabled until that path
// is wired.
const TELEMETRY = { enabled: false as const };

/**
 * Mounts `<SuperDocEditor>` and hands the running SuperDoc instance to
 * the {@link SuperDocUIProvider} once `onReady` fires. Everything
 * else in the demo (toolbar, sidebars, custom command registration)
 * binds to the controller from context — `useSuperDocUI()` returns
 * null until this component completes its first onReady callback.
 *
 * `contained` + `hideToolbar` let the wrapper sit inside a real
 * three-pane app layout instead of taking over the page. `style={{
 * height: '100%' }}` is part of that posture.
 */
export function EditorMount() {
  const setSuperDoc = useSetSuperDoc();
  const params = new URLSearchParams(window.location.search);
  const documentUrl = params.get('document') || '/sample-review.docx';

  return (
    <SuperDocEditor
      document={documentUrl}
      documentMode="editing"
      user={CURRENT_USER}
      modules={MODULES}
      telemetry={TELEMETRY}
      hideToolbar
      contained
      // Suppress the editor's built-in right-click menu; the demo
      // renders its own via `ContextMenu`, which opens against the
      // bundle from `ui.viewport.contextAt(...)` and dispatches via
      // `item.invoke()`.
      disableContextMenu
      style={{ height: '100%' }}
      onReady={({ superdoc }: { superdoc: unknown }) => {
        setSuperDoc(superdoc);
      }}
    />
  );
}
