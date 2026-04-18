import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

interface RoomHeaderProps {
  roomId: string;
  agentReady: boolean;
}

export function RoomHeader({ roomId, agentReady }: RoomHeaderProps) {
  const [copied, setCopied] = useState(false);

  const copyRoomId = useCallback(() => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [roomId]);

  return (
    <div className="flex h-10 items-center gap-3 border-b bg-background px-3">
      <Link
        to="/"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        <span className="hidden sm:inline">Home</span>
      </Link>

      <div className="h-4 w-px bg-border" />

      <div className="flex items-center gap-2">
        <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-mono text-muted-foreground">
          {roomId}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={copyRoomId}
          title="Copy room ID"
        >
          {copied
            ? <Check className="h-3 w-3 text-green-600" />
            : <Copy className="h-3 w-3" />}
        </Button>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <div
          className={cn(
            'h-2 w-2 rounded-full',
            agentReady ? 'bg-green-500' : 'bg-yellow-500 animate-pulse',
          )}
          title={agentReady ? 'Agent connected' : 'Agent connecting...'}
        />
        <span className="text-xs text-muted-foreground">
          {agentReady ? 'Agent ready' : 'Connecting...'}
        </span>
      </div>
    </div>
  );
}
