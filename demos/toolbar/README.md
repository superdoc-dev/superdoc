# SuperDoc
## SuperDoc: Customizing the Toolbar

An example of how to add a custom button to the SuperDoc toolbar. This custom button inserts a random cat GIF into the document which is fetched from [https://edgecats.net](https://edgecats.net).

[We define the custom button in the `modules.toolbar.customButtons` option here](https://github.com/superdoc-dev/superdoc/blob/develop/examples/customization/toolbar/src/main.js#L122-L131)

The button's action is to insert a custom `catNode`. [The custom node is defined here](https://github.com/superdoc-dev/superdoc/blob/develop/examples/customization/toolbar/src/main.js#L11)

[The custom node is then passed to the editor via the `editorExtensions` option](https://github.com/superdoc-dev/superdoc/blob/develop/examples/customization/toolbar/src/main.js#L113)

[Finally, we define a Prosemirror plugin that listens to click events on the custom node](https://github.com/superdoc-dev/superdoc/blob/develop/examples/customization/toolbar/src/main.js#L75-L92)
