import { useState, useRef, useCallback } from 'react';
import { Upload, FileText, FilePlus2, RefreshCw, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { generateRoomName } from '@/lib/room-names';
import { useStartRoom } from '@/hooks/use-start-room';
import { cn } from '@/lib/cn';

const MODELS = [
  { value: 'gpt-5.4', label: 'GPT-5.4' },
  { value: 'gpt-5.2', label: 'GPT-5.2' },
  { value: 'o3', label: 'o3' },
  { value: 'o4-mini', label: 'o4-mini' },
  { value: 'gpt-4.1', label: 'GPT-4.1' },
  { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
];

export function CreateRoomForm() {
  const [roomName, setRoomName] = useState(generateRoomName);
  const [model, setModel] = useState('gpt-5.4');
  const [changeMode, setChangeMode] = useState('direct');
  const [displayName, setDisplayName] = useState('User');
  const [file, setFile] = useState<File | null>(null);
  const [quickAction, setQuickAction] = useState<'sample' | 'blank' | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const startRoom = useStartRoom();

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setQuickAction(null);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) {
      setFile(dropped);
      setQuickAction(null);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const useSample = quickAction === 'sample';
    sessionStorage.setItem('displayName', displayName);
    startRoom.mutate({
      roomId: roomName,
      model,
      changeMode,
      useSample: useSample || undefined,
      file: !useSample ? file : undefined,
    });
  };

  const handleUseSample = (e: React.MouseEvent) => {
    e.preventDefault();
    setFile(null);
    setQuickAction('sample');
  };

  const handleStartBlank = (e: React.MouseEvent) => {
    e.preventDefault();
    setFile(null);
    setQuickAction('blank');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Room Name */}
      <div className="space-y-2">
        <Label htmlFor="room-name">Room name</Label>
        <div className="flex gap-2">
          <Input
            id="room-name"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            placeholder="my-room"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setRoomName(generateRoomName())}
            title="Generate new name"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* File Upload */}
      <div className="space-y-2">
        <Label>Document</Label>
        <div
          className={cn(
            'relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8 transition-colors cursor-pointer',
            isDragOver
              ? 'border-primary/60 bg-primary/5'
              : 'border-muted-foreground/25 hover:border-muted-foreground/40',
            (file || quickAction) && 'border-primary/40 bg-primary/5',
          )}
          onClick={() => {
            if (!quickAction) fileInputRef.current?.click();
          }}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".docx"
            onChange={handleFileChange}
            className="hidden"
          />
          {file ? (
            <div className="flex items-center gap-2 text-sm">
              <FileText className="h-5 w-5 text-primary" />
              <span className="font-medium">{file.name}</span>
              <button
                type="button"
                className="ml-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  setFile(null);
                }}
              >
                Remove
              </button>
            </div>
          ) : quickAction === 'sample' ? (
            <div className="flex items-center gap-2 text-sm">
              <FileText className="h-5 w-5 text-primary" />
              <span className="font-medium">Sample document selected</span>
              <button
                type="button"
                className="ml-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  setQuickAction(null);
                }}
              >
                Remove
              </button>
            </div>
          ) : quickAction === 'blank' ? (
            <div className="flex items-center gap-2 text-sm">
              <FilePlus2 className="h-5 w-5 text-primary" />
              <span className="font-medium">Starting with blank document</span>
              <button
                type="button"
                className="ml-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  setQuickAction(null);
                }}
              >
                Remove
              </button>
            </div>
          ) : (
            <>
              <Upload className="h-8 w-8 text-muted-foreground/60 mb-2" />
              <p className="text-sm text-muted-foreground">
                Drop a <span className="font-medium">.docx</span> file here, or click to browse
              </p>
            </>
          )}
        </div>

        {/* Quick actions */}
        <div className="flex gap-2">
          <Button
            type="button"
            variant={quickAction === 'sample' ? 'default' : 'outline'}
            size="sm"
            className="flex-1 text-xs"
            onClick={handleUseSample}
            disabled={startRoom.isPending}
          >
            {quickAction === 'sample' ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <FileText className="h-3.5 w-3.5" />
            )}
            Use sample document
          </Button>
          <Button
            type="button"
            variant={quickAction === 'blank' ? 'default' : 'outline'}
            size="sm"
            className="flex-1 text-xs"
            onClick={handleStartBlank}
            disabled={startRoom.isPending}
          >
            {quickAction === 'blank' ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <FilePlus2 className="h-3.5 w-3.5" />
            )}
            Start blank
          </Button>
        </div>
      </div>

      {/* Model */}
      <div className="space-y-2">
        <Label htmlFor="model">Model</Label>
        <Select value={model} onValueChange={setModel}>
          <SelectTrigger id="model">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MODELS.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Edit Mode */}
      <div className="space-y-2">
        <Label>Edit mode</Label>
        <div className="flex rounded-md border border-input overflow-hidden">
          <button
            type="button"
            className={cn(
              'flex-1 px-3 py-2 text-sm font-medium transition-colors',
              changeMode === 'direct'
                ? 'bg-primary text-primary-foreground'
                : 'bg-background text-muted-foreground hover:text-foreground hover:bg-accent',
            )}
            onClick={() => setChangeMode('direct')}
          >
            Direct
          </button>
          <button
            type="button"
            className={cn(
              'flex-1 px-3 py-2 text-sm font-medium transition-colors border-l border-input',
              changeMode === 'tracked'
                ? 'bg-primary text-primary-foreground'
                : 'bg-background text-muted-foreground hover:text-foreground hover:bg-accent',
            )}
            onClick={() => setChangeMode('tracked')}
          >
            Tracked
          </button>
        </div>
      </div>

      {/* Display Name */}
      <div className="space-y-2">
        <Label htmlFor="display-name">Display name</Label>
        <Input
          id="display-name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Your name"
        />
      </div>

      {/* Submit */}
      <Button
        type="submit"
        className="w-full"
        disabled={startRoom.isPending}
      >
        {startRoom.isPending ? 'Creating...' : 'Create Room'}
      </Button>

      {startRoom.isError && (
        <p className="text-sm text-destructive text-center">
          {startRoom.error.message}
        </p>
      )}
    </form>
  );
}
