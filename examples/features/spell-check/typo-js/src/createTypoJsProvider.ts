import Typo from 'typo-js';
import affUrl from 'typo-js/dictionaries/en_US/en_US.aff?url';
import dicUrl from 'typo-js/dictionaries/en_US/en_US.dic?url';

const WORD_RE = /[a-zA-Z'\u2019]+/g;

export async function createTypoJsProvider() {
  const [affData, dicData] = await Promise.all([
    fetch(affUrl).then((r) => r.text()),
    fetch(dicUrl).then((r) => r.text()),
  ]);

  const dictionary = new Typo('en_US', affData, dicData);

  return {
    id: 'typo-js',

    getCapabilities() {
      return {
        issueKinds: ['spelling' as const],
        supportsSuggestions: true,
        requiresNetwork: false,
      };
    },

    async check(request: {
      segments: { id: string; text: string }[];
      maxSuggestions?: number;
    }) {
      const issues: {
        segmentId: string;
        start: number;
        end: number;
        kind: 'spelling';
        message: string;
        replacements: string[];
      }[] = [];

      const maxSuggestions = request.maxSuggestions ?? 5;

      for (const segment of request.segments) {
        let match: RegExpExecArray | null;
        WORD_RE.lastIndex = 0;

        while ((match = WORD_RE.exec(segment.text)) !== null) {
          const word = match[0];

          // Skip very short words and apostrophe-only tokens
          if (word.replace(/['\u2019]/g, '').length < 2) continue;

          if (!dictionary.check(word)) {
            issues.push({
              segmentId: segment.id,
              start: match.index,
              end: match.index + word.length,
              kind: 'spelling',
              message: `Unknown word: "${word}"`,
              replacements: dictionary.suggest(word).slice(0, maxSuggestions),
            });
          }
        }
      }

      return { issues };
    },
  };
}
