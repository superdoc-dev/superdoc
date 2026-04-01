import { useEffect, useRef, useState } from 'react';
import { SuperDoc } from 'superdoc';
import {
  headlessToolbarConstants,
  type PublicToolbarItemId,
  type ToolbarSnapshot,
  type ToolbarExecuteFn,
} from 'superdoc/headless-toolbar';
import { useHeadlessToolbar } from 'superdoc/headless-toolbar/react';
import 'superdoc/style.css';

import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';
import * as SelectPrimitive from '@radix-ui/react-select';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import * as SeparatorPrimitive from '@radix-ui/react-separator';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Undo2,
  Redo2,
  ZoomIn,
  Image,
  Paintbrush,
  Type,
  Link,
  ChevronDown,
  Check,
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function cn(...inputs: Parameters<typeof clsx>) {
  return twMerge(clsx(inputs));
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const {
  DEFAULT_FONT_FAMILY_OPTIONS,
  DEFAULT_FONT_SIZE_OPTIONS,
  DEFAULT_ZOOM_OPTIONS,
  DEFAULT_TEXT_COLOR_OPTIONS,
  DEFAULT_HIGHLIGHT_COLOR_OPTIONS,
} = headlessToolbarConstants;

const COMMANDS: PublicToolbarItemId[] = [
  'bold', 'italic', 'underline', 'strikethrough',
  'font-family', 'font-size',
  'text-color', 'highlight-color',
  'text-align',
  'bullet-list', 'numbered-list',
  'link',
  'undo', 'redo',
  'zoom',
  'image',
];

const ALIGN_ICONS = {
  left: AlignLeft,
  center: AlignCenter,
  right: AlignRight,
  justify: AlignJustify,
} as const;

// ---------------------------------------------------------------------------
// Shared Radix-based UI primitives (shadcn/ui-style)
// ---------------------------------------------------------------------------

function Tooltip({ children, content }: { children: React.ReactNode; content: string }) {
  return (
    <TooltipPrimitive.Root delayDuration={300}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side="bottom"
          sideOffset={6}
          className="z-50 rounded-md bg-zinc-900 px-2 py-1 text-xs text-white shadow-md animate-in fade-in-0 zoom-in-95"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

function Separator() {
  return (
    <SeparatorPrimitive.Root
      orientation="vertical"
      className="mx-1 h-6 w-px bg-zinc-200"
    />
  );
}

// ---------------------------------------------------------------------------
// Toolbar components
// ---------------------------------------------------------------------------

function FormatToggles({
  snapshot,
  onExecute,
}: {
  snapshot: ToolbarSnapshot;
  onExecute: ToolbarExecuteFn;
}) {
  const items: { id: PublicToolbarItemId; icon: typeof Bold; label: string }[] = [
    { id: 'bold', icon: Bold, label: 'Bold' },
    { id: 'italic', icon: Italic, label: 'Italic' },
    { id: 'underline', icon: Underline, label: 'Underline' },
    { id: 'strikethrough', icon: Strikethrough, label: 'Strikethrough' },
  ];

  const activeIds = items.filter(({ id }) => snapshot.commands[id]?.active).map(({ id }) => id);

  return (
    <ToggleGroupPrimitive.Root
      type="multiple"
      value={activeIds}
      onValueChange={() => {/* controlled by snapshot */}}
      className="flex items-center gap-0.5"
    >
      {items.map(({ id, icon: Icon, label }) => {
        const state = snapshot.commands[id];
        return (
          <Tooltip key={id} content={label}>
            <ToggleGroupPrimitive.Item
              value={id}
              disabled={state?.disabled}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onExecute(id)}
              className={cn(
                'inline-flex h-8 w-8 items-center justify-center rounded-md text-sm transition-colors',
                'hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400',
                'disabled:pointer-events-none disabled:opacity-50',
                state?.active && 'bg-zinc-200 text-zinc-900',
              )}
            >
              <Icon className="h-4 w-4" />
            </ToggleGroupPrimitive.Item>
          </Tooltip>
        );
      })}
    </ToggleGroupPrimitive.Root>
  );
}

function FontFamilySelect({
  snapshot,
  onExecute,
}: {
  snapshot: ToolbarSnapshot;
  onExecute: ToolbarExecuteFn;
}) {
  const current = (snapshot.commands['font-family']?.value as string) ?? '';
  const currentLabel =
    DEFAULT_FONT_FAMILY_OPTIONS.find((o) => o.value === current)?.label ?? current.split(',')[0] ?? 'Font';

  return (
    <Tooltip content="Font family">
      <SelectPrimitive.Root
        value={current}
        onValueChange={(val) => onExecute('font-family', val)}
      >
        <SelectPrimitive.Trigger
          className={cn(
            'inline-flex h-8 min-w-[7rem] items-center justify-between gap-1 rounded-md border border-zinc-200 bg-white px-2 text-sm',
            'hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400',
            'disabled:pointer-events-none disabled:opacity-50',
          )}
          disabled={snapshot.commands['font-family']?.disabled}
        >
          <span className="truncate">{currentLabel}</span>
          <SelectPrimitive.Icon>
            <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>

        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            position="popper"
            sideOffset={4}
            className="z-50 max-h-60 overflow-auto rounded-md border border-zinc-200 bg-white shadow-lg"
          >
            <SelectPrimitive.Viewport className="p-1">
              {DEFAULT_FONT_FAMILY_OPTIONS.map((opt) => (
                <SelectPrimitive.Item
                  key={opt.value}
                  value={opt.value}
                  className={cn(
                    'relative flex h-8 cursor-pointer items-center rounded-sm px-2 pr-8 text-sm outline-none',
                    'data-[highlighted]:bg-zinc-100',
                  )}
                  style={{ fontFamily: opt.value }}
                >
                  <SelectPrimitive.ItemText>{opt.label}</SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator className="absolute right-2">
                    <Check className="h-3.5 w-3.5" />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    </Tooltip>
  );
}

function FontSizeSelect({
  snapshot,
  onExecute,
}: {
  snapshot: ToolbarSnapshot;
  onExecute: ToolbarExecuteFn;
}) {
  const current = (snapshot.commands['font-size']?.value as string) ?? '';
  const currentLabel = DEFAULT_FONT_SIZE_OPTIONS.find((o) => o.value === current)?.label ?? current.replace('pt', '');

  return (
    <Tooltip content="Font size">
      <SelectPrimitive.Root
        value={current}
        onValueChange={(val) => onExecute('font-size', val)}
      >
        <SelectPrimitive.Trigger
          className={cn(
            'inline-flex h-8 w-[4.5rem] items-center justify-between gap-1 rounded-md border border-zinc-200 bg-white px-2 text-sm',
            'hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400',
            'disabled:pointer-events-none disabled:opacity-50',
          )}
          disabled={snapshot.commands['font-size']?.disabled}
        >
          <span className="truncate">{currentLabel || 'Size'}</span>
          <SelectPrimitive.Icon>
            <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>

        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            position="popper"
            sideOffset={4}
            className="z-50 max-h-60 overflow-auto rounded-md border border-zinc-200 bg-white shadow-lg"
          >
            <SelectPrimitive.Viewport className="p-1">
              {DEFAULT_FONT_SIZE_OPTIONS.map((opt) => (
                <SelectPrimitive.Item
                  key={opt.value}
                  value={opt.value}
                  className={cn(
                    'relative flex h-8 cursor-pointer items-center rounded-sm px-2 pr-8 text-sm outline-none',
                    'data-[highlighted]:bg-zinc-100',
                  )}
                >
                  <SelectPrimitive.ItemText>{opt.label}</SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator className="absolute right-2">
                    <Check className="h-3.5 w-3.5" />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    </Tooltip>
  );
}

function ColorPickerPopover({
  commandId,
  icon: Icon,
  label,
  options,
  snapshot,
  onExecute,
}: {
  commandId: PublicToolbarItemId;
  icon: typeof Type;
  label: string;
  options: readonly { readonly label: string; readonly value: string }[];
  snapshot: ToolbarSnapshot;
  onExecute: ToolbarExecuteFn;
}) {
  const currentColor = (snapshot.commands[commandId]?.value as string) ?? '#000000';

  return (
    <PopoverPrimitive.Root>
      <Tooltip content={label}>
        <PopoverPrimitive.Trigger
          className={cn(
            'inline-flex h-8 w-8 flex-col items-center justify-center rounded-md text-sm transition-colors',
            'hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400',
            'disabled:pointer-events-none disabled:opacity-50',
          )}
          disabled={snapshot.commands[commandId]?.disabled}
        >
          <Icon className="h-4 w-4" />
          <span
            className="mt-0.5 h-0.5 w-4 rounded-full"
            style={{ backgroundColor: currentColor === 'none' ? 'transparent' : currentColor }}
          />
        </PopoverPrimitive.Trigger>
      </Tooltip>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="bottom"
          sideOffset={6}
          className="z-50 w-48 rounded-lg border border-zinc-200 bg-white p-3 shadow-lg"
        >
          <div className="flex flex-wrap gap-1">
            {options.map((opt) => (
              <button
                key={opt.value}
                title={opt.label}
                className={cn(
                  'h-5 w-5 rounded-sm border border-zinc-300 transition-transform hover:scale-125 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400',
                  currentColor === opt.value && 'ring-2 ring-zinc-600 ring-offset-1',
                )}
                style={{ backgroundColor: opt.value === 'none' ? 'transparent' : opt.value }}
                onClick={() => onExecute(commandId, opt.value)}
              />
            ))}
          </div>
          <button
            className="mt-2 w-full rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
            onClick={() => onExecute(commandId, 'none')}
          >
            Remove color
          </button>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

function AlignSelect({
  snapshot,
  onExecute,
}: {
  snapshot: ToolbarSnapshot;
  onExecute: ToolbarExecuteFn;
}) {
  const current = ((snapshot.commands['text-align']?.value as string) ?? 'left') as keyof typeof ALIGN_ICONS;
  const ActiveIcon = ALIGN_ICONS[current] ?? AlignLeft;

  return (
    <Tooltip content="Text alignment">
      <SelectPrimitive.Root
        value={current}
        onValueChange={(val) => onExecute('text-align', val)}
      >
        <SelectPrimitive.Trigger
          className={cn(
            'inline-flex h-8 w-14 items-center justify-between gap-0.5 rounded-md border border-zinc-200 bg-white px-1.5 text-sm',
            'hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400',
            'disabled:pointer-events-none disabled:opacity-50',
          )}
          disabled={snapshot.commands['text-align']?.disabled}
        >
          <ActiveIcon className="h-4 w-4" />
          <SelectPrimitive.Icon>
            <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>

        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            position="popper"
            sideOffset={4}
            className="z-50 rounded-md border border-zinc-200 bg-white shadow-lg"
          >
            <SelectPrimitive.Viewport className="p-1">
              {Object.entries(ALIGN_ICONS).map(([value, Icon]) => (
                <SelectPrimitive.Item
                  key={value}
                  value={value}
                  className={cn(
                    'relative flex h-8 cursor-pointer items-center gap-2 rounded-sm px-2 pr-8 text-sm outline-none',
                    'data-[highlighted]:bg-zinc-100',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <SelectPrimitive.ItemText>
                    {value.charAt(0).toUpperCase() + value.slice(1)}
                  </SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator className="absolute right-2">
                    <Check className="h-3.5 w-3.5" />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    </Tooltip>
  );
}

function ListToggles({
  snapshot,
  onExecute,
}: {
  snapshot: ToolbarSnapshot;
  onExecute: ToolbarExecuteFn;
}) {
  const items: { id: PublicToolbarItemId; icon: typeof List; label: string }[] = [
    { id: 'bullet-list', icon: List, label: 'Bullet list' },
    { id: 'numbered-list', icon: ListOrdered, label: 'Numbered list' },
  ];

  const activeIds = items.filter(({ id }) => snapshot.commands[id]?.active).map(({ id }) => id);

  return (
    <ToggleGroupPrimitive.Root
      type="multiple"
      value={activeIds}
      onValueChange={() => {}}
      className="flex items-center gap-0.5"
    >
      {items.map(({ id, icon: Icon, label }) => {
        const state = snapshot.commands[id];
        return (
          <Tooltip key={id} content={label}>
            <ToggleGroupPrimitive.Item
              value={id}
              disabled={state?.disabled}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onExecute(id)}
              className={cn(
                'inline-flex h-8 w-8 items-center justify-center rounded-md text-sm transition-colors',
                'hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400',
                'disabled:pointer-events-none disabled:opacity-50',
                state?.active && 'bg-zinc-200 text-zinc-900',
              )}
            >
              <Icon className="h-4 w-4" />
            </ToggleGroupPrimitive.Item>
          </Tooltip>
        );
      })}
    </ToggleGroupPrimitive.Root>
  );
}

function LinkPopover({
  snapshot,
  onExecute,
}: {
  snapshot: ToolbarSnapshot;
  onExecute: ToolbarExecuteFn;
}) {
  const [href, setHref] = useState('');
  const state = snapshot.commands['link'];
  const currentHref = (state?.value as string) ?? '';

  return (
    <PopoverPrimitive.Root
      onOpenChange={(open) => {
        if (open) setHref(currentHref || '');
      }}
    >
      <Tooltip content="Insert link">
        <PopoverPrimitive.Trigger
          className={cn(
            'inline-flex h-8 w-8 items-center justify-center rounded-md text-sm transition-colors',
            'hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400',
            'disabled:pointer-events-none disabled:opacity-50',
            state?.active && 'bg-zinc-200 text-zinc-900',
          )}
          disabled={state?.disabled}
        >
          <Link className="h-4 w-4" />
        </PopoverPrimitive.Trigger>
      </Tooltip>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="bottom"
          sideOffset={6}
          className="z-50 w-72 rounded-lg border border-zinc-200 bg-white p-3 shadow-lg"
        >
          <label className="mb-1 block text-xs font-medium text-zinc-600">URL</label>
          <input
            type="url"
            value={href}
            onChange={(e) => setHref(e.target.value)}
            placeholder="https://example.com"
            className="mb-2 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-zinc-400"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onExecute('link', { href: href || null });
              }
            }}
          />
          <div className="flex gap-2">
            <button
              className="flex-1 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
              onClick={() => onExecute('link', { href: href || null })}
            >
              Apply
            </button>
            {currentHref && (
              <button
                className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50"
                onClick={() => onExecute('link', { href: null })}
              >
                Remove
              </button>
            )}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

function ZoomSelect({
  snapshot,
  onExecute,
}: {
  snapshot: ToolbarSnapshot;
  onExecute: ToolbarExecuteFn;
}) {
  const current = (snapshot.commands['zoom']?.value as number) ?? 100;
  const currentStr = String(current);

  return (
    <Tooltip content="Zoom">
      <SelectPrimitive.Root
        value={currentStr}
        onValueChange={(val) => onExecute('zoom', Number(val))}
      >
        <SelectPrimitive.Trigger
          className={cn(
            'inline-flex h-8 items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 text-sm',
            'hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400',
            'disabled:pointer-events-none disabled:opacity-50',
          )}
          disabled={snapshot.commands['zoom']?.disabled}
        >
          <ZoomIn className="h-3.5 w-3.5 text-zinc-500" />
          <span>{current}%</span>
          <SelectPrimitive.Icon>
            <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>

        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            position="popper"
            sideOffset={4}
            className="z-50 rounded-md border border-zinc-200 bg-white shadow-lg"
          >
            <SelectPrimitive.Viewport className="p-1">
              {DEFAULT_ZOOM_OPTIONS.map((opt) => (
                <SelectPrimitive.Item
                  key={opt.value}
                  value={String(opt.value)}
                  className={cn(
                    'relative flex h-8 cursor-pointer items-center rounded-sm px-2 pr-8 text-sm outline-none',
                    'data-[highlighted]:bg-zinc-100',
                  )}
                >
                  <SelectPrimitive.ItemText>{opt.label}</SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator className="absolute right-2">
                    <Check className="h-3.5 w-3.5" />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    </Tooltip>
  );
}

function ToolbarButton({
  id,
  icon: Icon,
  label,
  snapshot,
  onExecute,
}: {
  id: PublicToolbarItemId;
  icon: typeof Bold;
  label: string;
  snapshot: ToolbarSnapshot;
  onExecute: ToolbarExecuteFn;
}) {
  const state = snapshot.commands[id];
  return (
    <Tooltip content={label}>
      <button
        disabled={state?.disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onExecute(id)}
        className={cn(
          'inline-flex h-8 w-8 items-center justify-center rounded-md text-sm transition-colors',
          'hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400',
          'disabled:pointer-events-none disabled:opacity-50',
          state?.active && 'bg-zinc-200 text-zinc-900',
        )}
      >
        <Icon className="h-4 w-4" />
      </button>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// Main toolbar
// ---------------------------------------------------------------------------

function Toolbar({
  snapshot,
  onExecute,
}: {
  snapshot: ToolbarSnapshot;
  onExecute: ToolbarExecuteFn;
}) {
  return (
    <div className="flex items-center gap-1 border-b border-zinc-200 bg-white px-3 py-1.5 overflow-x-auto">
      {/* Undo / Redo */}
      <ToolbarButton id="undo" icon={Undo2} label="Undo" snapshot={snapshot} onExecute={onExecute} />
      <ToolbarButton id="redo" icon={Redo2} label="Redo" snapshot={snapshot} onExecute={onExecute} />

      <Separator />

      {/* Font family & size */}
      <FontFamilySelect snapshot={snapshot} onExecute={onExecute} />
      <FontSizeSelect snapshot={snapshot} onExecute={onExecute} />

      <Separator />

      {/* Bold / Italic / Underline / Strikethrough */}
      <FormatToggles snapshot={snapshot} onExecute={onExecute} />

      <Separator />

      {/* Text color & highlight */}
      <ColorPickerPopover commandId="text-color" icon={Type} label="Text color" options={DEFAULT_TEXT_COLOR_OPTIONS} snapshot={snapshot} onExecute={onExecute} />
      <ColorPickerPopover commandId="highlight-color" icon={Paintbrush} label="Highlight color" options={DEFAULT_HIGHLIGHT_COLOR_OPTIONS} snapshot={snapshot} onExecute={onExecute} />

      <Separator />

      {/* Link */}
      <LinkPopover snapshot={snapshot} onExecute={onExecute} />

      <Separator />

      {/* Alignment */}
      <AlignSelect snapshot={snapshot} onExecute={onExecute} />

      <Separator />

      {/* Lists */}
      <ListToggles snapshot={snapshot} onExecute={onExecute} />

      <Separator />

      {/* Image */}
      <ToolbarButton id="image" icon={Image} label="Insert image" snapshot={snapshot} onExecute={onExecute} />

      {/* Push zoom to the right */}
      <div className="flex-1" />

      {/* Zoom */}
      <ZoomSelect snapshot={snapshot} onExecute={onExecute} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [superdoc, setSuperdoc] = useState<SuperDoc | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const sd = new SuperDoc({ selector: el, document: '/test_file.docx' });
    setSuperdoc(sd);
    return () => { sd.destroy(); setSuperdoc(null); };
  }, []);

  const { snapshot, execute: handleExecute } = useHeadlessToolbar(superdoc, COMMANDS);

  return (
    <TooltipPrimitive.Provider>
      <div className="flex h-full flex-col bg-zinc-50">
        <Toolbar snapshot={snapshot} onExecute={handleExecute} />
        <div ref={containerRef} className="flex-1 overflow-auto" />
      </div>
    </TooltipPrimitive.Provider>
  );
}
