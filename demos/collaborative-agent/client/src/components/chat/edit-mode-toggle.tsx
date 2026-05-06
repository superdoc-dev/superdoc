import { cn } from '@/lib/cn';

interface EditModeToggleProps {
  value: 'direct' | 'tracked';
  onChange: (value: 'direct' | 'tracked') => void;
}

export function EditModeToggle({ value, onChange }: EditModeToggleProps) {
  return (
    <div className="inline-flex rounded-md border border-input">
      <button
        type="button"
        onClick={() => onChange('direct')}
        className={cn(
          'px-3 py-1 text-xs font-medium rounded-l-md transition-colors',
          value === 'direct'
            ? 'bg-primary text-primary-foreground'
            : 'bg-transparent text-muted-foreground hover:bg-accent',
        )}
      >
        Direct
      </button>
      <button
        type="button"
        onClick={() => onChange('tracked')}
        className={cn(
          'px-3 py-1 text-xs font-medium rounded-r-md transition-colors',
          value === 'tracked'
            ? 'bg-primary text-primary-foreground'
            : 'bg-transparent text-muted-foreground hover:bg-accent',
        )}
      >
        Tracked
      </button>
    </div>
  );
}
