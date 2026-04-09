import { useCallback, useEffect, useRef, useState } from 'react';
import { SuperDoc } from 'superdoc';
import {
  createHeadlessToolbar,
  headlessToolbarConstants,
  type HeadlessToolbarController,
  type ToolbarSnapshot,
} from 'superdoc/headless-toolbar';
import 'superdoc/style.css';

import {
  Box,
  Divider,
  IconButton,
  MenuItem,
  Paper,
  Popover,
  Select,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material';

import FormatBold from '@mui/icons-material/FormatBold';
import FormatItalic from '@mui/icons-material/FormatItalic';
import FormatUnderlined from '@mui/icons-material/FormatUnderlined';
import StrikethroughS from '@mui/icons-material/StrikethroughS';
import FormatAlignLeft from '@mui/icons-material/FormatAlignLeft';
import FormatAlignCenter from '@mui/icons-material/FormatAlignCenter';
import FormatAlignRight from '@mui/icons-material/FormatAlignRight';
import FormatAlignJustify from '@mui/icons-material/FormatAlignJustify';
import FormatListBulleted from '@mui/icons-material/FormatListBulleted';
import FormatListNumbered from '@mui/icons-material/FormatListNumbered';
import FormatColorText from '@mui/icons-material/FormatColorText';
import Undo from '@mui/icons-material/Undo';
import Redo from '@mui/icons-material/Redo';
import InsertPhoto from '@mui/icons-material/InsertPhoto';
import LinkIcon from '@mui/icons-material/Link';
import Check from '@mui/icons-material/Check';

const COMMANDS = [
  'bold', 'italic', 'underline', 'strikethrough',
  'font-family', 'font-size', 'text-color', 'text-align',
  'bullet-list', 'numbered-list', 'link', 'image',
  'undo', 'redo',
] as const;

const FONT_FAMILIES = headlessToolbarConstants.DEFAULT_FONT_FAMILY_OPTIONS;
const FONT_SIZES = headlessToolbarConstants.DEFAULT_FONT_SIZE_OPTIONS;

const ALIGN_ICONS: Record<string, React.ReactNode> = {
  left: <FormatAlignLeft fontSize="small" />,
  center: <FormatAlignCenter fontSize="small" />,
  right: <FormatAlignRight fontSize="small" />,
  justify: <FormatAlignJustify fontSize="small" />,
};

const { DEFAULT_TEXT_COLOR_OPTIONS } = headlessToolbarConstants;

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HeadlessToolbarController | null>(null);

  const [snapshot, setSnapshot] = useState<ToolbarSnapshot | null>(null);

  // Link popover state
  const [linkAnchor, setLinkAnchor] = useState<HTMLElement | null>(null);
  const [linkHref, setLinkHref] = useState('');

  // Color popover state
  const [colorAnchor, setColorAnchor] = useState<HTMLElement | null>(null);

  // --- Bootstrap SuperDoc + headless toolbar ---
  useEffect(() => {
    if (!containerRef.current) return;

    const superdoc = new SuperDoc({
      selector: containerRef.current,
      document: '/test_file.docx',
    });
    const toolbar = createHeadlessToolbar({
      superdoc: superdoc as any,
      commands: [...COMMANDS],
    });
    toolbarRef.current = toolbar;

    const unsubscribe = toolbar.subscribe(({ snapshot: s }) => setSnapshot(s));

    return () => {
      unsubscribe();
      toolbar.destroy();
      superdoc.destroy();
    };
  }, []);

  // --- Helpers ---
  const cmd = useCallback(
    (id: string) => snapshot?.commands[id as keyof typeof snapshot.commands],
    [snapshot],
  );

  const exec = useCallback(
    (id: string, payload?: unknown) => {
      toolbarRef.current?.execute(id as any, payload);
    },
    [],
  );

  // --- Formatting toggles ---
  const activeFormats = (['bold', 'italic', 'underline', 'strikethrough'] as const).filter(
    (id) => cmd(id)?.active,
  );

  const handleFormats = (_: React.MouseEvent, newFormats: string[]) => {
    const prev = new Set(activeFormats);
    const next = new Set(newFormats);
    for (const id of ['bold', 'italic', 'underline', 'strikethrough']) {
      if (prev.has(id) !== next.has(id)) exec(id);
    }
  };

  // --- Text alignment ---
  const currentAlign = (cmd('text-align')?.value as string) || 'left';

  const handleAlign = (_: React.MouseEvent, value: string | null) => {
    if (value) exec('text-align', value);
  };

  // --- Link ---
  const openLinkPopover = (e: React.MouseEvent<HTMLElement>) => {
    const href = (cmd('link')?.value as string) || '';
    setLinkHref(href);
    setLinkAnchor(e.currentTarget);
  };

  const applyLink = () => {
    exec('link', { href: linkHref || null });
    setLinkAnchor(null);
  };

  // --- Render ---
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: '#f0f0f0' }}>
      {/* Floating toolbar */}
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1.5, pb: 0.5, px: 2 }}>
        <Paper
          elevation={3}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            px: 1,
            py: 0.5,
            borderRadius: 3,
          }}
        >
          {/* Undo / Redo */}
          <Tooltip title="Undo">
            <span>
              <IconButton size="small" disabled={cmd('undo')?.disabled} onClick={() => exec('undo')}>
                <Undo fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Redo">
            <span>
              <IconButton size="small" disabled={cmd('redo')?.disabled} onClick={() => exec('redo')}>
                <Redo fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>

          <Divider orientation="vertical" flexItem />

          {/* Font family */}
          <Select
            size="small"
            variant="standard"
            disableUnderline
            value={(cmd('font-family')?.value as string) || ''}
            onChange={(e: SelectChangeEvent) => exec('font-family', e.target.value)}
            sx={{ minWidth: 100, fontSize: 13, ml: 0.5 }}
            renderValue={(v) => FONT_FAMILIES.find((f) => f.value === v)?.label ?? v.split(',')[0]?.trim() ?? v}
          >
            {FONT_FAMILIES.map((f) => (
              <MenuItem key={f.value} value={f.value} sx={{ fontFamily: f.value, fontSize: 13 }}>
                {f.label}
              </MenuItem>
            ))}
          </Select>

          {/* Font size */}
          <Select
            size="small"
            variant="standard"
            disableUnderline
            value={(cmd('font-size')?.value as string) || '11pt'}
            onChange={(e: SelectChangeEvent) => exec('font-size', e.target.value)}
            sx={{ minWidth: 48, fontSize: 13 }}
          >
            {FONT_SIZES.map((s) => (
              <MenuItem key={s.value} value={s.value} sx={{ fontSize: 13 }}>
                {s.label}
              </MenuItem>
            ))}
          </Select>

          <Divider orientation="vertical" flexItem />

          {/* Bold / Italic / Underline / Strikethrough */}
          <ToggleButtonGroup size="small" value={activeFormats} onChange={handleFormats}>
            <ToggleButton value="bold" aria-label="Bold">
              <Tooltip title="Bold"><FormatBold fontSize="small" /></Tooltip>
            </ToggleButton>
            <ToggleButton value="italic" aria-label="Italic">
              <Tooltip title="Italic"><FormatItalic fontSize="small" /></Tooltip>
            </ToggleButton>
            <ToggleButton value="underline" aria-label="Underline">
              <Tooltip title="Underline"><FormatUnderlined fontSize="small" /></Tooltip>
            </ToggleButton>
            <ToggleButton value="strikethrough" aria-label="Strikethrough">
              <Tooltip title="Strikethrough"><StrikethroughS fontSize="small" /></Tooltip>
            </ToggleButton>
          </ToggleButtonGroup>

          <Divider orientation="vertical" flexItem />

          {/* Text color */}
          <Tooltip title="Text color">
            <IconButton size="small" onClick={(e) => setColorAnchor(e.currentTarget)}>
              <FormatColorText
                fontSize="small"
                sx={{ color: (cmd('text-color')?.value as string) || '#000' }}
              />
            </IconButton>
          </Tooltip>
          <Popover
            open={Boolean(colorAnchor)}
            anchorEl={colorAnchor}
            onClose={() => setColorAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          >
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0.5, p: 1 }}>
              {DEFAULT_TEXT_COLOR_OPTIONS.map((c) => (
                <IconButton
                  key={c.value}
                  size="small"
                  onClick={() => { exec('text-color', c.value); setColorAnchor(null); }}
                  sx={{
                    width: 28, height: 28, borderRadius: 1,
                    bgcolor: c.value, '&:hover': { opacity: 0.8, bgcolor: c.value },
                  }}
                />
              ))}
            </Box>
          </Popover>

          <Divider orientation="vertical" flexItem />

          {/* Alignment */}
          <ToggleButtonGroup size="small" exclusive value={currentAlign} onChange={handleAlign}>
            {headlessToolbarConstants.DEFAULT_TEXT_ALIGN_OPTIONS.map((opt) => (
              <ToggleButton key={opt.value} value={opt.value} aria-label={opt.label}>
                <Tooltip title={opt.label}>{ALIGN_ICONS[opt.value]}</Tooltip>
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          <Divider orientation="vertical" flexItem />

          {/* Lists */}
          <Tooltip title="Bullet list">
            <ToggleButton
              size="small"
              value="bullet-list"
              selected={cmd('bullet-list')?.active}
              onChange={() => exec('bullet-list')}
            >
              <FormatListBulleted fontSize="small" />
            </ToggleButton>
          </Tooltip>
          <Tooltip title="Numbered list">
            <ToggleButton
              size="small"
              value="numbered-list"
              selected={cmd('numbered-list')?.active}
              onChange={() => exec('numbered-list')}
            >
              <FormatListNumbered fontSize="small" />
            </ToggleButton>
          </Tooltip>

          <Divider orientation="vertical" flexItem />

          {/* Link */}
          <Tooltip title="Insert link">
            <ToggleButton
              size="small"
              value="link"
              selected={cmd('link')?.active}
              onChange={openLinkPopover}
            >
              <LinkIcon fontSize="small" />
            </ToggleButton>
          </Tooltip>
          <Popover
            open={Boolean(linkAnchor)}
            anchorEl={linkAnchor}
            onClose={() => setLinkAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', p: 1, gap: 0.5 }}>
              <TextField
                size="small"
                variant="outlined"
                placeholder="https://..."
                value={linkHref}
                onChange={(e) => setLinkHref(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') applyLink(); }}
                sx={{ width: 240 }}
              />
              <IconButton size="small" color="primary" onClick={applyLink}>
                <Check fontSize="small" />
              </IconButton>
            </Box>
          </Popover>

          {/* Image */}
          <Tooltip title="Insert image">
            <span>
              <IconButton size="small" disabled={cmd('image')?.disabled} onClick={() => exec('image')}>
                <InsertPhoto fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Paper>
      </Box>

      {/* Editor container */}
      <Box ref={containerRef} sx={{ flex: 1, overflow: 'auto' }} />
    </Box>
  );
}
