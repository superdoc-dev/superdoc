import { keymap } from 'prosemirror-keymap';
import { Schema } from './Schema.js';
import { Attribute } from './Attribute.js';
import { getNodeType } from './helpers/getNodeType.js';
import { getExtensionConfigField } from './helpers/getExtensionConfigField.js';
import { getSchemaTypeByName } from './helpers/getSchemaTypeByName.js';
import { callOrGet } from './utilities/callOrGet.js';
import { isExtensionRulesEnabled } from './helpers/isExtentionRulesEnabled.js';
import { inputRulesPlugin } from './InputRule.js';

const PERF_PLUGIN_LOG_THRESHOLD_MS = 1;

const perfNow = () => {
  const perf = globalThis?.performance;
  return perf?.now ? perf.now() : Date.now();
};

const getPluginLabel = (plugin, fallbackLabel) => {
  const key = plugin?.spec?.key?.key || plugin?.key?.key;
  if (key) return key;
  if (fallbackLabel) return fallbackLabel;
  return 'pm-plugin';
};

const logPluginPerf = (kind, label, duration, editor) => {
  if (duration < PERF_PLUGIN_LOG_THRESHOLD_MS) return;
  const txnId = typeof editor?.getPerfTxnId === 'function' ? editor.getPerfTxnId() : null;
  const txnLabel = Number.isFinite(txnId) ? `#${txnId}` : '';
  console.log(`[Perf] pm.${kind}${txnLabel} ${label}: ${duration.toFixed(2)}ms`);
};

const instrumentPmPlugin = (plugin, label, editor) => {
  if (!plugin || !plugin.spec) return plugin;
  const pluginLabel = getPluginLabel(plugin, label);
  const { spec } = plugin;

  if (spec.state?.apply && !spec.state.apply.__sdPerfWrapped) {
    const originalApply = spec.state.apply;
    spec.state.apply = function applyWithPerf(tr, value, oldState, newState) {
      const start = perfNow();
      const result = originalApply.call(this, tr, value, oldState, newState);
      const duration = perfNow() - start;
      logPluginPerf('apply', pluginLabel, duration, editor);
      return result;
    };
    spec.state.apply.__sdPerfWrapped = true;
  }

  if (typeof spec.appendTransaction === 'function' && !spec.appendTransaction.__sdPerfWrapped) {
    const originalAppend = spec.appendTransaction;
    spec.appendTransaction = function appendWithPerf(transactions, oldState, newState) {
      const start = perfNow();
      const result = originalAppend.call(this, transactions, oldState, newState);
      const duration = perfNow() - start;
      logPluginPerf('appendTransaction', pluginLabel, duration, editor);
      return result;
    };
    spec.appendTransaction.__sdPerfWrapped = true;
  }

  if (typeof spec.filterTransaction === 'function' && !spec.filterTransaction.__sdPerfWrapped) {
    const originalFilter = spec.filterTransaction;
    spec.filterTransaction = function filterWithPerf(tr, state) {
      const start = perfNow();
      const result = originalFilter.call(this, tr, state);
      const duration = perfNow() - start;
      logPluginPerf('filterTransaction', pluginLabel, duration, editor);
      return result;
    };
    spec.filterTransaction.__sdPerfWrapped = true;
  }

  if (typeof spec.props?.decorations === 'function' && !spec.props.decorations.__sdPerfWrapped) {
    const originalDecorations = spec.props.decorations;
    spec.props.decorations = function decorationsWithPerf(state) {
      const start = perfNow();
      const result = originalDecorations.call(this, state);
      const duration = perfNow() - start;
      logPluginPerf('decorations', pluginLabel, duration, editor);
      return result;
    };
    spec.props.decorations.__sdPerfWrapped = true;
  }

  if (typeof spec.view === 'function' && !spec.view.__sdPerfWrapped) {
    const originalView = spec.view;
    spec.view = function viewWithPerf(view) {
      const pluginView = originalView.call(this, view);
      if (pluginView && typeof pluginView.update === 'function' && !pluginView.update.__sdPerfWrapped) {
        const originalUpdate = pluginView.update;
        pluginView.update = function updateWithPerf(view, prevState) {
          const start = perfNow();
          const result = originalUpdate.call(this, view, prevState);
          const duration = perfNow() - start;
          logPluginPerf('view.update', pluginLabel, duration, editor);
          return result;
        };
        pluginView.update.__sdPerfWrapped = true;
      }
      if (pluginView && typeof pluginView.destroy === 'function' && !pluginView.destroy.__sdPerfWrapped) {
        const originalDestroy = pluginView.destroy;
        pluginView.destroy = function destroyWithPerf() {
          const start = perfNow();
          const result = originalDestroy.call(this);
          const duration = perfNow() - start;
          logPluginPerf('view.destroy', pluginLabel, duration, editor);
          return result;
        };
        pluginView.destroy.__sdPerfWrapped = true;
      }
      return pluginView;
    };
    spec.view.__sdPerfWrapped = true;
  }

  return plugin;
};

