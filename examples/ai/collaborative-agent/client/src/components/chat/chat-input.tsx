import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { Send, Square } from 'lucide-react';
import { useCallback, useRef, useState, type KeyboardEvent } from 'react';

const QUICK_SUGGESTIONS = [
  { label: 'Add heading', prompt: 'Add a heading "Executive Summary" at the top of the document' },
  { label: 'Write paragraphs', prompt: 'Add 3 lorem ipsum paragraphs under the first heading' },
  { label: 'Summarize', prompt: 'Add a 5-item numbered list summarizing the entire document under the first heading' },
  { label: 'Format', prompt: 'Make the first heading bold and increase its font size' },
];


interface ChatInputProps {
  onSend: (text: string) => void;
  onCancel: () => void;
  isStreaming: boolean;
  disabled?: boolean;
  suggestions?: boolean;
  onSuggestionSelect?: (text: string) => void;
}

export function ChatInput({
  onSend,
  onCancel,
  isStreaming,
  disabled,
  suggestions,
  onSuggestionSelect,
}: ChatInputProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const lineHeight = 20;
    const maxHeight = lineHeight * 4;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [text, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="border-t">
      {suggestions && onSuggestionSelect && (
        <div className="flex gap-1.5 flex-wrap px-3 pt-2.5">
          {QUICK_SUGGESTIONS.map(({ label, prompt }) => (
            <button
              key={label}
              onClick={() => onSuggestionSelect(prompt)}
              className="text-[11px] px-2.5 py-1 rounded-md border border-border
                         text-muted-foreground hover:text-foreground hover:bg-accent
                         transition-colors"
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2 p-3">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            adjustHeight();
          }}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          disabled={disabled || isStreaming}
          rows={1}
          className={cn(
            'flex-1 resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm',
            'placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        />
        {isStreaming ? (
          <Button
            size="icon"
            variant="destructive"
            onClick={onCancel}
            className="h-9 w-9 shrink-0"
          >
            <Square className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            size="icon"
            onClick={handleSend}
            disabled={disabled || !text.trim()}
            className="h-9 w-9 shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
