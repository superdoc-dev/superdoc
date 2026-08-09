/**
 * Consumer typecheck: `ui.toolbar` accepts `fonts`, `customButtons`,
 * `showFormattingMarksButton`, and `showTableOfContentsButton`.
 *
 * `normalizeUiConfig` passes the whole `ui.toolbar` bag through to
 * `createBuiltInToolbar`, so an option missing from `UIConfig` still works at
 * runtime and fails the consumer's build. The legacy `modules.toolbar` type
 * ends in `& Record<string, unknown>` and hides that; the canonical type does
 * not, so it needs each option named.
 *
 * This covers those four. It is not a completeness check: nothing here fails
 * when a fifth runtime-honored option goes undeclared.
 */
import type { Config } from 'superdoc';

const _fullToolbar: Config = {
  selector: '#editor',
  ui: {
    toolbar: {
      container: '#toolbar',
      // Dropdown rows, not families to load. `#resolveToolbarFonts` returns a
      // consumer list verbatim, and the toolbar applies `label` to the
      // selection while tracking the choice by `key`, so both are required:
      // an entry missing either renders a blank row or an undefined command
      // value rather than a degraded-but-working option.
      fonts: [{ label: 'Inter', key: 'Inter, sans-serif' }],
      // The inline callback is the case worth covering: the runtime hands it
      // the controller's command context, so destructuring it must not fall
      // back to `any`. `item` stays `unknown` because it is the live Vue
      // reactive handle (#1098).
      //
      // The entries are written the way the runtime wants them -- `type`, a
      // trigger, rows for the dropdown -- but the type does not yet enforce
      // that. Which of those are required is the contract #1098 owns, and
      // deciding it needs rendered-behavior tests rather than the constructor's
      // say-so.
      customButtons: [
        {
          type: 'button',
          name: 'exportToWorkflow',
          tooltip: 'Export',
          icon: '<svg />',
          command: ({ execute }) => execute('doc.save'),
        },
        // A string command id is the other supported form, routed through the
        // shared controller rather than registered as a new command.
        {
          type: 'button',
          name: 'clearFormatting',
          tooltip: 'Clear formatting',
          icon: '<svg />',
          command: 'clear-formatting',
        },
        // `option` is the selected row, which the callback reads without a
        // cast.
        {
          type: 'dropdown',
          name: 'insertTemplate',
          tooltip: 'Insert template',
          label: 'Templates',
          options: [
            { label: 'Invoice', key: 'invoice' },
            { label: 'Contract', key: 'contract' },
          ],
          command: ({ option }) => option?.key,
        },
      ],
      showFormattingMarksButton: true,
      showTableOfContentsButton: true,
    },
  },
};

void _fullToolbar;