/**
 * ExtensionService is the main class to work with extensions.
 */
export class ExtensionService {
  editor;

  schema;

  extensions;

  externalExtensions = [];

  splittableMarks = [];

  constructor(extensions, userExtensions, editor) {
    this.editor = editor;

    this.externalExtensions = userExtensions || [];

    this.externalExtensions = this.externalExtensions.map((extension) => {
      return {
        ...extension,
        isExternal: true,
      };
    });

    this.extensions = ExtensionService.getResolvedExtensions([...extensions, ...this.externalExtensions]);
    this.schema = Schema.createSchemaByExtensions(this.extensions, editor);
    this.#setupExtensions();
  }

  /**
   * Static method for creating ExtensionService.
   * @param args Arguments for the constructor.
   */
  static create(...args) {
    return new ExtensionService(...args);
  }

  /**
   * Get an array of resolved extensions (e.g. sorted by priority).
   * @param extensions Array of extensions.
   * @returns Array of resolved extensions.
   */
  static getResolvedExtensions(extensions) {
    const resolvedExtensions = ExtensionService.sortByPriority(extensions);
    return resolvedExtensions;
  }

  /**
   * Sort extensions by priority.
   * @param extensions Array of extensions.
   * @returns Array of sorted extensions by priority.
   */
  static sortByPriority(extensions) {
    const defaultValue = 100;
    return extensions.sort((a, b) => {
      const priorityA = getExtensionConfigField(a, 'priority') || defaultValue;
      const priorityB = getExtensionConfigField(b, 'priority') || defaultValue;
      if (priorityA > priorityB) return -1;
      if (priorityA < priorityB) return 1;
      return 0;
    });
  }

  /**
   * Get all attributes defined in the extensions.
   * @returns Array of attributes.
   */
  get attributes() {
    return Attribute.getAttributesFromExtensions(this.extensions);
  }

  /**
   * Get all commands defined in the extensions.
   * @returns Object with commands (key - command name, value - function).
   */
  get commands() {
    let commandsObject = {};

    for (const extension of this.extensions) {
      const context = {
        name: extension.name,
        options: extension.options,
        storage: extension.storage,
        editor: this.editor,
        type: getSchemaTypeByName(extension.name, this.schema),
      };

      const addCommands = getExtensionConfigField(extension, 'addCommands', context);
      if (addCommands) {
        commandsObject = {
          ...commandsObject,
          ...addCommands(),
        };
      }
    }

    return commandsObject;
  }

  /**
   * Get all helper methods defined in the extensions.
   * Each extension can define its own helper methods.
   * Example: editor.helpers.linkedStyles.getStyles()
   * @returns {Object} Object with helper methods for extensions.
   */
  get helpers() {
    const helpersObject = {};

    for (const extension of this.extensions) {
      const name = extension.name;
      if (!name) continue;

      const context = {
        name: extension.name,
        options: extension.options,
        storage: extension.storage,
        editor: this.editor,
        type: getSchemaTypeByName(extension.name, this.schema),
      };

      const addHelpers = getExtensionConfigField(extension, 'addHelpers', context);

      if (addHelpers) {
        helpersObject[name] = addHelpers();
      }
    }

    return helpersObject;
  }

