import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SidebarToggleProps {
  collapsed: boolean;
  onToggle: () => void;
  side: 'left' | 'right';
}

export function SidebarToggle({ collapsed, onToggle, side }: SidebarToggleProps) {
  const icon = side === 'left'
    ? collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />
    : collapsed ? <PanelRightOpen className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />;

  const label = `${collapsed ? 'Expand' : 'Collapse'} ${side} sidebar`;

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 shrink-0"
      onClick={onToggle}
      title={label}
      aria-label={label}
    >
      {icon}
    </Button>
  );
}
