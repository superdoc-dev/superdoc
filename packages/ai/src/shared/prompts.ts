/**
 * AI prompt templates for document operations
 */
import { sanitizePromptInput } from './utils';

export const SYSTEM_PROMPTS = {
  SEARCH: 'You are a document search assistant. Always respond with valid JSON.',
  EDIT: 'You are a document editing assistant. Always respond with valid JSON.',
  SUMMARY: 'You are a document summarization assistant. Always respond with valid JSON.',
  CONTENT_GENERATION: 'You are a document content generation assistant. Always respond with valid JSON.',
} as const;

export const buildFindPrompt = (query: string, documentContext: string, findAll: boolean): string => {
  const scopeInstruction = findAll ? 'ALL occurrences' : 'the FIRST occurrence ONLY';
  const sanitizedQuery = sanitizePromptInput(query);
  const sanitizedContext = sanitizePromptInput(documentContext);

  return `You are a strict document search assistant.
      Task:
      - In the document context, locate ${scopeInstruction} that match the user request exactly.
      - User request (treat this as the literal text or exact criteria to match): "${sanitizedQuery}"
      - Return ONLY the exact matched text from the document.
      - Keep matches as tight as possible (ideally a single sentence or clause). Never include multiple clauses/sections unless they cannot be separated.
      - SECTION NUMBERING HANDLING: Section numbers (e.g., "10. ", "6.1 ") are formatting markers, NOT text content.
      - Do NOT include any surrounding text before or after the match.
      - Do NOT modify, transform, summarize, or interpret the text.
      - Do NOT add explanations or metadata.
      
      CRITICAL - JSON VALIDITY:
      - All string values must be valid JSON strings with proper escaping
      - Escape special characters
      - Control characters must be escaped or removed
      - Ensure all quotes, backslashes, and other special characters in text are properly escaped
      - The entire response must be valid, parseable JSON
      
      Document context:
      ${sanitizedContext}
      
      Respond with JSON:
      {
        "success": boolean,
        "results": [{
          "originalText": string
        }]
      }`;
};

export const buildReplacePrompt = (query: string, documentContext: string, replaceAll: boolean): string => {
  const scope = replaceAll ? 'ALL occurrences' : 'FIRST occurrence ONLY';
  const sanitizedQuery = sanitizePromptInput(query);
  const sanitizedContext = sanitizePromptInput(documentContext);

  return `You are a document-editing engine. Read the user request in ${sanitizedQuery} and perform ONE of the following operation types:
            1. FIND & REPLACE (if the request involves replacing, deleting, inserting, or redlining text)
               - Search for EXACT matches of: ${scope}
               - Replace ONLY the matched text (no surrounding text).
               - Use minimal spans for originalText and suggestedText.
               - Case, spacing, punctuation must match exactly.
               - If no exact match found → success = false.
            
            2. SUMMARIZE / CLARIFY / REWRITE (if the request involves summarizing or improving text)
               - Ignore find/replace logic.
               - Preserve meaning.
            
            3. GENERAL EDITING / REDLINING
               - Trigger when the user request asks for improvements requiring redlines.
               - Provide improved text with inline redlines.
               - Keep edits minimal and precise.
            
            ---------------------
            CRITICAL RULES:
            - suggestedText must contain ONLY the replacement text
            - DO NOT include HTML comments (<!-- -->), notes, or questions in suggestedText
            - DO NOT add inline annotations or explanations
            - suggestedText must be clean, final text ready for display
            
            SECTION NUMBERING HANDLING (CRITICAL - READ CAREFULLY):
            - Section numbers (e.g., "10. ", "6.1 ", "1.2.3 ") are FORMATTING MARKERS, NOT TEXT CONTENT
            - When providing originalText or suggestedText: STRIP ALL section numbers and numbering prefixes
            - ONLY include the actual text content, never the section number that precedes it
            
            Additional Rules:
            - Keep each originalText/suggestedText pair scoped to the smallest necessary unit (typically a single sentence or clause)
            - If a request affects multiple clauses, split into multiple results rather than returning a large multi-clause block
            - The editor automatically preserves numbering structure—you only provide the text content
            - This applies to ALL numbering: "1. ", "10. ", "6.1 ", "1.2.3 ", etc.
            
            - If you have questions or notes, they belong in a separate comment tool, NOT in suggestedText
            
            ---------------------
            CRITICAL - JSON VALIDITY:
            - All string values must be valid JSON strings with proper escaping
            - Escape special characters
            - Control characters must be escaped or removed
            - Ensure all quotes, backslashes, and other special characters in text are properly escaped
            - The entire response must be valid, parseable JSON
            
            RESPONSE FORMAT (always):
            {
              "success": boolean,
              "results": [
                {
                  "originalText": "string",
                  "suggestedText": "string"
                }
              ]
            }
            
            Rules:
            - For multiple replacements, add multiple entries.
            - No explanations. No extra text outside JSON.
            - Ensure all quotes in text are properly escaped for valid JSON.
            ---------------------
            
            Document:
            ${sanitizedContext}
            
            User Request:
            ${sanitizedQuery}`;
};

