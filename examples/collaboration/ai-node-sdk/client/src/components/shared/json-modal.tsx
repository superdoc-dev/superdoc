import { useCallback, useRef, useState, useEffect } from 'react';
import { X, Copy, Check, GripHorizontal } from 'lucide-react';
import { JsonViewer } from './json-viewer';

interface JsonModalProps {
  title: string;
  data: unknown;
  onClose: () => void;
  initialPosition?: { x: number; y: number };
}

export function JsonModal({ title, data, onClose, initialPosition }: JsonModalProps) {
  const [copied, setCopied] = useState(false);
  const [pos, setPos] = useState(initialPosition ?? { x: 100, y: 100 });
  const [size, setSize] = useState({ w: 420, h: 340 });
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; origW: number; origH: number } | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Drag
  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      setPos({
        x: dragRef.current.origX + (ev.clientX - dragRef.current.startX),
        y: dragRef.current.origY + (ev.clientY - dragRef.current.startY),
      });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [pos]);

  // Resize
  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { startX: e.clientX, startY: e.clientY, origW: size.w, origH: size.h };

    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      setSize({
        w: Math.max(280, resizeRef.current.origW + (ev.clientX - resizeRef.current.startX)),
        h: Math.max(200, resizeRef.current.origH + (ev.clientY - resizeRef.current.startY)),
      });
    };
    const onUp = () => {
      resizeRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [size]);

  // Bring to front on click
  useEffect(() => {
    const el = modalRef.current;
    if (!el) return;
    const bringToFront = () => {
      const modals = document.querySelectorAll('[data-json-modal]');
      modals.forEach((m) => ((m as HTMLElement).style.zIndex = '1000'));
      el.style.zIndex = '1001';
    };
    el.addEventListener('mousedown', bringToFront);
    return () => el.removeEventListener('mousedown', bringToFront);
  }, []);

  return (
    <div
      ref={modalRef}
      data-json-modal
      className="fixed rounded-lg border border-border bg-background shadow-xl
                 flex flex-col overflow-hidden"
      style={{
        left: pos.x,
        top: pos.y,
        width: size.w,
        height: size.h,
        zIndex: 1001,
      }}
    >
      {/* Header - draggable */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b bg-muted/50 cursor-grab active:cursor-grabbing select-none"
        onMouseDown={onDragStart}
      >
        <GripHorizontal className="h-3.5 w-3.5 text-muted-foreground/50" />
        <span className="text-xs font-medium truncate flex-1">{title}</span>
        <button onClick={handleCopy} className="p-1 rounded hover:bg-accent transition-colors" title="Copy">
          {copied
            ? <Check className="h-3 w-3 text-emerald-500" />
            : <Copy className="h-3 w-3 text-muted-foreground" />}
        </button>
        <button onClick={onClose} className="p-1 rounded hover:bg-accent transition-colors" title="Close">
          <X className="h-3 w-3 text-muted-foreground" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-2">
        <JsonViewer data={data} maxHeight="none" />
      </div>

      {/* Resize handle */}
      <div
        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
        onMouseDown={onResizeStart}
      >
        <svg className="w-3 h-3 text-muted-foreground/40 absolute bottom-0.5 right-0.5" viewBox="0 0 12 12">
          <path d="M10 2L2 10M10 6L6 10M10 10L10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}
