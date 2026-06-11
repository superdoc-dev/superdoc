import type { FlowBlock, ListBlock, ParagraphBlock, Run, TableBlock } from '@superdoc/contracts';
import { SequenceFieldEvaluator } from '../super-converter/field-references/shared/seq-evaluator.js';

/**
 * Resolve SEQ token runs after all blocks have been assembled in document order.
 * This keeps numbering cache-safe because cached paragraphs still contribute
 * their preserved token metadata to the linear pass.
 */
export function resolveSequenceFieldTokens(blocks: FlowBlock[]): void {
  const evaluator = new SequenceFieldEvaluator();
  for (const block of blocks) {
    resolveBlock(block, evaluator);
  }
}

function resolveBlock(block: FlowBlock, evaluator: SequenceFieldEvaluator): void {
  if (block.kind === 'paragraph') {
    resolveParagraph(block as ParagraphBlock, evaluator);
    return;
  }

  if (block.kind === 'table') {
    resolveTable(block as TableBlock, evaluator);
    return;
  }

  if (block.kind === 'list') {
    resolveList(block as ListBlock, evaluator);
  }
}

function resolveParagraph(block: ParagraphBlock, evaluator: SequenceFieldEvaluator): void {
  evaluator.enterParagraph({ paragraphHeadingLevel: block.attrs?.headingLevel });
  for (const run of block.runs) {
    resolveRun(run, evaluator);
  }
}

function resolveTable(block: TableBlock, evaluator: SequenceFieldEvaluator): void {
  for (const row of block.rows) {
    for (const cell of row.cells) {
      const childBlocks = cell.blocks ?? (cell.paragraph ? [cell.paragraph] : []);
      for (const childBlock of childBlocks) {
        resolveBlock(childBlock, evaluator);
      }
    }
  }
}

function resolveList(block: ListBlock, evaluator: SequenceFieldEvaluator): void {
  for (const item of block.items) {
    resolveParagraph(item.paragraph, evaluator);
  }
}

function resolveRun(run: Run, evaluator: SequenceFieldEvaluator): void {
  if ('token' in run && run.token === 'seq' && run.seqMetadata) {
    run.text = evaluator.evaluateField(run.seqMetadata).text;
  }
}
