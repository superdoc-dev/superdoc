// Row 864 cross-surface coherence guard.
//
// "Reopen resolved comment" is shipped through several public v2 surfaces that
// must agree on its posture. If one surface regresses back to declaring reopen
// not-shipped / `comment-reopen-ui-omitted` while the others say supported, the
// public contract drifts and proofing can silently bless the wrong state
// (plan §8). This guard reads the current public declarations in the
// `superdoc` package and asserts they consistently treat comment reopen as
// supported. It is intentionally a static guard so it does not depend on
// constructing a live editor.
//
// Surfaces in scope here (all owned by the public `superdoc` package):
//   - the SuperDoc v2 feature/capability registry (`SuperDoc.ts`)
//   - the v2 editor runtime supported-command mapping
//     (`v2-editor-runtime-adapter.ts`)
//   - the public comments UI handle type (`public/ui/types.ts`)
//
// The lower v2 host matrix + enhanced public facade + v2 review runtime
// contract live in the private v2 browser shell subtree and are guarded by the
// sibling coherence test there
// (`superdoc/v2/v2-browser-shell/src/superdoc-bridge/*`). Keeping the guard
// split by subtree avoids reaching across the OSS export boundary.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vite-plus/test';

const PKG_SRC = join(__dirname, '..', '..');

function read(rel: string): string {
  return readFileSync(join(PKG_SRC, rel), 'utf8');
}

describe('row 864 reopen cross-surface coherence (public superdoc)', () => {
  it('the SuperDoc capability registry declares shell.comments-sidebar.reopen supported, not omitted', () => {
    const source = read('core/SuperDoc.ts');
    // Find the registry entry for the reopen feature and assert it is supported.
    const match = source.match(/feature:\s*'shell\.comments-sidebar\.reopen',\s*status:\s*'([^']+)'/);
    expect(match, 'shell.comments-sidebar.reopen registry entry must exist').toBeTruthy();
    expect(match?.[1]).toBe('supported');
    // The stale omission marker must not survive anywhere in the registry.
    expect(source).not.toContain('comment-reopen-ui-omitted');
  });

  it('the v2 editor runtime maps comments.reopen to comments.patch({ status: "active" })', () => {
    const source = read('core/editor-runtime/v2/v2-editor-runtime-adapter.ts');
    expect(source).toContain("'comments.reopen'");
    expect(source).toMatch(/comments\.reopen[\s\S]{0,200}status:\s*'active'/);
    expect(source).not.toContain('comment-reopen-ui-omitted');
  });

  it('the public comments UI handle advertises reopen(commentId)', () => {
    const source = read('public/ui/types.ts');
    expect(source).toMatch(/reopen\(commentId:\s*string\)/);
  });
});
