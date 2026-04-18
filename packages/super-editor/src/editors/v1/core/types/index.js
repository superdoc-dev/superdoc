/**
 * @typedef {Object} EditorNodeConfig
 * @property {String} name The node name.
 * @property {String} [group] The node group.
 * @property {Object} [options] The node options.
 * @property {Boolean} [atom=false] Whether the node is an atom node.
 * @property {Boolean} [draggable=false] Whether the node is draggable.
 * @property {Boolean} [isolating=false] Whether the node is isolating.
 * @property {Boolean} [defining=false] Whether the node is defining.
 * @property {Boolean} [topNode=false] Whether the node is a top-level node.
 * @property {String} [tableRole] The role of the node in a table.
 * @property {Function | String} [content] ProseMirror string for what content this node accepts.
 * @property {String} [marks] The marks applied to this node.
 * @property {Boolean} [inline=false] Whether the node is an inline node.
 * @property {Boolean} [selectable=true] Whether the node is selectable.
 * @property {import('prosemirror-model').NodeType} [type] The node type.
 * @property {import('../Editor').Editor} [editor] The editor instance.
 * @property {Function} [parseDOM] The DOM parsing rules.
 * @property {Function} [renderDOM] The DOM rendering function.
 * @property {Function} [addOptions] Function or object to add options to the node.
 * @property {Function} [addStorage] Function or object to add storage to the node.
 * @property {Function} [addAttributes] Function or object to add attributes to the node.
 * @property {Function} [addCommands] Function or object to add commands to the node.
 * @property {Function} [addHelpers] Function or object to add helpers to the node.
 * @property {Function} [addShortcuts] Function or object to add shortcuts to the node.
 * @property {Function} [addInputRules] Function or object to add input rules to the node.
 * @property {Function} [addNodeView] Function to add a custom node view to the node.
 * @property {Function} [addPmPlugins] Function to add ProseMirror plugins to the node.
 * @property {Function} [extendNodeSchema] Function to extend the ProseMirror node schema.
 */

/**
 * @typedef {Object} EditorNodeOptions
 */

/**
 * @typedef {Object} EditorNodeStorage
 */

/**
 * Config required to construct an OxmlNode
 * (extends EditorNodeConfig)
 * @typedef {EditorNodeConfig & { oXmlName: string, childToAttributes: string[] }} OxmlNodeConfig
 */

/**
 * Runtime shape of an OxmlNode instance
 * (extends EditorNode)
 * @typedef {import('../Node').Node & {
 *   oXmlName: string,
 *   readonly validChildren: string[],
 * }} OxmlNode
 */

export {};
