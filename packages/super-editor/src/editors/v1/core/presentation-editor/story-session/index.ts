/**
 * Public entry point for the story-session module.
 *
 * See `plans/story-backed-parts-presentation-editing.md`.
 */

export type { StoryPresentationSession, ActivateStorySessionOptions, StoryCommitPolicy } from './types.js';

export {
  StoryPresentationSessionManager,
  type StoryPresentationSessionManagerOptions,
  type StorySessionEditorFactory,
  type StorySessionEditorFactoryInput,
  type StorySessionEditorFactoryResult,
} from './StoryPresentationSessionManager.js';

export {
  createStoryHiddenHost,
  STORY_HIDDEN_HOST_CLASS,
  STORY_HIDDEN_HOST_WRAPPER_CLASS,
  type CreateStoryHiddenHostOptions,
} from './createStoryHiddenHost.js';
