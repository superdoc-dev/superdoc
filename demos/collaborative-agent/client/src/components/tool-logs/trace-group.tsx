import { useState } from 'react';
import { ChevronRight, ChevronDown, Copy, Check, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { ToolCallEntry } from './tool-call-entry';
import type { Trace } from '@/types/agent';

interface TraceGroupProps {
  trace: Trace;
}

function TraceStatusIcon({ status }: { status: Trace['status'] }) {
  switch (status) {
    case 'running':
      return <Loader2 className="h-3.5 w-3.5 text-amber-500 animate-spin" />;
    case 'completed':
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
    case 'error':
      return <XCircle className="h-3.5 w-3.5 text-red-500" />;
  }
}

function truncatePrompt(text: string, max = 40): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + '...';
}

export function TraceGroup({ trace }: TraceGroupProps) {
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);

  const totalCalls = trace.turns.reduce((sum, t) => sum + t.toolCalls.length, 0);
  const totalMs = trace.turns.reduce(
    (sum, t) => sum + t.toolCalls.reduce((s, c) => s + (c.durationMs ?? 0), 0),
    0,
  );

  const handleCopy = async () => {
    await navigator.clipboard.writeText(JSON.stringify(trace, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      {/* Trace header */}
      <div className="flex items-center gap-1.5 group">
        <CollapsibleTrigger className="flex items-center gap-1.5 min-w-0 flex-1">
          {open
            ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          <TraceStatusIcon status={trace.status} />
          <span className="text-xs font-medium truncate" title={trace.prompt}>
            {truncatePrompt(trace.prompt)}
          </span>
        </CollapsibleTrigger>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-muted-foreground">
            {totalCalls} · {totalMs}ms
          </span>
          <button
            onClick={handleCopy}
            className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-accent transition-all"
            title="Copy trace JSON"
          >
            {copied
              ? <Check className="h-3 w-3 text-emerald-500" />
              : <Copy className="h-3 w-3 text-muted-foreground" />}
          </button>
        </div>
      </div>

      {/* Timeline of tool calls */}
      <CollapsibleContent>
        <div className="mt-1.5 space-y-1.5">
          {trace.turns.map((turn) =>
            turn.toolCalls.map((entry, i) => (
              <ToolCallEntry key={`${turn.turnIndex}-${i}`} entry={entry} />
            )),
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
