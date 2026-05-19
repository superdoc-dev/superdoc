/**
 * Mocked stand-in for an AI/RAG pipeline. Holds pre-canned text plus
 * pre-canned citation specs — the shape a generator would emit (text
 * plus an array of cited spans plus payloads). The demo inserts the
 * text and attaches each citation to the span it references; no model
 * is invoked.
 *
 * A real integration replaces this with whatever surface drives
 * generation in the customer's product (typically a chat panel plus
 * an Insert into document action).
 */
import type { CitationPayload, SelectionTarget } from './citations-types';

/** One mock draft to insert — a paragraph plus the spans it cites. */
export type MockDraft = {
  /** Paragraph text inserted at the end of the document. */
  text: string;
  /** Citations attached to specific phrases within `text`. */
  citations: Array<{
    /** Exact substring of `text` the citation anchors to. Case-sensitive. */
    phrase: string;
    /** The payload the (mock) AI generated alongside the prose. */
    payload: CitationPayload;
  }>;
};

const NOW = () => new Date().toISOString();

export const MOCK_DRAFTS: MockDraft[] = [
  {
    text:
      "The duty of care requires officers to act with the care a person in a like position would reasonably believe appropriate under similar circumstances. " +
      "In Beacon Bio v. FTC, the Ninth Circuit confirmed that this standard applies to interim operating decisions during a pending merger.",
    citations: [
      {
        phrase: 'duty of care',
        payload: {
          citationId: 'cite-001',
          sourceId: 'restatement-torts-3rd-s6',
          sourceType: 'statute',
          provider: 'lexisnexis',
          displayText: 'Restatement (Third) of Torts § 6',
          locator: '§ 6',
          excerpt:
            'An actor must exercise reasonable care, defined as the care that a reasonable person would exercise under like circumstances.',
          deepLink: 'https://example.com/lexis/restatement-torts/6',
          confidence: 0.92,
          createdAt: NOW(),
        },
      },
      {
        phrase: 'Beacon Bio v. FTC',
        payload: {
          citationId: 'cite-002',
          sourceId: 'case-beacon-bio-ftc-2024',
          sourceType: 'case',
          provider: 'westlaw',
          displayText: 'Beacon Bio v. FTC, 12 F.4th 100 (9th Cir. 2024)',
          locator: '12 F.4th 100, 112',
          excerpt:
            'We hold that the duty of care extends to interim operating decisions during the pendency of a noticed transaction.',
          deepLink: 'https://example.com/westlaw/beacon-bio-ftc',
          confidence: 0.88,
          createdAt: NOW(),
        },
      },
    ],
  },
  {
    text:
      "Confidentiality obligations under the agreement survive disclosure for five years, consistent with the precedent in the firm's Mutual NDA template. " +
      "Acquirors should treat this as a non-negotiable floor for transactions of this size.",
    citations: [
      {
        phrase: 'Mutual NDA template',
        payload: {
          citationId: 'cite-003',
          sourceId: 'firm-template-mutual-nda',
          sourceType: 'precedent',
          provider: 'customer-dms',
          displayText: 'Firm Precedent: Mutual NDA Template v3',
          locator: '§ 4.2',
          excerpt:
            'Each party shall protect the other party\u2019s Confidential Information for a period of five (5) years from the date of disclosure.',
          deepLink: 'https://example.com/dms/templates/mutual-nda-v3',
          confidence: 0.95,
          createdAt: NOW(),
        },
      },
    ],
  },
];

/**
 * Compute the SelectionTargets for each citation in a draft, given the
 * blockId the text was inserted into. Phrase offsets are character
 * positions within `draft.text`. v1 of `metadata.attach` requires
 * same-paragraph anchors; the mock inserts a single paragraph so this
 * constraint is satisfied by construction.
 */
export function computeCitationTargets(
  draft: MockDraft,
  blockId: string,
): Array<{ target: SelectionTarget; payload: CitationPayload }> {
  const out: Array<{ target: SelectionTarget; payload: CitationPayload }> = [];
  for (const c of draft.citations) {
    const start = draft.text.indexOf(c.phrase);
    if (start < 0) continue;
    const end = start + c.phrase.length;
    out.push({
      target: {
        kind: 'selection',
        start: { kind: 'text', blockId, offset: start },
        end: { kind: 'text', blockId, offset: end },
      },
      payload: c.payload,
    });
  }
  return out;
}
