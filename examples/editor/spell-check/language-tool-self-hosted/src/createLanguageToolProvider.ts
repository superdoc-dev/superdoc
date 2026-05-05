interface LanguageToolMatch {
  offset: number;
  length: number;
  message: string;
  replacements: { value: string }[];
  rule: {
    issueType: string;
    category: { id: string };
  };
}

interface LanguageToolResponse {
  matches: LanguageToolMatch[];
}

function isSpellingMatch(match: LanguageToolMatch): boolean {
  return (
    match.rule.issueType === 'misspelling' ||
    match.rule.category.id === 'TYPOS'
  );
}

export function createLanguageToolProvider({ baseUrl }: { baseUrl: string }) {
  return {
    id: 'languagetool',

    getCapabilities() {
      return {
        issueKinds: ['spelling' as const],
        supportsSuggestions: true,
        requiresNetwork: true,
      };
    },

    async check(request: {
      segments: { id: string; text: string; language?: string | null }[];
      defaultLanguage?: string | null;
      maxSuggestions?: number;
      signal?: AbortSignal;
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
        const language = segment.language ?? request.defaultLanguage ?? 'en-US';

        const body = new URLSearchParams({
          text: segment.text,
          language,
        });

        const response = await fetch(baseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
          signal: request.signal,
        });

        if (!response.ok) {
          throw new Error(`LanguageTool responded with ${response.status}`);
        }

        const data: LanguageToolResponse = await response.json();

        for (const match of data.matches) {
          if (!isSpellingMatch(match)) continue;

          issues.push({
            segmentId: segment.id,
            start: match.offset,
            end: match.offset + match.length,
            kind: 'spelling',
            message: match.message,
            replacements: match.replacements
              .map((r) => r.value)
              .slice(0, maxSuggestions),
          });
        }
      }

      return { issues };
    },
  };
}
