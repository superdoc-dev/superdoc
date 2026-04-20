# SuperDoc: Customizing the Toolbar

An example of how to add a custom button to the SuperDoc toolbar. This custom button inserts a random cat GIF into the document.

[We define the custom button in the `modules.toolbar.customButtons` option](https://github.com/superdoc-dev/superdoc/blob/main/demos/toolbar/src/main.js)

The button's action is to insert a custom `catNode`. [The custom node and its Prosemirror click-handler plugin are defined in the same file](https://github.com/superdoc-dev/superdoc/blob/main/demos/toolbar/src/main.js).

It is also possible to fully replace the toolbar with your own: [Headless Toolbar](https://docs.superdoc.dev/modules/toolbar/overview#learn-more)

More customization options here: https://docs.superdoc.dev/modules/toolbar/overview
