import { SuperDocEditor } from '@superdoc-dev/react';
import '@superdoc-dev/react/style.css';
import { useSetSuperDoc } from 'superdoc/ui/react';

const CURRENT_USER = { name: 'Alex Rivera', email: 'alex@example.com' };

// Telemetry opt-out is the default the example demonstrates. The
// SuperDoc default is `enabled: true`; consumers building their own
// privacy / consent story typically want it disabled until that path
// is wired.
const TELEMETRY = { enabled: false as const };

// NOTE on `modules: { comments: false }`. The example previously set
// this to hide SuperDoc's built-in floating-comment UI, but the flag
// ALSO short-circuits comment-data ingest (`use-document.js` line 88),
// so any comments imported from the source DOCX never reach the
// commentsStore and `host.export()` writes them out as an empty list.
// Round-trip drops every imported comment. Until SuperDoc adds a
// "hide UI without disabling storage" option, the example leaves the
// default config in place: comments load, export round-trips, and
// the built-in floating UI is hidden via CSS / `contained` layout
// instead.

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

  return (
    <SuperDocEditor
      document="/sample-review.docx"
      documentMode="editing"
      user={CURRENT_USER}
      telemetry={TELEMETRY}
      hideToolbar
      contained
      style={{ height: '100%' }}
      onReady={({ superdoc }: { superdoc: unknown }) => {
        setSuperDoc(superdoc);
      }}
    />
  );
}
