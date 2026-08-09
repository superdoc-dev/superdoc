/**
 * The custom UI ownership boundary, drawn as an editor rather than a box diagram.
 *
 * Deliberately a server component: it holds no state and ships no JavaScript.
 * The live Bold demo below it on the page provides the interaction; this one's
 * only job is orientation.
 *
 * Two things the visual has to get right, both of which earlier drafts did not:
 *
 *   - The Editor owns its controller. `superdoc.ui` is published *by* the
 *     instance, so the diagram must not wrap the Editor in the controller.
 *   - `editor.doc` is a real second path. Document reads and mutations do not
 *     travel through the controller, so "everything goes through one surface"
 *     would be wrong.
 *
 * Solid borders are what SuperDoc renders; dashed blue is what the application
 * renders. That distinction carries the explanation, which is why the labels
 * stay short — the surrounding prose does the rest.
 */
export function CustomUiArchitecture() {
  return (
    <figure aria-labelledby='sd-cui-arch-title' className='sd-cui-arch' role='img'>
      <p className='sd-cui-arch-a11y' id='sd-cui-arch-title'>
        A SuperDoc editor renders a DOCX document in the centre. A toolbar above it and a comments panel beside it are
        rendered by the application. Reactive state — selection, command state, and comments — flows out of the editor
        to those controls, and commands and document operations flow back in.
      </p>

      <div className='sd-cui-arch-panel sd-cui-arch-yours sd-cui-arch-toolbar'>
        <h3>Your toolbar</h3>
        <div aria-hidden='true' className='sd-cui-arch-buttons'>
          <span className='sd-cui-arch-btn sd-cui-arch-btn-on' />
          <span className='sd-cui-arch-btn' />
          <span className='sd-cui-arch-btn' />
        </div>
      </div>

      <div className='sd-cui-arch-row'>
        <div className='sd-cui-arch-editor'>
          <div aria-hidden='true' className='sd-cui-arch-chrome'>
            <span className='sd-cui-arch-dot' />
            <span className='sd-cui-arch-dot' />
            <span className='sd-cui-arch-dot' />
          </div>
          <div aria-hidden='true' className='sd-cui-arch-canvas'>
            <div className='sd-cui-arch-page'>
              <span className='sd-cui-arch-line' style={{ width: '85%' }} />
              <span className='sd-cui-arch-line sd-cui-arch-line-selected' style={{ width: '60%' }} />
              <span className='sd-cui-arch-line' style={{ width: '92%' }} />
              <span className='sd-cui-arch-line' style={{ width: '74%' }} />
            </div>
          </div>
          <p className='sd-cui-arch-caption'>SuperDoc renders the document, layout, selection, and editing</p>
        </div>

        <div className='sd-cui-arch-panel sd-cui-arch-yours'>
          <h3>Your comments panel</h3>
          <p>renders from the comments snapshot</p>
        </div>
      </div>

      <div className='sd-cui-arch-flows'>
        <p className='sd-cui-arch-flow'>
          <span aria-hidden='true'>↑</span> <b>state out</b> — selection, command state, comments
        </p>
        <p className='sd-cui-arch-flow'>
          <span aria-hidden='true'>↓</span> <b>actions in</b> — commands and document operations
        </p>
      </div>
    </figure>
  );
}
