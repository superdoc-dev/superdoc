import type { Executor } from '../types.js';

const FORMAT_TO_OPERATION: Record<string, string> = {
  text: 'getText',
  markdown: 'getMarkdown',
  html: 'getHtml',
  info: 'info',
};

export async function routeRead(params: Record<string, unknown>, execute: Executor) {
  const format = params.format as string;
  const operationId = FORMAT_TO_OPERATION[format];
  if (!operationId) {
    throw new Error(`Unknown format: "${format}". Expected one of: text, markdown, html, info.`);
  }
  return execute(operationId, {});
}
