import { useState, useCallback } from 'react';
import { ModelSelector } from './model-selector';
import { EditModeToggle } from './edit-mode-toggle';
import { MessageList } from './message-list';
import { ChatInput } from './chat-input';
import { SuggestionChips } from './suggestion-chips';
import { useSendMessage } from '@/hooks/use-send-message';
import { updateRoomSettings } from '@/lib/agent-api';
import type { ChatMessage } from '@/types/agent';

interface ChatSidebarProps {
  roomId: string;
  displayName: string;
  isStreaming: boolean;
  currentResponse: string;
  onStartStream: (messageId: string, prompt: string) => Promise<string>;
  onCancelStream: () => void;
}

export function ChatSidebar({
  roomId,
  displayName,
  isStreaming,
  currentResponse,
  onStartStream,
  onCancelStream,
}: ChatSidebarProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [model, setModel] = useState('gpt-5.4');
  const [changeMode, setChangeMode] = useState<'direct' | 'tracked'>('direct');

  const sendMessageMutation = useSendMessage(roomId);

  const handleModelChange = useCallback(
    (value: string) => {
      setModel(value);
      updateRoomSettings(roomId, { model: value });
    },
    [roomId],
  );

  const handleChangeModeChange = useCallback(
    (value: 'direct' | 'tracked') => {
      setChangeMode(value);
      updateRoomSettings(roomId, { changeMode: value });
    },
    [roomId],
  );

  const handleSend = useCallback(
    async (text: string) => {
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
        displayName,
      };
      setMessages((prev) => [...prev, userMessage]);

      try {
        const { messageId } = await sendMessageMutation.mutateAsync({
          input: text,
          displayName,
        });

        const finalOutput = await onStartStream(messageId, text);

        if (finalOutput) {
          const assistantMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: finalOutput,
          };
          setMessages((prev) => [...prev, assistantMessage]);
        }
      } catch (err) {
        console.error('Failed to send message:', err);
        const errorMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: 'Failed to send message. Please try again.',
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
    },
    [displayName, sendMessageMutation, onStartStream],
  );

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex items-center justify-between gap-2 border-b p-3">
        <ModelSelector value={model} onChange={handleModelChange} />
        <EditModeToggle value={changeMode} onChange={handleChangeModeChange} />
      </div>

      {messages.length === 0 && !isStreaming ? (
        <SuggestionChips onSelect={handleSend} />
      ) : (
        <MessageList
          messages={messages}
          streamingContent={currentResponse}
          isStreaming={isStreaming}
        />
      )}

      <ChatInput
        onSend={handleSend}
        onCancel={onCancelStream}
        isStreaming={isStreaming}
        disabled={sendMessageMutation.isPending}
        suggestions={messages.length > 0 && !isStreaming && !sendMessageMutation.isPending}
        onSuggestionSelect={handleSend}
      />
    </div>
  );
}
