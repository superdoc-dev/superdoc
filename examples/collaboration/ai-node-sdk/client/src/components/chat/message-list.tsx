import { useEffect, useRef } from 'react';
import { MessageBubble } from './message-bubble';
import type { ChatMessage } from '@/types/agent';

interface MessageListProps {
  messages: ChatMessage[];
  streamingContent?: string;
  isStreaming: boolean;
}

export function MessageList({ messages, streamingContent, isStreaming }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, streamingContent]);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}

      {isStreaming && (
        <MessageBubble
          message={{
            id: '__streaming__',
            role: 'assistant',
            content: streamingContent ?? '',
          }}
          isStreaming
        />
      )}
    </div>
  );
}
