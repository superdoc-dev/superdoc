import { useState } from 'react';
import { ChevronRight, ChevronDown, Copy, Check, Zap } from 'lucide-react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { ToolCallEntry } from './tool-call-entry';
import type { TurnGroup as TurnGroupType } from '@/types/agent';

interface TurnGroupProps {
  turn: TurnGroupType;
  onCopyTurn: () => void;
}

export function TurnGroup({ turn, onCopyTurn }: TurnGroupProps) {
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);

  const successCount = turn.toolCalls.filter((c) => c.status === 'success').length;
  const errorCount = turn.toolCalls.filter((c) => c.status === 'error').length;
  const pendingCount = turn.toolCalls.filter((c) => c.status === 'pending').length;
  const totalMs = turn.toolCalls.reduce((sum, c) => sum + (c.durationMs ?? 0), 0);

  const handleCopy = () => {
    onCopyTurn();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-2 py-1.5">
        <CollapsibleTrigger className="flex items-center gap-1.5 text-xs font-semibold
                                       text-foreground hover:text-foreground/80 transition-colors">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <Zap className="h-3 w-3 text-amber-500" />
          Turn {turn.turnIndex}
        </CollapsibleTrigger>

        <div className="flex items-center gap-1.5 ml-auto text-[10px] text-muted-foreground">
          {pendingCount > 0 && (
            <span className="text-amber-500">{pendingCount} running</span>
          )}
          {successCount > 0 && (
            <span className="text-emerald-600">{successCount} ok</span>
          )}
          {errorCount > 0 && (
            <span className="text-red-500">{errorCount} failed</span>
          )}
          {totalMs > 0 && <span>{totalMs}ms</span>}
          <button
            onClick={handleCopy}
            className="p-0.5 rounded hover:bg-accent transition-colors"
            title="Copy turn trace"
          >
            {copied
              ? <Check className="h-3 w-3 text-emerald-500" />
              : <Copy className="h-3 w-3" />}
          </button>
        </div>
      </div>

      <CollapsibleContent>
        <div className="pl-5 pb-1 space-y-2 border-l-2 border-slate-200 ml-1.5">
          {turn.toolCalls.map((entry, i) => (
            <ToolCallEntry key={i} entry={entry} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
