import { describe, expect, it } from 'bun:test';
import { buildReferenceDocsArtifacts } from './reference-docs-artifacts.js';

function artifactContentByPath(): Map<string, string> {
  return new Map(buildReferenceDocsArtifacts().map((file) => [file.path, file.content]));
}

describe('reference docs artifacts', () => {
  it('renders nullable primitive schema fields with valid type labels and example values', () => {
    const artifacts = artifactContentByPath();

    const trackedChangeGet = artifacts.get('apps/docs/document-api/reference/track-changes/get.mdx');
    expect(trackedChangeGet).toBeDefined();
    expect(trackedChangeGet!).toContain('| `pairedWithChangeId` | string \\| null | no |  |');
    expect(trackedChangeGet!).toContain('"pairedWithChangeId": null');

    const trackedChangeList = artifacts.get('apps/docs/document-api/reference/track-changes/list.mdx');
    expect(trackedChangeList).toBeDefined();
    expect(trackedChangeList!).toContain('| `in` | StoryLocator \\| `"all"` | no | One of: StoryLocator, `"all"` |');
    expect(trackedChangeList!).toContain('"pairedWithChangeId": null');

    const commentsGet = artifacts.get('apps/docs/document-api/reference/comments/get.mdx');
    expect(commentsGet).toBeDefined();
    expect(commentsGet!).toContain('| `deletedText` | string \\| null | no |  |');
    expect(commentsGet!).toContain('| `trackedChangeAnchorKey` | string \\| null | no |  |');
    expect(commentsGet!).toContain('| `trackedChangeDisplayType` | string \\| null | no |  |');
    expect(commentsGet!).toContain(
      '| `trackedChangeLink` | CommentTrackedChangeLink \\| null | no | One of: CommentTrackedChangeLink, null |',
    );
    expect(commentsGet!).toContain('| `trackedChangeText` | string \\| null | no |  |');
  });

  it('emits one generated file per reference doc path and keeps canonical content on shared pages', () => {
    const artifacts = artifactContentByPath();

    const manifest = JSON.parse(artifacts.get('apps/docs/document-api/reference/_generated-manifest.json') ?? '{}') as {
      files?: string[];
    };
    const applyEntries = (manifest.files ?? []).filter(
      (path) => path === 'apps/docs/document-api/reference/format/apply.mdx',
    );
    expect(applyEntries).toHaveLength(1);

    const formatApply = artifacts.get('apps/docs/document-api/reference/format/apply.mdx');
    expect(formatApply).toBeDefined();
    expect(formatApply!).toContain('title: format.apply');
    expect(formatApply!).toContain('- Operation ID: `format.apply`');
  });
});
