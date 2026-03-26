import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/cn';
import type { ChatMessage } from '@/types/agent';

interface MessageBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
}

function StreamingDots() {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
      <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse [animation-delay:150ms]" />
      <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse [animation-delay:300ms]" />
    </span>
  );
}

export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex flex-col gap-1', isUser ? 'items-end' : 'items-start')}>
      {isUser && message.displayName && (
        <span className="text-xs text-muted-foreground px-1">{message.displayName}</span>
      )}
      <div
        className={cn(
          'rounded-lg p-3 text-sm max-w-[85%]',
          isUser
            ? 'bg-primary text-primary-foreground ml-12 rounded-br-none'
            : 'bg-muted mr-12 rounded-bl-none',
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : isStreaming && !message.content ? (
          <StreamingDots />
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
