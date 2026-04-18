/**
 * Language Resolution
 *
 * Resolves the proofing language for a segment. Uses already-resolved
 * language data from the converter/style-engine path — does NOT
 * reimplement the OOXML style cascade.
 *
 * Resolution order:
 * 1. Run-level language from the first text run in the paragraph
 * 2. Paragraph-level language from paragraph properties (if available)
 * 3. defaultLanguage from ProofingConfig
 * 4. null (provider fallback)
 */

import type { Node as PmNode } from 'prosemirror-model';

/**
 * Resolve the language for a paragraph-like proofing segment.
 * Returns a BCP 47 language tag or null.
 */
export function resolveSegmentLanguage(paraNode: PmNode, defaultLanguage: string | null): string | null {
  // Try run-level language from the first proofable text run
  const runLanguage = findFirstRunLanguage(paraNode);
  if (runLanguage) return runLanguage;

  // Try paragraph-level language (some documents set lang on paragraph properties)
  const paraLang = extractParagraphLanguage(paraNode);
  if (paraLang) return paraLang;

  return defaultLanguage;
}

// =============================================================================
// Internal
// =============================================================================

/**
 * Find the language from the first run node that has language data.
 */
function findFirstRunLanguage(paraNode: PmNode): string | null {
  let lang: string | null = null;

  paraNode.descendants((node) => {
    if (lang) return false; // Already found

    if (node.type.name === 'run') {
      const runProps = (node.attrs as Record<string, unknown>).runProperties as { lang?: { val?: string } } | null;

      if (runProps?.lang?.val) {
        lang = runProps.lang.val;
        return false;
      }
    }
    return true;
  });

  return lang;
}

/**
 * Extract language from paragraph properties if available.
 */
function extractParagraphLanguage(paraNode: PmNode): string | null {
  const paraProps = (paraNode.attrs as Record<string, unknown>).paragraphProperties as {
    lang?: { val?: string };
  } | null;

  return paraProps?.lang?.val ?? null;
}
