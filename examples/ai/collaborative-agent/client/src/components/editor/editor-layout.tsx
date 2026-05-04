import { useState } from 'react';
import { RoomHeader } from './room-header';
import { EditorWorkspace } from './editor-workspace';
import { ChatSidebar } from '@/components/chat/chat-sidebar';
import { ToolLogsSidebar } from '@/components/tool-logs/tool-logs-sidebar';
import { SidebarToggle } from '@/components/shared/sidebar-toggle';
import { useAgentStream } from '@/hooks/use-agent-stream';
import { cn } from '@/lib/cn';

interface EditorLayoutProps {
  roomId: string;
  displayName: string;
  agentReady: boolean;
}

export function EditorLayout({ roomId, displayName, agentReady }: EditorLayoutProps) {
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  const { isStreaming, currentResponse, traces, startStream, cancel } =
    useAgentStream(roomId);

  return (
    <div className="flex h-full flex-col">
      <RoomHeader roomId={roomId} agentReady={agentReady} />

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar - Tool Logs */}
        <div
          className={cn(
            'flex flex-col border-r bg-muted/40 transition-all duration-200 overflow-hidden',
            leftCollapsed ? 'w-10' : 'w-80',
          )}
        >
          <div className="flex h-10 items-center justify-between border-b px-2">
            {!leftCollapsed && (
              <span className="text-sm font-medium px-1">Tool Logs</span>
            )}
            <SidebarToggle
              collapsed={leftCollapsed}
              onToggle={() => setLeftCollapsed((v) => !v)}
              side="left"
            />
          </div>
          {!leftCollapsed && (
            <div className="flex-1 overflow-hidden">
              <ToolLogsSidebar traces={traces} />
            </div>
          )}
        </div>

        {/* Center - Editor */}
        <div className="flex flex-1 flex-col overflow-auto bg-background">
          <EditorWorkspace roomId={roomId} displayName={displayName} />
        </div>

        {/* Right sidebar - AI Chat */}
        <div
          className={cn(
            'flex flex-col border-l bg-muted/40 transition-all duration-200 overflow-hidden',
            rightCollapsed ? 'w-10' : 'w-96',
          )}
        >
          <div
            className={cn(
              'flex h-10 items-center border-b px-2',
              rightCollapsed ? 'justify-center' : 'justify-between',
            )}
          >
            <SidebarToggle
              collapsed={rightCollapsed}
              onToggle={() => setRightCollapsed((v) => !v)}
              side="right"
            />
            {!rightCollapsed && (
              <span className="text-sm font-medium px-1">AI Chat</span>
            )}
          </div>
          {!rightCollapsed && (
            <div className="flex-1 overflow-hidden">
              <ChatSidebar
                roomId={roomId}
                displayName={displayName}
                isStreaming={isStreaming}
                currentResponse={currentResponse}
                onStartStream={startStream}
                onCancelStream={cancel}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
