export type ToolbarDemoStrategy = 'groups' | 'excludeItems' | 'customButtons';
export type CommentsDemoLayout = 'auto' | 'sidebar' | 'inline';
export type CommentsDemoLevel = 'read' | 'write' | 'resolve';
export type ContextMenuDemoStrategy = 'default' | 'custom';
export type HyperlinkDemoBehavior = 'default' | 'none' | 'custom';

export type BuiltInDemoChoice<T extends string> = {
  id: T;
  label: string;
};

export const toolbarDemoGroups = {
  left: ['undo', 'redo'],
  center: ['bold', 'italic', 'underline', 'link'],
  right: ['documentMode', 'zoom'],
} as const;

export const toolbarDemoExcludedItems = ['bold', 'italic'] as const;

export const toolbarDemoStrategies = [
  { id: 'groups', label: 'Group' },
  { id: 'excludeItems', label: 'Remove' },
  { id: 'customButtons', label: 'Add' },
] as const satisfies readonly BuiltInDemoChoice<ToolbarDemoStrategy>[];

export const commentsDemoLayouts = [
  { id: 'auto', label: 'Auto' },
  { id: 'sidebar', label: 'Sidebar' },
  { id: 'inline', label: 'Inline' },
] as const satisfies readonly BuiltInDemoChoice<CommentsDemoLayout>[];

export const commentsDemoLevels = [
  { id: 'read', label: 'Read' },
  { id: 'write', label: 'Write' },
  { id: 'resolve', label: 'Resolve' },
] as const satisfies readonly BuiltInDemoChoice<CommentsDemoLevel>[];

export const contextMenuDemoStrategies = [
  { id: 'default', label: 'Default' },
  { id: 'custom', label: 'Add action' },
] as const satisfies readonly BuiltInDemoChoice<ContextMenuDemoStrategy>[];

export const hyperlinkDemoBehaviors = [
  { id: 'default', label: 'Default' },
  { id: 'none', label: 'Do nothing' },
  { id: 'custom', label: 'Custom action' },
] as const satisfies readonly BuiltInDemoChoice<HyperlinkDemoBehavior>[];

export function renderBuiltInEditorDemoMarkdown(
  preset: 'comments' | 'context-menu' | 'hyperlinks' | 'search' | 'toolbar',
) {
  if (preset === 'toolbar') {
    return [
      'Toolbar configurations available in the interactive Editor:',
      '',
      `- **Group — \`ui.toolbar.groups\`:** show only ${Object.values(toolbarDemoGroups).flat().join(', ')} across the left, center, and right regions.`,
      `- **Remove — \`ui.toolbar.excludeItems\`:** start with the default toolbar and remove ${toolbarDemoExcludedItems.join(' and ')}.`,
      '- **Add — `ui.toolbar.customButtons`:** add an **Add note** action to the grouped toolbar. Place the caret in the document and run it to insert `Review note: `.',
      '',
      'Changing a toolbar configuration recreates the Editor from its current DOCX. Document edits and document mode remain; transient selection and toolbar state reset.',
    ].join('\n');
  }

  if (preset === 'comments') {
    return [
      'Comment configurations available in the interactive Editor:',
      '',
      '- **Layout — `ui.comments.displayMode`:** choose `auto`, `sidebar`, or `inline`. Auto selects sidebar or inline from the Editor width.',
      '- **Actions — `interaction.comments.level`:** choose `read`, `write`, or `resolve`. Read shows threads without mutation controls. Write adds create, reply, edit, and delete. Resolve also adds resolve and reopen.',
      '',
      'The sample contains one comment thread anchored to `September 30, 2026`. Changing either option recreates the Editor from its current DOCX. Thread changes remain; the open comment and selection reset.',
    ].join('\n');
  }

  if (preset === 'context-menu') {
    return [
      'Context-menu configurations available in the interactive Editor:',
      '',
      '- **Menu — `ui.contextMenu`:** choose **Default** or **Add action**. Add action keeps SuperDoc’s menu items and appends **Send selection to workflow** when you right-click selected text.',
      '',
      'Changing the menu configuration recreates the Editor from its current DOCX. Document edits remain; transient selection and menu state reset.',
    ].join('\n');
  }

  if (preset === 'hyperlinks') {
    return [
      'Hyperlink behaviors available in the interactive Editor:',
      '',
      '- **Default:** SuperDoc opens its built-in hyperlink editor in Editing and Suggesting modes.',
      '- **Do nothing — `hyperlinks: false`:** activation has no effect.',
      '- **Custom action — `hyperlinks.onActivate`:** your application renders an action beside the hyperlink.',
      '',
      'The fixture contains one real external hyperlink. Changing the behavior recreates the Editor from its current DOCX.',
    ].join('\n');
  }

  return [
    'Search configurations available in the interactive Editor:',
    '',
    '- **Mode — `documentMode`:** Editing allows replacement. Search remains available in Viewing, but replace controls are hidden.',
    '- **Replacement — `ui.search.replaceEnabled`:** choose On or Off. Off removes replacement in every document mode.',
    '',
    'The three-page fixture has eight case-insensitive `Client` matches and seven case-sensitive matches. Moving between results scrolls the Editor to each match. Changing replacement recreates the Editor from its current DOCX. Document edits and document mode remain; the active search resets.',
  ].join('\n');
}