  /**
   * Get all PM plugins defined in the extensions.
   * And also keyboard shortcuts.
   * @returns Array of PM plugins.
   */
  get plugins() {
    const editor = this.editor;
    const extensions = ExtensionService.sortByPriority([...this.extensions].reverse());

    const inputRules = [];

    const allPlugins = extensions
      .map((extension) => {
        const context = {
          name: extension.name,
          options: extension.options,
          storage: extension.storage,
          editor,
          type: getSchemaTypeByName(extension.name, this.schema),
        };

        const plugins = [];

        const addShortcuts = getExtensionConfigField(extension, 'addShortcuts', context);

        let bindingsObject = {};

        if (addShortcuts) {
          const entries = Object.entries(addShortcuts()).map(([shortcut, method]) => {
            return [shortcut, (...args) => method({ editor, keymapArgs: args })];
          });
          bindingsObject = { ...Object.fromEntries(entries) };
        }

        plugins.push(instrumentPmPlugin(keymap(bindingsObject), `${extension.name}:keymap`, editor));

        const addInputRules = getExtensionConfigField(extension, 'addInputRules', context);

        if (isExtensionRulesEnabled(extension, editor.options.enableInputRules) && addInputRules) {
          inputRules.push(...addInputRules());
        }

        const addPmPlugins = getExtensionConfigField(extension, 'addPmPlugins', context);

        if (addPmPlugins) {
          const pmPlugins = addPmPlugins();
          pmPlugins.forEach((plugin, index) => {
            plugins.push(instrumentPmPlugin(plugin, `${extension.name}:pm${index}`, editor));
          });
        }

        return plugins;
      })
      .flat();

    return [
      instrumentPmPlugin(
        inputRulesPlugin({
          editor,
          rules: inputRules,
        }),
        'inputRules',
        editor,
      ),
      ...allPlugins,
    ];
  }

  /**
   * Get all node views from the extensions.
   * @returns An object with all node views.
   */
  get nodeViews() {
    const { editor } = this;
    const nodeExtensions = this.extensions.filter((e) => e.type === 'node');

    const entries = nodeExtensions
      .filter((extension) => !!getExtensionConfigField(extension, 'addNodeView'))
      .map((extension) => {
        const extensionAttrs = this.attributes.filter((a) => a.type === extension.name);
        const context = {
          name: extension.name,
          options: extension.options,
          storage: extension.storage,
          editor,
          type: getNodeType(extension.name, this.schema),
        };

        const addNodeView = getExtensionConfigField(extension, 'addNodeView', context);

        if (!addNodeView) return null;

        // Call addNodeView() to get the actual node view function
        // It may return null in headless mode or other scenarios
        const nodeViewFunction = addNodeView();

        if (!nodeViewFunction) return null;

        const nodeview = (node, _view, getPos, decorations) => {
          const htmlAttributes = Attribute.getAttributesToRender(node, extensionAttrs);
          return nodeViewFunction({
            editor,
            node,
            getPos,
            decorations,
            htmlAttributes,
            extension,
            extensionAttrs,
          });
        };

        return [extension.name, nodeview];
      })
      .filter(Boolean);

    return Object.fromEntries(entries);
  }

  /**
   * Install all extensions.
   * Create extension storage in the editor, attach editor events.
   */
  #setupExtensions() {
    for (const extension of this.extensions) {
      this.editor.extensionStorage[extension.name] = extension.storage;

      const context = {
        name: extension.name,
        options: extension.options,
        storage: extension.storage,
        editor: this.editor,
        type: getSchemaTypeByName(extension.name, this.schema),
      };

      if (extension.type === 'mark') {
        const keepOnSplit = callOrGet(getExtensionConfigField(extension, 'keepOnSplit', context)) ?? true;
        if (keepOnSplit) {
          this.splittableMarks.push(extension.name);
        }
      }

      this.#attachEditorEvents(extension);
    }
  }

  /**
   * Attach editor events to extension
   * if callbacks are defined in the extension config.
   * @param extension Extension.
   */
  #attachEditorEvents(extension) {
    const context = {
      name: extension.name,
      options: extension.options,
      storage: extension.storage,
      editor: this.editor,
      type: getSchemaTypeByName(extension.name, this.schema),
    };

    const onBeforeCreate = getExtensionConfigField(extension, 'onBeforeCreate', context);
    const onCreate = getExtensionConfigField(extension, 'onCreate', context);
    const onUpdate = getExtensionConfigField(extension, 'onUpdate', context);
    const onSelectionUpdate = getExtensionConfigField(extension, 'onSelectionUpdate', context);
    const onTransaction = getExtensionConfigField(extension, 'onTransaction', context);
    const onFocus = getExtensionConfigField(extension, 'onFocus', context);
    const onBlur = getExtensionConfigField(extension, 'onBlur', context);
    const onDestroy = getExtensionConfigField(extension, 'onDestroy', context);

    if (onBeforeCreate) this.editor.on('beforeCreate', onBeforeCreate);
    if (onCreate) this.editor.on('create', onCreate);
    if (onUpdate) this.editor.on('update', onUpdate);
    if (onSelectionUpdate) this.editor.on('selectionUpdate', onSelectionUpdate);
    if (onTransaction) this.editor.on('transaction', onTransaction);
    if (onFocus) this.editor.on('focus', onFocus);
    if (onBlur) this.editor.on('blur', onBlur);
    if (onDestroy) this.editor.on('destroy', onDestroy);
  }
}
