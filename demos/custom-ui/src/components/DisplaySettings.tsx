import { useEffect, useState } from 'react';

/**
 * Two color swatches that re-theme tracked changes and comment highlights
 * by writing the public `--sd-*` CSS custom properties on `:root`. Stays
 * consistent with the demo's "no UI kit" posture: native `<input
 * type='color'>` hidden behind a styled label, written into `document
 * .documentElement.style` so the variables cascade into the editor's
 * shadow boundary the same way a consumer override would.
 *
 * The hex inputs are normalized to lowercase and combined with alpha
 * suffixes (`22`, `40`, `66`) to match the shipped fade / active / focused
 * variants in `variables.css`.
 */

const DEFAULTS = {
  trackedChanges: '#00853d',
  comments: '#b1124b',
};

export function DisplaySettings() {
  const [trackedChanges, setTrackedChanges] = useState(DEFAULTS.trackedChanges);
  const [comments, setComments] = useState(DEFAULTS.comments);

  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty('--sd-track-insert-border', trackedChanges);
    root.setProperty('--sd-track-insert-bg', `${trackedChanges}22`);
    root.setProperty('--sd-tracked-changes-insert-background-focused', `${trackedChanges}44`);
  }, [trackedChanges]);

  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty('--sd-comments-highlight-external-base', comments);
    root.setProperty('--sd-comment-highlight-external', `${comments}40`);
    root.setProperty('--sd-comments-highlight-external-active', `${comments}66`);
    root.setProperty('--sd-comments-highlight-external-faded', `${comments}20`);
  }, [comments]);

  return (
    <>
      <ColorSwatch
        label="Tracked-change color"
        value={trackedChanges}
        onChange={setTrackedChanges}
        icon={<TrackChangeIcon />}
      />
      <ColorSwatch
        label="Comment color"
        value={comments}
        onChange={setComments}
        icon={<CommentIcon />}
      />
    </>
  );
}

function ColorSwatch({
  label,
  value,
  onChange,
  icon,
}: {
  label: string;
  value: string;
  onChange(next: string): void;
  icon: React.ReactNode;
}) {
  return (
    <label className="tb-btn color-swatch" title={label} style={{ backgroundColor: value }}>
      <span className="color-swatch-icon" aria-hidden>
        {icon}
      </span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
      />
    </label>
  );
}

const ICON_PROPS = {
  width: 14,
  height: 14,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.25,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function TrackChangeIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