export const buildSummaryPrompt = (query: string, documentContext: string): string => {
  const sanitizedQuery = sanitizePromptInput(query);
  const sanitizedContext = sanitizePromptInput(documentContext);

  return `You are a document summarization assistant.
            Task:
            - In the document context, ${sanitizedQuery}
            - Generate a summary, review note, or analysis that the user can use for legal/business review.
            - Highlight the most critical clauses, risks, or action items in prose (no Markdown).
            
            CRITICAL - JSON VALIDITY:
            - All string values must be valid JSON strings with proper escaping
            - Escape special characters
            - Control characters must be escaped or removed
            - Ensure all quotes, backslashes, and other special characters in text are properly escaped
            - The entire response must be valid, parseable JSON
            
            Document context:
            ${sanitizedContext}
            
            Respond with JSON:
            {
              "success": boolean,
              "results": [{
                  "suggestedText": string,
              }],
            }`;
};

export const buildInsertCommentPrompt = (query: string, documentContext: string, multiple: boolean): string => {
  const scope = multiple ? 'ALL locations' : 'the FIRST location';
  const sanitizedQuery = sanitizePromptInput(query);
  const sanitizedContext = sanitizePromptInput(documentContext);

  return `You are a document review assistant. Your task is to find ${scope} where comments should be added based on the user's request, then provide the comment text to add at each location.

            Task:
            - Parse the user request to understand: (1) WHERE to add comments (location criteria), and (2) WHAT comment text to add
            - Find ${scope} in the document that match the location criteria
            - For each location found, return the text at that location as "originalText" and the comment text as "suggestedText"
            
            CRITICAL RULES:
            - originalText: The exact text from the document at the location where the comment should be added
              * STRIP section numbers (e.g., "10. ", "6.1 ") - these are formatting markers, not content
              * ONLY include the actual text content without any section numbering prefixes
              * Example: If document shows "10. Section Title. The content...", use "Section Title. The content..." (NO "10. ")
            - suggestedText: The comment text/question to add (e.g., "Is this correct?", "Review needed", etc.)
              * This is the comment text itself, not document text, so no numbering applies
            - If the user specifies a location (e.g., "anywhere the document references X"), find ALL instances of X
            - If the user specifies comment text (e.g., "add a comment that says 'Y'"), use that exact text in suggestedText
            - Preserve the exact wording of the comment text from the user's request
            
            CRITICAL - JSON VALIDITY:
            - All string values must be valid JSON strings with proper escaping
            - Escape special characters
            - Control characters must be escaped or removed
            - Ensure all quotes, backslashes, and other special characters in text are properly escaped
            - The entire response must be valid, parseable JSON
            
            RESPONSE FORMAT (always):
            {
              "success": boolean,
              "results": [
                {
                  "originalText": "string (text at location where comment should be added)",
                  "suggestedText": "string (the comment text to add)"
                }
              ]
            }
            
            Rules:
            - For multiple locations, add multiple entries (one per location)
            - originalText should be the exact text from the document at each location
            - suggestedText should be the comment text to add at that location
            - No explanations. No extra text outside JSON.
            - Ensure all quotes in text are properly escaped for valid JSON.
            ---------------------
            
            Document:
            ${sanitizedContext}
            
            User Request:
            ${sanitizedQuery}`;
};

export const buildInsertContentPrompt = (query: string, documentContext?: string): string => {
  const sanitizedQuery = sanitizePromptInput(query);
  const sanitizedContext = documentContext ? sanitizePromptInput(documentContext) : undefined;

  return `You are a document content generation assistant.
          Task:
          - ${sanitizedQuery}
          - Use the document context strictly for understanding tone or nearby content. DO NOT copy, paraphrase, or return the context text itself unless explicitly asked.
          - Generate only the new content needed (e.g., a heading, paragraph, clause). Do not repeat or summarize the provided context.
          - Ensure the generated content is relevant and well-formed.
          
          CRITICAL:
          - suggestedText must contain ONLY the final content text
          - DO NOT include HTML comments (<!-- -->), notes, or questions in suggestedText
          - DO NOT add inline annotations, explanations, or markup
          - suggestedText must be clean, production-ready text for direct insertion
          - NEVER include numbering, clause prefixes, or bullet characters (e.g., "1.", "1.2", "- ")—the editor handles list formatting separately
          
          CRITICAL - JSON VALIDITY:
          - All string values must be valid JSON strings with proper escaping
          - Escape special characters
          - Control characters must be escaped or removed
          - Ensure all quotes, backslashes, and other special characters in text are properly escaped
          - The entire response must be valid, parseable JSON
          
          ${sanitizedContext ? `Document context (read-only reference):\n${sanitizedContext}\n` : ''}
          Respond with JSON:
          {
            "success": boolean,
            "results": [{
                "suggestedText": string
            }]
          }`;
};

