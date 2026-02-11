import { Extensions, SuperDoc } from 'superdoc';
import 'superdoc/style.css';
import './style.css';
import catSvg from './icon_cat.svg?raw';

import { Plugin, PluginKey } from 'prosemirror-state';

const { Node, Attribute } = Extensions;

// Creating a custom node for inserting cat GIFs
const catNode = Node.create({
    name: 'gifNode',
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    content: '',
  
    // Add static node options here
    addOptions() {
      return {
        htmlAttributes: {
          class: 'gif-node',
        },
      };
    },
  
    // Add custom node attributes here
    addAttributes() {
      return {
        src: {
          default: null,

          // The DOM attribute to be used for this node attribute
          parseDOM: (elem) => elem.getAttribute('src'),

          // Tell the node how to render this attribute in the DOM
          renderDOM: ({ src }) => {
            if (!src) {
                throw new Error('GIF node requires a src attribute');
            }
            return { src };
          },
        }
      };
    },

    // Tell the editor how to parse this node from the DOM
    parseDOM() {
        return [{
            tag: `img[data-node-type="${this.name}"]`,
        }];
    },

    // Tell the editor how to render this node in the DOM
    renderDOM({ htmlAttributes }) {
        return ['img', Attribute.mergeAttributes(this.options.htmlAttributes, htmlAttributes), 0];
    },

    // Add custom commands here
    addCommands() {
      return {
        insertCatGIF: () => ({ commands }) => {
            return commands.insertContent({
                type: this.name,
                attrs: { src: "https://edgecats.net/first" },
            });
        },
      };
    },
    // Add a ProseMirror plugin to handle click events on the node
    // and load a new GIF (just an example, it may not apply to your use case :D)
    addPmPlugins() {
        return [
            new Plugin({
                key: new PluginKey('gifNodePlugin'),
                props: {
                    handleClickOn: (view, pos, node, nodePos, event, direct) => {
                        if (!direct || node.type.name !== catNode.name) {
                            // Only handle direct clicks on the node
                            return false;
                        }
                        // Update the node's src attribute to a new URL with a timestamp to force reload
                        const transaction = view.state.tr.setNodeMarkup(
                            nodePos,
                            undefined,
                            { src: `https://edgecats.net/first?ts=${new Date().getTime()}` } // New attributes
                        )
                        view.dispatch(transaction)
                    }
                },
            })
        ];
    }
  });

// Initialize SuperDoc
let editor = null;

function initializeEditor(file = null) {
  // Cleanup previous instance if it exists
  if (editor) {
    editor = null;
  }

  editor = new SuperDoc({
    selector: '#superdoc',
    toolbar: '#superdoc-toolbar',
    document: file, // URL, File or document config
    documentMode: 'editing',
    pagination: true,
    rulers: true,
    editorExtensions:[catNode],
    onReady: (event) => {
      console.log('SuperDoc is ready', event);
    },
    onEditorCreate: (event) => {
      console.log('Editor is created', event);
    },
    modules: {
      toolbar: {
        customButtons: [{
          type: 'button',
          name: 'insertCatGIF',
          tooltip: 'Insert a cute cat GIF',
          icon: catSvg,
          group: 'center',
          command: () => {
            editor.activeEditor.commands.insertCatGIF();
          }
        }]
      }
    }
  });
}

// Setup file input handling
const fileInput = document.getElementById('fileInput');
const loadButton = document.getElementById('loadButton');

loadButton.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  if (file) {
    initializeEditor(file);
  }
});

// Initialize empty editor on page load
initializeEditor();
