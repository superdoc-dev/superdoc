import { useMemo, useState } from 'react';
import { AlertTriangle, Check, Copy, PlugZap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createMcpSnippets } from '@/lib/mcp-snippets';

export function McpConnectSidebar({ roomId }: { roomId: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const snippets = useMemo(() => createMcpSnippets({ roomId }), [roomId]);

  async function copy(label: string, value: string): Promise<void> {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(null), 1500);
  }

  return (
    <aside className='flex h-full w-[420px] shrink-0 flex-col overflow-y-auto border-l bg-muted/30'>
      <div className='border-b p-5'>
        <div className='mb-2 flex items-center gap-2'>
          <PlugZap className='h-5 w-5 text-primary' />
          <h2 className='font-semibold'>Connect an AI agent</h2>
        </div>
        <p className='text-sm text-muted-foreground'>
          Connect Codex or Claude Code, then paste the room prompt to edit this document through SuperDoc MCP.
        </p>
      </div>
      <div className='space-y-5 p-5'>
        <Snippet title='MCP endpoint' value={snippets.mcpUrl} copied={copied} onCopy={copy} />
        <Snippet title='Demo bearer token' value={snippets.token} copied={copied} onCopy={copy} />
        <Snippet title='Codex' value={snippets.codexCommand} copied={copied} onCopy={copy} />
        <Snippet title='Claude Code' value={snippets.claudeCommand} copied={copied} onCopy={copy} />
        <Snippet title='Room prompt' value={snippets.attachPrompt} copied={copied} onCopy={copy} />
        <div className='flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900'>
          <AlertTriangle className='mt-0.5 h-4 w-4 shrink-0' />
          Local demo only. The HTTP MCP server exposes file tools and must not be published to a network.
        </div>
      </div>
    </aside>
  );
}

interface SnippetProps {
  title: string;
  value: string;
  copied: string | null;
  onCopy(label: string, value: string): Promise<void>;
}

function Snippet({ title, value, copied, onCopy }: SnippetProps) {
  return (
    <section className='space-y-2'>
      <div className='flex items-center justify-between'>
        <h3 className='text-sm font-medium'>{title}</h3>
        <Button variant='ghost' size='sm' className='h-7' onClick={() => void onCopy(title, value)}>
          {copied === title ? <Check className='h-3.5 w-3.5' /> : <Copy className='h-3.5 w-3.5' />} Copy
        </Button>
      </div>
      <pre className='overflow-x-auto whitespace-pre-wrap rounded-md border bg-background p-3 text-xs leading-relaxed'>
        {value}
      </pre>
    </section>
  );
}
