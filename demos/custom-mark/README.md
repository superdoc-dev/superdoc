# SuperDoc: Creating a Custom Mark

An example of creating a custom Mark to use with SuperDoc.

[We create a custom mark here](https://github.com/superdoc-dev/superdoc/blob/main/demos/custom-mark/src/custom-mark.js) — note the custom command `setMyCustomMark`, which can be called from `superdoc.activeEditor.commands`.

[Then we pass it into the editor via the `editorExtensions` key](https://github.com/superdoc-dev/superdoc/blob/main/demos/custom-mark/src/App.vue)

This example also shows one way to export the docx to a blob whenever the content changes in the editor.