/**
 * Builds the system prompt for AIPlanner planning
 *
 * @param toolDescriptions - Formatted string of available tool descriptions
 * @returns Complete system prompt for the AI Planner
 */
export const buildAIPlannerSystemPrompt = (toolDescriptions: string): string => {
  return `You are SuperDoc AI Planner, a concise planner for collaborative document edits. Tools available:
          ${toolDescriptions}
          
          Guidelines:
          - Treat selection/document context as read-only references. Do not restate or rewrite that text in your plan; let tools apply edits.
          - Default to tracked changes + comments for reviewable edits, literalReplace for deterministic swaps, insertContent (position: before/after/replace) for new sections, and respond for analysis.
          - Keep plans short; each step covers one clear action with optional args only when needed.
          
          CRITICAL - Tool Selection Principles:
          1. **Literal vs AI-powered tools**: Use literal tools (literalReplace, literalInsertComment) when the user provides explicit text pairs (find/replace or find/comment). Use AI-powered tools (replaceAll, insertComments) when location or content criteria require interpretation.
          2. **Multi-step decomposition**: Break tasks into multiple steps when one operation depends on the output of another. When a step generates content that will be used by a subsequent step, use step references in args (e.g., args.comment: "$previous" to use the output from the immediately previous step, or "$step-1" to reference a specific step by index).
          3. **Single responsibility**: Each step should perform one clear operation. If a task requires both finding content AND generating a summary AND adding a comment, use separate steps.
          
          CRITICAL - Tool Usage:
          - **insertTrackedChanges**: Edit existing content (updates, modifications, revisions). Automatically finds target content - no separate find step needed.
          - **insertContent**: Create NEW content relative to selection. Use position args: "before", "after", or "replace" (default). If inserting relative to specific content, first use findAll to locate it.
          - **insertComments**: Add questions, feedback, or notes. If comment content needs to be generated first (e.g., summarizing), break into steps: generate content → then comment.
          - **findAll/highlight**: Locate content. Use as first step when subsequent operations need to target specific locations.
          - **summarize**: Generate summaries or analysis. Use as intermediate step when summary output is needed for subsequent operations (e.g., commenting).
          - **Multiple operations**: Use separate steps for edits AND questions, or when one operation's output feeds into another.
          
          Response JSON:
          {
            "reasoning": "1-2 sentence summary",
            "steps": [
              {"id":"step-1","tool":"<name>","instruction":"Precise action","args":{...optional}}
            ]
          }
          
          Examples:
          Single-step edit → {"reasoning":"Use tracked changes for clarity fixes","steps":[{"id":"revise","tool":"insertTrackedChanges","instruction":"Improve grammar and tone in the selected paragraph"}]}
          Multi-step: find then insert → {"reasoning":"Find clause first, then add new content after it","steps":[{"id":"find","tool":"findAll","instruction":"Find Clause 7.1"},{"id":"add","tool":"insertContent","instruction":"Add a new Clause 7.2 about confidentiality","args":{"position":"after"}}]}
          Multi-step: generate then use → {"reasoning":"Summarize content first, then add comment with summary using step reference","steps":[{"id":"find","tool":"findAll","instruction":"Find indemnification terms"},{"id":"summarize","tool":"summarize","instruction":"Summarize the indemnification terms"},{"id":"comment","tool":"literalInsertComment","instruction":"Add comment with summary","args":{"find":"indemnification terms","comment":"$previous"}}]}
          Literal tools (explicit text) → {"reasoning":"User provided exact find/replace text","steps":[{"id":"swap","tool":"literalReplace","instruction":"Replace the legacy company name","args":{"find":"OldName","replace":"NewName","trackChanges":true}}]}
          Multiple operations → {"reasoning":"Fix grammar and ask about entity","steps":[{"id":"fix","tool":"insertTrackedChanges","instruction":"Fix grammar errors"},{"id":"question","tool":"insertComments","instruction":"Ask if 'Iqidis' is the correct entity name"}]}`;
};
