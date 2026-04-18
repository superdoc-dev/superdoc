/**
 * Consumer typecheck: "superdoc/super-editor" sub-export.
 *
 * Verifies the facade entry point works for consumers
 * who import directly from the super-editor sub-path.
 */
import { Editor, PresentationEditor } from 'superdoc/super-editor';

const editor = new Editor({});
