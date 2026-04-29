import { SuperDocEditor } from '@superdoc-dev/react';
import '@superdoc-dev/react/style.css';
import { useSetSuperDoc } from '../lib/SuperDocUIProvider';

const CURRENT_USER = { name: 'Alex Rivera', email: 'alex@example.com' };

// Disable SuperDoc's built-in comments UI. The custom sidebar drives
// comments entirely through `ui.comments` — leaving the default UI on
// would mean both the floating trigger and the custom card render at
// once, which is the "double UI" footgun consumers asking about
// drop-in always hit first.
const MODULES = { comments: false as const };

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

  return (
    <SuperDocEditor
      document="/sample-review.docx"
      documentMode="editing"
      user={CURRENT_USER}
      modules={MODULES}
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
