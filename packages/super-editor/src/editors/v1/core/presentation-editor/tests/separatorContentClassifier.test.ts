/**
 * Spec B — classification tests for w:footnote typed records (separator,
 * continuationSeparator, continuationNotice) per ECMA-376 §17.11.1, §17.11.23,
 * Annex L.1.12.5.
 */
import { describe, it, expect } from 'vitest';
import { classifyNoteSeparatorContent, type XmlNode } from '../layout/separatorContentClassifier.js';

const wrapInFootnote = (paragraphs: XmlNode[]): XmlNode => ({
  name: 'w:footnote',
  attributes: { 'w:type': 'separator', 'w:id': '0' },
  elements: paragraphs,
});

const para = (...children: XmlNode[]): XmlNode => ({ name: 'w:p', elements: children });
const run = (...children: XmlNode[]): XmlNode => ({ name: 'w:r', elements: children });
const pPr = (...children: XmlNode[]): XmlNode => ({ name: 'w:pPr', elements: children });
const pBdr = (...children: XmlNode[]): XmlNode => ({ name: 'w:pBdr', elements: children });
const top = (attrs: Record<string, string> = { 'w:val': 'single', 'w:sz': '6' }): XmlNode => ({
  name: 'w:top',
  attributes: attrs,
});
const text = (s: string): XmlNode => ({ name: 'w:t', text: s });
const separatorMarker = (): XmlNode => ({ name: 'w:separator' });
const continuationSeparatorMarker = (): XmlNode => ({ name: 'w:continuationSeparator' });

describe('classifyNoteSeparatorContent — §17.11.1 / §17.11.23 / Annex L.1.12.5', () => {
  it('returns suppression for null/undefined input', () => {
    expect(classifyNoteSeparatorContent(null)).toBe('suppression');
    expect(classifyNoteSeparatorContent(undefined)).toBe('suppression');
  });

  it('returns suppression for a footnote with no paragraphs', () => {
    expect(classifyNoteSeparatorContent({ name: 'w:footnote', elements: [] })).toBe('suppression');
  });

  it('returns suppression for an empty paragraph (user opted out)', () => {
    expect(classifyNoteSeparatorContent(wrapInFootnote([para()]))).toBe('suppression');
  });

  it('returns default-marker for <w:p><w:r><w:separator/></w:r></w:p>', () => {
    expect(classifyNoteSeparatorContent(wrapInFootnote([para(run(separatorMarker()))]))).toBe('default-marker');
  });

  it('returns default-marker for the continuationSeparator marker', () => {
    expect(classifyNoteSeparatorContent(wrapInFootnote([para(run(continuationSeparatorMarker()))]))).toBe(
      'default-marker',
    );
  });

  it('returns explicit when the paragraph has w:pBdr with at least one border', () => {
    expect(classifyNoteSeparatorContent(wrapInFootnote([para(pPr(pBdr(top())))]))).toBe('explicit');
  });

  it('returns suppression when pBdr is present but empty (no borders defined)', () => {
    // Borders with no children are not visibly an override; treat as suppression.
    expect(classifyNoteSeparatorContent(wrapInFootnote([para(pPr(pBdr()))]))).toBe('suppression');
  });

  it('returns explicit when paragraph has text content (continuation notice style)', () => {
    expect(classifyNoteSeparatorContent(wrapInFootnote([para(run(text('(continued on next page)')))]))).toBe(
      'explicit',
    );
  });

  it('returns default-marker when paragraph has only the marker and empty pPr', () => {
    expect(classifyNoteSeparatorContent(wrapInFootnote([para(pPr(), run(separatorMarker()))]))).toBe('default-marker');
  });

  it('multiple paragraphs: explicit wins over default-marker if any has content', () => {
    expect(
      classifyNoteSeparatorContent(wrapInFootnote([para(run(separatorMarker())), para(run(text('extra note')))])),
    ).toBe('explicit');
  });

  it('multiple empty paragraphs → suppression', () => {
    expect(classifyNoteSeparatorContent(wrapInFootnote([para(), para()]))).toBe('suppression');
  });

  it('ignores whitespace-only text as no content', () => {
    expect(classifyNoteSeparatorContent(wrapInFootnote([para(run(text('')))]))).toBe('suppression');
  });
});
