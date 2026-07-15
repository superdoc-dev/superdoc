import { useState } from 'react';
import { ArrowLeft, Check, Copy, Download } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { getDownloadUrl } from '@/lib/room-api';

export function RoomHeader({ roomId }: { roomId: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className='flex h-11 items-center gap-3 border-b bg-background px-3'>
      <Link to='/' className='flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground'>
        <ArrowLeft className='h-4 w-4' /> Home
      </Link>
      <div className='h-4 w-px bg-border' />
      <span className='rounded bg-muted px-2 py-1 font-mono text-xs'>{roomId}</span>
      <Button
        variant='ghost'
        size='icon'
        className='h-7 w-7'
        onClick={async () => {
          await navigator.clipboard.writeText(roomId);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check className='h-3.5 w-3.5' /> : <Copy className='h-3.5 w-3.5' />}
      </Button>
      <div className='ml-auto flex items-center gap-3'>
        <span className='flex items-center gap-2 text-xs text-muted-foreground'>
          <span className='h-2 w-2 rounded-full bg-green-500' /> Document ready
        </span>
        <Button variant='outline' size='sm' asChild>
          <a href={getDownloadUrl(roomId)}>
            <Download className='h-4 w-4' /> Download DOCX
          </a>
        </Button>
      </div>
    </div>
  );
}
