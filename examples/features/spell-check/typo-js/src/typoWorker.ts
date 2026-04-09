/// <reference lib="webworker" />

import Typo from 'typo-js';
import affUrl from 'typo-js/dictionaries/en_US/en_US.aff?url';
import dicUrl from 'typo-js/dictionaries/en_US/en_US.dic?url';
import type {
  TypoWorkerIssue,
  TypoWorkerRequest,
  TypoWorkerResponse,
} from './typoWorkerMessages';

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;
const WORD_RE = /[a-zA-Z'\u2019]+/g;

let dictionaryPromise: Promise<Typo> | null = null;

async function loadDictionary(): Promise<Typo> {
  if (!dictionaryPromise) {
    dictionaryPromise = Promise.all([
      fetch(affUrl).then((r) => r.text()),
      fetch(dicUrl).then((r) => r.text()),
    ]).then(([affData, dicData]) => new Typo('en_US', affData, dicData));
  }

  return dictionaryPromise;
}

function collectIssues(payload: TypoWorkerRequest['payload'], dictionary: Typo): TypoWorkerIssue[] {
  const issues: TypoWorkerIssue[] = [];
  const maxSuggestions = payload.maxSuggestions ?? 5;

  for (const segment of payload.segments) {
    let match: RegExpExecArray | null;
    WORD_RE.lastIndex = 0;

    while ((match = WORD_RE.exec(segment.text)) !== null) {
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
    }
  }

  return issues;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Typo worker failed';
}

ctx.addEventListener('message', async (event: MessageEvent<TypoWorkerRequest>) => {
  const { data } = event;
  if (data.type !== 'check') return;

  const response: TypoWorkerResponse = { id: data.id, type: 'result', issues: [] };

  try {
    const dictionary = await loadDictionary();
    response.issues = collectIssues(data.payload, dictionary);
  } catch (error) {
    ctx.postMessage({ id: data.id, type: 'error', error: toErrorMessage(error) } satisfies TypoWorkerResponse);
    return;
  }

  ctx.postMessage(response);
});
