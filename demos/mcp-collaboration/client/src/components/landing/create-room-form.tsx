import { useCallback, useRef, useState } from 'react';
import { Check, FilePlus2, FileText, RefreshCw, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useStartRoom } from '@/hooks/use-start-room';
import { cn } from '@/lib/cn';
import { generateRoomName } from '@/lib/room-names';

export function CreateRoomForm() {
  const [roomId, setRoomId] = useState(generateRoomName);
  const [displayName, setDisplayName] = useState('User');
  const [file, setFile] = useState<File | null>(null);
  const [quickAction, setQuickAction] = useState<'sample' | 'blank' | null>('sample');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const startRoom = useStartRoom();

  const selectFile = useCallback((selected: File | undefined) => {
    if (!selected) return;
    setFile(selected);
    setQuickAction(null);
  }, []);

  return (
    <form
      className='space-y-5'
      onSubmit={(event) => {
        event.preventDefault();
        sessionStorage.setItem('displayName', displayName);
        startRoom.mutate({ roomId, useSample: quickAction === 'sample', file });
      }}
    >
      <div className='space-y-2'>
        <Label htmlFor='room-id'>Room name</Label>
        <div className='flex gap-2'>
          <Input id='room-id' value={roomId} onChange={(event) => setRoomId(event.target.value)} />
          <Button type='button' variant='outline' size='icon' onClick={() => setRoomId(generateRoomName())}>
            <RefreshCw className='h-4 w-4' />
          </Button>
        </div>
      </div>

      <div className='space-y-2'>
        <Label>Document</Label>
        <div
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8 transition-colors',
            isDragOver ? 'border-primary/60 bg-primary/5' : 'border-muted-foreground/25',
          )}
          onClick={() => fileInput.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragOver(false);
            selectFile(event.dataTransfer.files[0]);
          }}
        >
          <input
            ref={fileInput}
            type='file'
            accept='.docx'
            className='hidden'
            onChange={(event) => selectFile(event.target.files?.[0])}
          />
          {file ? (
            <div className='flex items-center gap-2 text-sm'>
              <FileText className='h-5 w-5' />
              {file.name}
            </div>
          ) : (
            <>
              <Upload className='mb-2 h-8 w-8 text-muted-foreground/60' />
              <p className='text-sm text-muted-foreground'>Drop a .docx or click to browse</p>
            </>
          )}
        </div>
        <div className='flex gap-2'>
          <Button
            type='button'
            variant={quickAction === 'sample' ? 'default' : 'outline'}
            className='flex-1'
            onClick={() => {
              setFile(null);
              setQuickAction('sample');
            }}
          >
            {quickAction === 'sample' ? <Check className='h-4 w-4' /> : <FileText className='h-4 w-4' />}
            Sample
          </Button>
          <Button
            type='button'
            variant={quickAction === 'blank' ? 'default' : 'outline'}
            className='flex-1'
            onClick={() => {
              setFile(null);
              setQuickAction('blank');
            }}
          >
            {quickAction === 'blank' ? <Check className='h-4 w-4' /> : <FilePlus2 className='h-4 w-4' />}
            Blank
          </Button>
        </div>
      </div>

      <div className='space-y-2'>
        <Label htmlFor='display-name'>Display name</Label>
        <Input id='display-name' value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
      </div>

      {startRoom.error && <p className='text-sm text-destructive'>{startRoom.error.message}</p>}
      <Button type='submit' className='w-full' disabled={startRoom.isPending || !roomId}>
        {startRoom.isPending ? 'Starting room…' : 'Open collaborative document'}
      </Button>
    </form>
  );
}
