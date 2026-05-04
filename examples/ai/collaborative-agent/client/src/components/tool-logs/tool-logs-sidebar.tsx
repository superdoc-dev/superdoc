import { useEffect, useRef } from 'react';
import { Terminal, Sparkles } from 'lucide-react';
import { CopyTracesButton } from './copy-traces-button';
import { TraceGroup } from './trace-group';
import type { Trace } from '@/types/agent';

interface ToolLogsSidebarProps {
  traces: Trace[];
}

export function ToolLogsSidebar({ traces }: ToolLogsSidebarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [traces]);

  const totalCalls = traces.reduce(
    (sum, t) => sum + t.turns.reduce((s, tu) => s + tu.toolCalls.length, 0),
    0,
  );

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center justify-between px-3 py-2.5 border-b">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-xs font-semibold uppercase tracking-wide">Traces</h2>
          {totalCalls > 0 && (
            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
              {totalCalls} calls
            </span>
          )}
        </div>
        {traces.length > 0 && <CopyTracesButton traces={traces} />}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        {traces.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 mt-12 text-center">
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-[180px]">
              Tool call traces will appear here when the AI agent processes your messages.
            </p>
          </div>
        ) : (
          traces.map((trace) => <TraceGroup key={trace.id} trace={trace} />)
        )}
      </div>
    </div>
  );
}
