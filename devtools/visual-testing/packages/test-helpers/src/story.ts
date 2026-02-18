/**
 * Story definition helpers for SuperDoc visual testing.
 * Stories define interaction sequences that can be replayed and captured.
 */

import type { Page } from '@playwright/test';
import type { InteractionHelpers } from './interactions.js';

/**
 * Comment panel display mode.
 * - 'off': Comments disabled
 * - 'on': Comments enabled with inline highlights
 * - 'panel': Comments shown in side panel
 * - 'readonly': Comments visible but not editable
 */
export type CommentMode = 'off' | 'on' | 'panel' | 'readonly';

/**
 * Toolbar display mode.
 * - 'none': No toolbar
 * - 'minimal': Compact toolbar with essential actions
 * - 'full': Full toolbar with all actions
 */
export type ToolbarMode = 'none' | 'minimal' | 'full';

/**
 * Extended interaction helpers available within story runs.
 * Includes all base InteractionHelpers plus snapshot capabilities.
 */
export interface StoryHelpers extends InteractionHelpers {
  /**
   * Capture a milestone snapshot during the story.
   * @param suffix - Optional suffix for the snapshot name
   * @param description - Optional description of what this milestone represents
   */
  milestone: (suffix?: string, description?: string) => Promise<void>;
  /**
   * Capture a snapshot at the current state.
   * @param suffix - Optional suffix for the snapshot name
   * @param description - Optional description of the snapshot
   */
  snapshot: (suffix?: string, description?: string) => Promise<void>;
}

/**
 * Definition for an interaction story.
 * Stories describe a sequence of editor interactions for visual testing.
 */
export interface InteractionStory {
  /** Human-readable name for the story */
  name?: string;
  /** Detailed description of what this story tests */
  description?: string;
  /** Related ticket/issue numbers (e.g., ['SD-1558', 'IT-2001']) */
  tickets?: string[];
  /** Path to starting document, or null for empty editor */
  startDocument?: string | null;
  /** Viewport dimensions for the test */
  viewport?: { width: number; height: number };
  /** Whether to use the layout engine (presentation mode) */
  useLayoutEngine?: boolean;
  /** Whether to include comment functionality */
  includeComments?: boolean;
  /** Whether layout/pagination is enabled */
  layout?: boolean;
  /** Comment panel display mode */
  comments?: CommentMode;
  /** Toolbar display mode */
  toolbar?: ToolbarMode;
  /** Whether track changes is enabled */
  trackChanges?: boolean;
  /** Whether to wait for fonts to load before running */
  waitForFonts?: boolean;
  /** Whether to hide the text caret in screenshots */
  hideCaret?: boolean;
  /** Whether to hide selection highlighting in screenshots */
  hideSelection?: boolean;
  /** Whether the caret should blink (usually false for consistent screenshots) */
  caretBlink?: boolean;
  /** List of editor extensions to enable */
  extensions?: string[];
  /**
   * The story's main execution function.
   * @param page - Playwright page instance
   * @param helpers - Interaction and snapshot helpers
   */
  run: (page: Page, helpers: StoryHelpers) => Promise<void>;
}

/**
 * Define an interaction story with type checking.
 * This is a passthrough function that provides TypeScript type inference.
 * @param story - The story definition
 * @returns The same story definition (enables type inference)
 */
export function defineStory(story: InteractionStory): InteractionStory {
  return story;
}
