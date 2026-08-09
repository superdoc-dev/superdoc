'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { getMarkdownUrl } from '@/lib/markdown-url';
import styles from './migration-agent-prompt.module.css';

/**
 * A single copyable prompt that points an agent at this guide before it edits.
 *
 * AIDEV-NOTE: Deliberately smaller than the homepage `AgentPrompts`. That one
 * picks between tasks, because a reader arriving at the homepage has not chosen
 * one yet. A reader on this page already has: they are migrating. A selector
 * here would be a decision with one real answer.
 *
 * The prompt is duplicated as plain text in the agent-facing exports. This
 * component is a placeholder there, so an agent reading `/md/...` or
 * `llms-full.txt` would otherwise get a card that says "copy the prompt" and no
 * prompt. The export copy lives in `lib/llm-markdown.ts`, and
 * `tests/migration-agent-prompt.test.mjs` pins the instructions both must share.
 */

const GUIDE_HREF = '/editor/migrate-from-v1/overview';
const CATALOG_PATH = '/migration/v1-to-v2.json';

/**
 * The prompt body, minus the two source URLs.
 *
 * "Do not change code yet" carries the most weight here. Not one catalog entry is a safe
 * rename: every entry is `redesign` or `unsupported`, because the v2 surface answers
 * a different question than the v1 one did rather than being the same call under
 * a new name. An agent that starts rewriting on the first pass applies them as
 * search-and-replace.
 */
function buildPrompt(markdownUrl: string, catalogUrl: string) {
  return `Help me migrate this project from SuperDoc v1 to v2.

First, read these sources of truth:
${markdownUrl}
${catalogUrl}

Inspect the project and report:
1. Removed imports and package subpaths
2. Any direct editor.* access, including commands, state, view, chain(), helpers, comments, presentationEditor, and on()
3. Legacy configuration and collaboration usage
4. Custom UI, extensions, and DOM selectors that require redesign
5. Synchronous Document API reads such as doc.extract(), doc.getMarkdown(), and doc.selection.current(), which the browser resolves as Promises

Do not change code yet. Classify each finding using the migration catalog, then propose the smallest safe migration sequence and a verification plan.`;
}

/**
 * Absolute once the origin is known, so the prompt still resolves after it is
 * pasted into an agent with no page context. The origin comes from the browser,
 * so a preview deployment or a local build hands out its own routes rather than
 * production's.
 */
function resolvePrompt(origin: string) {
  const markdownPath = getMarkdownUrl(GUIDE_HREF);
  return buildPrompt(
    origin ? new URL(markdownPath, origin).href : markdownPath,
    origin ? new URL(CATALOG_PATH, origin).href : CATALOG_PATH,
  );
}

export function MigrationAgentPrompt() {
  const [origin, setOrigin] = useState('');
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const resetTimerRef = useRef<number>(undefined);

  // The static export has no serving origin at build time, so the markup ships
  // relative routes and the browser upgrades them.
  useEffect(() => setOrigin(window.location.origin), []);

  useEffect(
    () => () => {
      if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    },
    [],
  );

  async function copyPrompt() {
    // Resolved against the live origin rather than state, so a click that lands
    // before the mount effect still copies absolute URLs.
    try {
      await navigator.clipboard.writeText(resolvePrompt(window.location.origin));
      setStatus('copied');
    } catch {
      setStatus('error');
    }

    if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    resetTimerRef.current = window.setTimeout(() => setStatus('idle'), 1600);
  }

  return (
    <section className={styles.card} aria-labelledby='migration-agent-prompt'>
      <div className={styles.header}>
        <h2 id='migration-agent-prompt' className={styles.title}>
          Migrating with an AI coding agent?
        </h2>
        <p className={styles.summary}>
          Copy this prompt to have your agent inspect the project against the current migration documentation.
        </p>
      </div>

      <div className={styles.promptShell}>
        <button className={styles.copy} type='button' onClick={copyPrompt}>
          <span aria-live='polite'>
            {status === 'copied' ? 'Copied' : status === 'error' ? 'Copy failed' : 'Copy prompt'}
          </span>
        </button>
        <pre className={styles.prompt}>{resolvePrompt(origin)}</pre>
      </div>

      <p className={styles.footer}>
        <Link href={getMarkdownUrl(GUIDE_HREF)}>Open this guide as Markdown</Link>
      </p>
    </section>
  );
}
