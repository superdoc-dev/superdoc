/// <reference lib="webworker" />

import Typo from 'typo-js';
import affUrl from 'typo-js/dictionaries/en_US/en_US.aff?url';
import dicUrl from 'typo-js/dictionaries/en_US/en_US.dic?url';
import type {
  TypoWorkerIssue,
  TypoWorkerRequest,
  TypoWorkerResponse,
  TypoWorkerIncomingMessage,
} from './typoWorkerMessages';

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;
const WORD_PATTERN = /[a-zA-Z'\u2019]+/g;

/** Yields to the worker event loop so `cancel` messages can be processed mid-check. */
const YIELD_EVERY_WORDS = 25;

let dictionaryPromise: Promise<Typo> | null = null;

/** Cancelled request ids (added by `cancel` messages from the main thread). */
const cancelledIds = new Set<number>();

async function loadDictionary(): Promise<Typo> {
  if (!dictionaryPromise) {
    dictionaryPromise = Promise.all([
      fetch(affUrl).then((r) => r.text()),
      fetch(dicUrl).then((r) => r.text()),
    ]).then(([affData, dicData]) => new Typo('en_US', affData, dicData));
  }

  return dictionaryPromise;
}

/**
 * Returns issues, or `null` if the request was cancelled (caller must not post a result).
 * Yields periodically so abort can be observed while Typo runs synchronously per word.
 */
async function collectIssues(
  payload: TypoWorkerRequest['payload'],
  dictionary: Typo,
  isAborted: () => boolean,
): Promise<TypoWorkerIssue[] | null> {
  const issues: TypoWorkerIssue[] = [];
  const maxSuggestions = payload.maxSuggestions ?? 5;
  let wordCount = 0;

  for (const segment of payload.segments) {
    for (const match of segment.text.matchAll(WORD_PATTERN)) {
      if (isAborted()) return null;

      const word = match[0];
      if (word.replace(/['\u2019]/g, '').length < 2) continue;

      if (!dictionary.check(word)) {
        issues.push({
          segmentId: segment.id,
          start: match.index,
          end: match.index + word.length,
          kind: 'spelling',
          message: `Unknown word: "${word}"`,
          replacements: maxSuggestions > 0 ? dictionary.suggest(word).slice(0, maxSuggestions) : [],
        });
      }

      wordCount++;
      if (wordCount % YIELD_EVERY_WORDS === 0) {
        // Yield to the event loop so abort can be observed mid-check.
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        if (isAborted()) return null;
      }
    }
  }

  return issues;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Typo worker failed';
}

async function handleCheck(data: TypoWorkerRequest): Promise<void> {
  const id = data.id;

  try {
    if (cancelledIds.has(id)) return;

    const dictionary = await loadDictionary();
    if (cancelledIds.has(id)) return;

    const collected = await collectIssues(data.payload, dictionary, () => cancelledIds.has(id));
    if (collected === null) return;

    ctx.postMessage({ id, type: 'result', issues: collected } satisfies TypoWorkerResponse);
  } catch (error) {
    ctx.postMessage({ id, type: 'error', error: toErrorMessage(error) } satisfies TypoWorkerResponse);
  } finally {
    cancelledIds.delete(id);
  }
}

ctx.addEventListener('message', (event: MessageEvent<TypoWorkerIncomingMessage>) => {
  const { data } = event;

  if (data.type === 'cancel') {
    cancelledIds.add(data.id);
    return;
  }

  if (data.type !== 'check') return;

  handleCheck(data);
});
