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
    expect(trackedChangeGet!).toContain('| `pairedWithChangeId` | string \\| null | no | One of: string, null |');

    const trackedChangeList = artifacts.get('apps/docs/document-api/reference/track-changes/list.mdx');
    expect(trackedChangeList).toBeDefined();
    expect(trackedChangeList!).toContain('| `in` | StoryLocator \\| `"all"` | no | One of: StoryLocator, `"all"` |');

    // Nullable-primitive example values are rendered as `null`. (track-changes
    // examples no longer surface a nullable primitive once `subtype` joined the
    // optional-field budget, so assert this on header-footers/get, which still
    // surfaces the nullable `refId` in its generated example.)
    const headerFooterGet = artifacts.get('apps/docs/document-api/reference/header-footers/get.mdx');
    expect(headerFooterGet).toBeDefined();
    expect(headerFooterGet!).toContain('| `refId` | string \\| null | no |  |');
    expect(headerFooterGet!).toContain('"refId": null');

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

  it('generates a non-empty markRunProps example for paragraph mark run props docs', () => {
    const artifacts = artifactContentByPath();

    const setMarkRunPropsDoc = artifacts.get(
      'apps/docs/document-api/reference/format/paragraph/set-mark-run-props.mdx',
    );
    expect(setMarkRunPropsDoc).toBeDefined();
    expect(setMarkRunPropsDoc!).not.toContain('"markRunProps": {}');
    expect(setMarkRunPropsDoc!).toContain('"fontSizeCs"');
  });

  it('uses a valid raw TOC instruction in create.tableOfContents example requests', () => {
    const artifacts = artifactContentByPath();

    const createTocDoc = artifacts.get('apps/docs/document-api/reference/create/table-of-contents.mdx');
    expect(createTocDoc).toBeDefined();
    expect(createTocDoc!).toContain('"instruction": "TOC \\\\o \\"1-3\\" \\\\u \\\\h \\\\z"');
    expect(createTocDoc!).not.toContain('"instruction": "example"');
  });
});
