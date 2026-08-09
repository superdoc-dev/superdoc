'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, Copy, ExternalLink, Files, FileText, Link } from 'lucide-react';
import { AnthropicIcon, OpenAIIcon } from './assistant-brand-icons';
import styles from './article-actions.module.css';

type ArticleActionsProps = {
  markdownUrl: string;
};

type CopyStatus = 'idle' | 'copying' | 'copied' | 'error';

const markdownCache = new Map<string, Promise<string>>();
const publicDocsOrigin = 'https://docs.superdoc.dev';

function getMarkdown(markdownUrl: string) {
  const cached = markdownCache.get(markdownUrl);
  if (cached) return cached;

  const markdown = fetch(markdownUrl).then((response) => {
    if (!response.ok) throw new Error(`Markdown request failed with ${response.status}.`);
    return response.text();
  });
  markdownCache.set(markdownUrl, markdown);
  return markdown;
}

export function ArticleActions({ markdownUrl }: ArticleActionsProps) {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = `article-context-${useId().replaceAll(':', '')}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const resetTimerRef = useRef<number>(undefined);
  const markdownAbsoluteUrl = new URL(markdownUrl, publicDocsOrigin).href;
  const assistantPrompt = `Read ${markdownAbsoluteUrl}. I want to ask questions about it.`;
  const chatGptUrl = `https://chatgpt.com/?${new URLSearchParams({ prompt: assistantPrompt, hints: 'search' })}`;
  const claudeUrl = `https://claude.ai/new?${new URLSearchParams({ q: assistantPrompt })}`;

  useEffect(() => {
    if (!menuOpen) return;

    function closeOnPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setMenuOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      toggleRef.current?.focus();
    }

    document.addEventListener('pointerdown', closeOnPointerDown);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [menuOpen]);

  useEffect(
    () => () => {
      if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    },
    [],
  );

  function finishCopy(status: Extract<CopyStatus, 'copied' | 'error'>) {
    setCopyStatus(status);
    if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    resetTimerRef.current = window.setTimeout(() => setCopyStatus('idle'), 1600);
  }

  async function copyMarkdown() {
    setCopyStatus('copying');
    setMenuOpen(false);

    try {
      const markdown = getMarkdown(markdownUrl);
      if (typeof ClipboardItem === 'function' && navigator.clipboard.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': markdown.then((text) => new Blob([text], { type: 'text/plain' })),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(await markdown);
      }
      finishCopy('copied');
    } catch {
      markdownCache.delete(markdownUrl);
      finishCopy('error');
    }
  }

  async function copyMarkdownUrl() {
    setMenuOpen(false);
    try {
      await navigator.clipboard.writeText(markdownAbsoluteUrl);
      finishCopy('copied');
    } catch {
      finishCopy('error');
    }
  }

  const copyLabel =
    copyStatus === 'copying'
      ? 'Copying…'
      : copyStatus === 'copied'
        ? 'Copied'
        : copyStatus === 'error'
          ? 'Copy failed'
          : 'Copy page';
  const CopyIcon = copyStatus === 'copied' ? Check : Copy;

  return (
    <div ref={rootRef} className={styles.actions}>
      <div className={styles.split} data-status={copyStatus}>
        <button
          className={styles.primary}
          type='button'
          disabled={copyStatus === 'copying'}
          onClick={() => void copyMarkdown()}
        >
          <CopyIcon aria-hidden='true' />
          <span aria-live='polite'>{copyLabel}</span>
        </button>
        <button
          ref={toggleRef}
          className={styles.toggle}
          type='button'
          aria-controls={menuId}
          aria-expanded={menuOpen}
          aria-label='More page formats'
          onClick={() => setMenuOpen((open) => !open)}
        >
          <ChevronDown aria-hidden='true' />
        </button>
      </div>

      <div id={menuId} className={styles.menu} aria-label='Page formats' role='group' hidden={!menuOpen}>
        <div className={styles.groupLabel}>This page</div>
        <button className={styles.item} type='button' onClick={() => void copyMarkdown()}>
          <Copy aria-hidden='true' />
          <span>Copy as Markdown</span>
        </button>
        <a className={styles.item} href={markdownUrl} onClick={() => setMenuOpen(false)}>
          <FileText aria-hidden='true' />
          <span className={styles.itemCopy}>
            View as Markdown
            <small>{markdownUrl}</small>
          </span>
        </a>
        <button className={styles.item} type='button' onClick={() => void copyMarkdownUrl()}>
          <Link aria-hidden='true' />
          <span className={styles.itemCopy}>
            Copy page URL
            <small>{markdownUrl}</small>
          </span>
        </button>

        <div className={styles.divider} />
        <div className={styles.groupLabel}>Use with AI</div>
        <a
          className={styles.item}
          href={chatGptUrl}
          target='_blank'
          rel='noreferrer noopener'
          onClick={() => setMenuOpen(false)}
        >
          <OpenAIIcon className={styles.brandIcon} aria-hidden='true' />
          <span>Open in ChatGPT</span>
          <ExternalLink className={styles.external} aria-hidden='true' />
        </a>
        <a
          className={styles.item}
          href={claudeUrl}
          target='_blank'
          rel='noreferrer noopener'
          onClick={() => setMenuOpen(false)}
        >
          <AnthropicIcon className={styles.brandIcon} aria-hidden='true' />
          <span>Open in Claude</span>
          <ExternalLink className={styles.external} aria-hidden='true' />
        </a>
        <a
          className={styles.item}
          href='/llms-full.txt'
          target='_blank'
          rel='noreferrer noopener'
          onClick={() => setMenuOpen(false)}
        >
          <Files aria-hidden='true' />
          <span className={styles.itemCopy}>
            All docs as one file
            <small>llms-full.txt</small>
          </span>
          <ExternalLink className={styles.external} aria-hidden='true' />
        </a>
        {markdownUrl.startsWith('/md/document-api/reference') ? (
          <a
            className={styles.item}
            href='/llms-reference.txt'
            target='_blank'
            rel='noreferrer noopener'
            onClick={() => setMenuOpen(false)}
          >
            <FileText aria-hidden='true' />
            <span className={styles.itemCopy}>
              Document API reference
              <small>llms-reference.txt</small>
            </span>
            <ExternalLink className={styles.external} aria-hidden='true' />
          </a>
        ) : null}
      </div>
    </div>
  );
}
