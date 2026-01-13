# SuperDoc
## SuperDoc: Creating a custom mark

An example of creating a custom Mark to use with SuperDoc.
Note: Requires `SuperDoc 0.10.15` or later

[We create a custom mark here](https://github.com/superdoc-dev/superdoc/blob/main/examples/customization/custom-mark/src/custom-mark.js)
Note that we added a custom command to the mark, called setMyCustomMark. We can now insert this mark by calling this command from `superdoc.activeEditor.commands`

[Then we can pass it into the editor via the `editorExtensions` key](https://github.com/superdoc-dev/superdoc/blob/main/examples/customization/custom-mark/src/App.vue#L20)

## Exporting the docx
This example also shows one way to export the docx to a blob whenever the content changes in the editor
