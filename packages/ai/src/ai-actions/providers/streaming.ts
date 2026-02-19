/**
 * Streaming utilities for parsing incremental LLM responses
 */
import { MAX_STREAM_ITERATIONS, MAX_STREAM_TIMEOUT_MS } from '../../shared';

/**
 * Safely reads response text, returning a generic error message on failure.
 */
export async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return 'Unable to read response body';
  }
}

/**
 * Extracts text from Anthropic content blocks.
 */
export function extractTextFromBlock(block: any): string {
  if (typeof block === 'string') {
    return block;
  }
  if (block && typeof block === 'object') {
    if (block.type === 'text' && typeof block.text === 'string') {
      return block.text;
    }
  }
  return '';
}

/**
 * Parses response payload and extracts text.
 */
export async function parseResponsePayload(response: Response, parser: (payload: unknown) => string): Promise<string> {
  const text = await response.text();
  if (!text) return '';

  try {
    const payload = JSON.parse(text);
    return parser(payload);
  } catch {
    return text; // Return raw text if not JSON
  }
}

/**
 * Reads a streaming response and yields parsed chunks.
 * Includes safety mechanisms: timeout and iteration limit to prevent infinite loops.
 */
export async function* readStreamResponse(
  response: Response,
  parseChunk: (payload: unknown) => string | undefined,
  parseCompletion: (payload: unknown) => string,
): AsyncGenerator<string, void, unknown> {
  if (!response.body) {
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let iterationCount = 0;
  const startTime = Date.now();

  try {
    while (true) {
      // Safety check: prevent infinite loops
      iterationCount++;
      if (iterationCount > MAX_STREAM_ITERATIONS) {
        throw new Error(`Stream reader exceeded maximum iterations (${MAX_STREAM_ITERATIONS})`);
      }

      // Safety check: timeout protection
      const elapsed = Date.now() - startTime;
      if (elapsed > MAX_STREAM_TIMEOUT_MS) {
        throw new Error(`Stream reader exceeded timeout (${MAX_STREAM_TIMEOUT_MS}ms)`);
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim() || !line.startsWith('data: ')) continue;

        const data = line.slice(6);
        if (data === '[DONE]') {
          continue;
        }

        try {
          const payload = JSON.parse(data);
          const chunk = parseChunk(payload);
          if (chunk !== undefined) {
            yield chunk;
          }
        } catch {
          // Skip invalid JSON chunks
        }
      }
    }

    // Process remaining buffer
    if (buffer.trim()) {
      try {
        const payload = JSON.parse(buffer);
        const text = parseCompletion(payload);
        if (text) {
          yield text;
        }
      } catch {
        // Final chunk might not be valid JSON
      }
    }
  } finally {
    reader.releaseLock();
  }
}
