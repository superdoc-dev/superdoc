import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Trace } from '@/types/agent';

interface CopyTracesButtonProps {
  traces: Trace[];
}

export function CopyTracesButton({ traces }: CopyTracesButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const json = JSON.stringify(traces, null, 2);
    await navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={handleCopy}>
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5" />
          Copied
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" />
          Copy All
        </>
      )}
    </Button>
  );
}
