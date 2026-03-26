import { useState } from 'react';
import { ChevronRight, ChevronDown, ExternalLink } from 'lucide-react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { JsonViewer } from '@/components/shared/json-viewer';
import { useJsonModal } from '@/components/shared/json-modal-manager';
import type { ToolCallEntry as ToolCallEntryType } from '@/types/agent';
import { cn } from '@/lib/cn';

interface ToolCallEntryProps {
  entry: ToolCallEntryType;
}

function StatusDot({ status }: { status: ToolCallEntryType['status'] }) {
  const color = {
    success: 'bg-emerald-500',
    error: 'bg-red-500',
    pending: 'bg-amber-500 animate-pulse',
  }[status];
  return <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', color)} />;
}

function formatToolName(name: string): string {
  return name.replace(/^superdoc_/, '');
}

/** Extract a short preview of what this call is doing from its args. */
function argPreview(args: Record<string, unknown>): string | null {
  // Common patterns in SuperDoc tool args
  const action = args.action as string | undefined;
  const text = (args.text ?? args.pattern ?? args.replacement) as string | undefined;
  const select = args.select as Record<string, unknown> | undefined;

  if (action && text) return `${action}: "${text.slice(0, 30)}"`;
  if (action) return action;
  if (text) return `"${text.slice(0, 40)}"`;
  if (select?.type) return `select: ${select.type}`;

  // Fallback: show first string value
  for (const v of Object.values(args)) {
    if (typeof v === 'string' && v.length > 0) return `"${v.slice(0, 40)}"`;
  }
  return null;
}

function DataSection({ label, data, modalTitle }: { label: string; data: unknown; modalTitle: string }) {
  const [open, setOpen] = useState(false);
  const { openModal } = useJsonModal();
  const json = JSON.stringify(data, null, 2);
  const sizeKB = json.length > 500 ? `(${(json.length / 1024).toFixed(1)}KB)` : '';

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-1">
        <CollapsibleTrigger className="flex items-center gap-1 text-[10px]
                                       text-muted-foreground hover:text-foreground transition-colors">
          {open ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
          {label}
          {sizeKB && <span className="text-muted-foreground/50">{sizeKB}</span>}
        </CollapsibleTrigger>
        <button
          onClick={() => openModal(modalTitle, data)}
          className="p-0.5 rounded text-muted-foreground/40 hover:text-foreground transition-colors"
          title="Open in window"
        >
          <ExternalLink className="h-2.5 w-2.5" />
        </button>
      </div>
      <CollapsibleContent>
        <div className="mt-1">
          <JsonViewer data={data} maxHeight="120px" />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function ToolCallEntry({ entry }: ToolCallEntryProps) {
  const toolName = formatToolName(entry.toolName);
  const preview = argPreview(entry.args);

  return (
    <div className="rounded-md border border-border/60 p-2.5">
      <div className="flex items-center gap-1.5">
        <StatusDot status={entry.status} />
        <span className="font-mono text-[11px] font-medium">{toolName}</span>
        {entry.durationMs != null && (
          <span className="text-[10px] text-muted-foreground ml-auto">{entry.durationMs}ms</span>
        )}
      </div>
      {preview && (
        <p className="text-[10px] text-muted-foreground truncate mt-0.5 pl-3">{preview}</p>
      )}
      <div className="space-y-0.5 mt-1.5 pl-3">
        <DataSection label="Input" data={entry.args} modalTitle={`${toolName} — Input`} />
        {entry.result !== undefined && (
          <DataSection label="Output" data={entry.result} modalTitle={`${toolName} — Output`} />
        )}
      </div>
    </div>
  );
}
