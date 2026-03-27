import { Mark } from '@core/Mark.js';

/**
 * Inline mark that tags page number text runs within TOC entry paragraphs.
 *
 * This mark is a structural tag — it has no visual effect and exists solely
 * so that `toc.update({ mode: 'pageNumbers' })` can surgically identify and
 * replace page number text without rebuilding the entire TOC.
 *
 * Applied by `buildTocEntryParagraphs` during materialization and detected
 * during DOCX import via a strict structural heuristic (see §2f in plan).
 */
export const TocPageNumber = Mark.create({
  name: 'tocPageNumber',

  inclusive: false,

  spanning: false,

  addOptions() {
    return {
      htmlAttributes: {},
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-toc-page-number]' }];
  },

  renderHTML() {
    return ['span', { 'data-toc-page-number': '' }, 0];
  },
});
