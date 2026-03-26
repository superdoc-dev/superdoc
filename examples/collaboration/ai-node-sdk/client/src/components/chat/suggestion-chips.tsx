import { ArrowRight } from 'lucide-react';

const SUGGESTIONS = [
  {
    label: 'Add heading',
    prompt: 'Add a heading "Executive Summary" at the top of the document',
  },
  {
    label: 'Write paragraphs',
    prompt: 'Add 3 lorem ipsum paragraphs under the first heading',
  },
  {
    label: 'Summarize as list',
    prompt: 'Add a 5-item numbered list summarizing the entire document under the first heading',
  },
  {
    label: 'Format heading',
    prompt: 'Make the first heading bold and increase its font size',
  },
  {
    label: 'Insert table',
    prompt: 'Create a table with 3 columns: Task, Status, and Due Date',
  },
  {
    label: 'Find dates',
    prompt: 'Find all mentions of dates and highlight them',
  },
];

interface SuggestionChipsProps {
  onSelect: (text: string) => void;
}

export function SuggestionChips({ onSelect }: SuggestionChipsProps) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 px-4 py-6 gap-4">
      <p className="text-sm text-muted-foreground">Try one of these</p>
      <div className="w-full max-w-[280px] flex flex-col gap-2">
        {SUGGESTIONS.map(({ label, prompt }) => (
          <button
            key={prompt}
            onClick={() => onSelect(prompt)}
            className="group flex items-center justify-between gap-2 w-full text-left
                       text-sm px-4 py-3 rounded-xl border border-border
                       hover:border-foreground/20 hover:bg-accent/60
                       transition-all duration-150"
          >
            <span className="text-foreground/80 group-hover:text-foreground">{label}</span>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-foreground/60
                                   group-hover:translate-x-0.5 transition-transform shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}
