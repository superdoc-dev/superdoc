import type { Plugin } from 'prosemirror-state';
import type { EditorState, Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { Editor } from './Editor.js';

/**
 * Match result from input rule matching
 */
export interface InputRuleMatch extends Array<string> {
  index?: number;
  input?: string;
  data?: unknown;
}

/**
 * Input rule handler context
 */
export interface InputRuleHandlerContext {
  state: EditorState;
  range: {
    from: number;
    to: number;
  };
  match: InputRuleMatch;
  commands: Record<string, (...args: unknown[]) => boolean>;
  chain: () => unknown;
  can: () => unknown;
}

/**
 * Input rule configuration
 */
export interface InputRuleConfig {
  match: RegExp | ((text: string) => InputRuleMatch | null);
  handler: (context: InputRuleHandlerContext) => unknown;
}

/**
 * Input rule class
 */
export class InputRule {
  match: RegExp | ((text: string) => InputRuleMatch | null);
  handler: (context: InputRuleHandlerContext) => unknown;

  constructor(config: InputRuleConfig);
}

/**
 * Input rules plugin configuration
 */
export interface InputRulesPluginConfig {
  editor: Editor;
  rules: InputRule[];
}

/**
 * Create an input rules plugin
 */
export function inputRulesPlugin(config: InputRulesPluginConfig): Plugin;

/**
 * Check if HTML is from Microsoft Word
 */
export function isWordHtml(html: string): boolean;

/**
 * Handle HTML paste events
 */
export function handleHtmlPaste(html: string, editor: Editor, source?: string): boolean;

/**
 * Handle HTML content before insertion
 */
export function htmlHandler(html: string, editor: Editor, domDocument?: Document | null): DocumentFragment;

/**
 * Convert em units to pt units in font-size
 */
export function convertEmToPt(html: string): string;

/**
 * Clean and sanitize HTML content
 */
export function cleanHtmlUnnecessaryTags(html: string): string;

/**
 * Sanitize HTML and remove forbidden tags
 */
export function sanitizeHtml(html: string, forbiddenTags?: string[], domDocument?: Document | null): DocumentFragment;

/**
 * Handle clipboard paste events
 */
export function handleClipboardPaste(params: { editor: Editor; view: EditorView }, html: string): boolean;
