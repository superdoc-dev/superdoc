import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface JsonViewerProps {
  data: unknown;
  maxHeight?: string;
}

export function JsonViewer({ data, maxHeight = '120px' }: JsonViewerProps) {
  const [copied, setCopied] = useState(false);
  const formatted = JSON.stringify(data, null, 2);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(formatted);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="relative group rounded border border-border/40 bg-muted/50">
      <button
        onClick={handleCopy}
        className="absolute top-1 right-1 p-1 rounded opacity-0 group-hover:opacity-100
                   bg-background/90 hover:bg-background border border-border/40
                   transition-opacity z-10"
      >
        {copied
          ? <Check className="h-3 w-3 text-emerald-500" />
          : <Copy className="h-3 w-3 text-muted-foreground" />}
      </button>
      <pre
        className="p-2 text-[10px] leading-relaxed font-mono text-foreground/80
                   overflow-auto whitespace-pre-wrap break-all"
        style={{ maxHeight }}
      >
        {formatted}
      </pre>
    </div>
  );
}
