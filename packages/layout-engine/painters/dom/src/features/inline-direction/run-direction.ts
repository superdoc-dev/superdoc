/**
 * Run-level direction helpers for DomPainter.
 *
 * These helpers encode paint-time decisions about how to project the OOXML
 * `w:rPr/w:rtl` signal onto a rendered span's `dir` attribute, plus a narrow
 * Word-parity workaround for RTL-tagged date-like numeric runs.
 *
 * The heuristic is intentionally scoped to current Word-parity fixtures
 * (SD-3098 mixed-bidi date tokens). It is NOT a full implementation of
 * §17.3.2.30 semantics - notably absent: `w:dir` embedding (§17.3.2.8),
 * `w:bdo` override (§17.3.2.3), and `w:lang/@bidi` Hebrew vs Arabic numeric
 * differences. Those gaps are tracked separately; see SD-2767 follow-ups.
 *
 * @spec ECMA-376 §17.3.2.30 (rtl), §17.17.4 (boolean property)
 */

/**
 * Matches numeric date-like tokens such as `2026-03-15`, `15/03/2026`, `1.2.3`.
 * Used by both the run direction resolver and the paint-time RLM injection
 * for Word parity on RTL date strings.
 */
export const RTL_DATE_LIKE_TOKEN_RE = /^-?\d+(?:[./-]\d+)+$/;

/**
 * Matches strong-RTL characters across Hebrew, Arabic, and adjacent RTL scripts
 * including presentation forms (FB1D-FB4F Hebrew, FB50-FDFF Arabic-A,
 * FE70-FEFF Arabic-B). The block range covers Hebrew, Arabic, Syriac, NKo,
 * etc.; the Script properties add presentation forms without including
 * noncharacters (FDD0-FDEF) or the BOM (FEFF).
 *
 * AIDEV-NOTE: also duplicated in super-editor's mixed-bidi-backspace extension.
 * Consolidating crosses a layer boundary; tracked under SD-3169 follow-ups.
 */
export const STRONG_RTL_CHAR_RE = /[\u0590-\u08FF\p{Script=Hebrew}\p{Script=Arabic}]/u;

/**
 * Matches runs whose content is exclusively Latin / digit / neutral. Used as
 * the "skip per-run dir=rtl" guard: per §17.3.2.30, behavior of w:rtl on
 * strongly LTR text is unspecified, and Word's empirical output for these
 * runs does not visually reorder.
 */
export const LATIN_DIGIT_NEUTRAL_ONLY_RE = /^[\s0-9A-Za-z./\-_:,+()]+$/;

const RLM = '\u200F';

/**
 * Word-parity workaround for RTL date-like tokens.
 *
 * Word internally injects RLM around numeric separators in RTL date strings,
 * preserving LTR order for the digits while keeping the run RTL. The browser's
 * UBA alone does not match this. We mirror Word by injecting RLM at paint
 * time only - the DOM text differs from the PM model and from the exported
 * OOXML, which both keep the original separators.
 *
 * Intentionally narrow: only matches numeric date-like patterns so other
 * numeric content is unaffected. Scope is current SD-3098 fixtures.
 */
export const normalizeRtlDateTokenForWordParity = (text: string): string => {
  if (!RTL_DATE_LIKE_TOKEN_RE.test(text)) {
    return text;
  }
  return text.replace(/[./-]/g, (separator) => `${RLM}${separator}${RLM}`);
};

/**
 * Compute the `dir` attribute (if any) to apply to a rendered run span.
 *
 * Decision table:
 * - rtl-tagged + empty text -> 'rtl' (no content to classify, honor source signal)
 * - rtl-tagged + date-like numeric -> 'rtl' (isolates the date as a unit)
 * - rtl-tagged + contains strong-RTL chars -> 'rtl' (standard case)
 * - rtl-tagged + only Latin/digit/neutral -> null (per §17.3.2.30, unspecified;
 *   Word does not visually reorder these, so omit dir to inherit paragraph)
 * - rtl-tagged + other (e.g. East Asian, symbols outside the neutral set) -> 'rtl' (fail-safe)
 * - NOT rtl-tagged + date-like numeric text -> 'ltr' (Word-parity: keeps date
 *   LTR-classified within an RTL paragraph context so digits don't drift)
 * - NOT rtl-tagged + anything else -> null (let paragraph + UBA decide)
 */
export type RunDirAttribute = 'rtl' | 'ltr' | null;

export const resolveRunDirectionAttribute = (opts: {
  /** Original run text from the model. */
  runText: string | undefined;
  /** Post-token-resolution text used for rendering (e.g. field token expansion). */
  effectiveText: string;
  /** True when the source OOXML carries `w:rPr/w:rtl`. */
  isRtlTagged: boolean;
}): RunDirAttribute => {
  if (opts.isRtlTagged) {
    const sample = (opts.runText ?? opts.effectiveText).trim();
    if (!sample) return 'rtl';
    if (RTL_DATE_LIKE_TOKEN_RE.test(sample)) return 'rtl';
    if (STRONG_RTL_CHAR_RE.test(sample)) return 'rtl';
    if (LATIN_DIGIT_NEUTRAL_ONLY_RE.test(sample)) return null;
    return 'rtl';
  }

  if (typeof opts.runText === 'string' && RTL_DATE_LIKE_TOKEN_RE.test(opts.runText)) {
    return 'ltr';
  }

  return null;
};
