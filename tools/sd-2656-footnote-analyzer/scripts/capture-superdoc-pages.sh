#!/usr/bin/env bash
# Captures one PNG per SuperDoc page using two stitched scrollIntoView shots
# (Word's PNGs are already in ~/Documents/sd-2656-it923-current-fixtures/word-page-NN.png).
#
# Usage:
#   ./capture-superdoc-pages.sh [DEV_PORT] [START_PAGE] [END_PAGE]
#
# Defaults: DEV_PORT auto-detected, START_PAGE=0, END_PAGE=last
#
# Output: tools/sd-2656-footnote-analyzer/output/per-page/sd/page-NN.png
set -uo pipefail
# Do NOT use `set -e` — one bad page should skip, not abort the run.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEV_PORT="${1:-}"
START="${2:-0}"
END="${3:-}"

if [ -z "$DEV_PORT" ]; then
  DEV_PORT=$(lsof -iTCP -sTCP:LISTEN -P 2>/dev/null | grep -oE '909[0-9]+' | sort -u | head -1)
fi

OUT="$ROOT/output/per-page/sd"
mkdir -p "$OUT"

# Assumes the browser is already pointed at the dev app with the fixture loaded
# (run capture.sh first). Read total page count from the layout snapshot
# (virtualization-independent), NOT from the DOM (which only has ~7 pages mounted).
TOTAL=$(agent-browser eval "
  const ed = window.editor || window.superdoc?.activeEditor;
  const snap = ed?.presentationEditor?.getLayoutSnapshot?.();
  snap?.layout?.pages?.length ?? 0;
" 2>&1 | tail -1 | tr -d '"')
if [ -z "$TOTAL" ] || [ "$TOTAL" = "0" ]; then
  echo "ERROR: no layout pages found. Run capture.sh first to load the fixture." >&2
  exit 1
fi

if [ -z "$END" ]; then
  END=$((TOTAL - 1))
fi

echo "[capture-pages] capturing pages $START..$END of $TOTAL"

# Hide chrome to maximize viewport.
agent-browser eval "
  const h = document.querySelector('.dev-app__header');
  const t = document.querySelector('.dev-app__toolbar-ruler-container');
  if (h) h.style.display = 'none';
  if (t) t.style.display = 'none';
" > /dev/null 2>&1

CLIP=$(agent-browser eval "
  const r = document.querySelector('.dev-app__main').getBoundingClientRect();
  r.x + ',' + r.y + ',' + (r.x + r.width) + ',' + (r.y + r.height);
" 2>&1 | tail -1 | tr -d '"')

if [ -z "$CLIP" ] || [ "$CLIP" = "null" ]; then
  echo "ERROR: failed to read .dev-app__main clip rect" >&2
  exit 1
fi
echo "[capture-pages] clip rect: $CLIP"

# Discover scroll geometry once for virtualization-aware page mounting.
SCROLL_HEIGHT=$(agent-browser eval "document.querySelector('.dev-app__main').scrollHeight" 2>&1 | tail -1 | tr -d '"')
APPROX_PAGE_H=$(python3 -c "print(int($SCROLL_HEIGHT / $TOTAL))")
echo "[capture-pages] scrollHeight=$SCROLL_HEIGHT, ~page height=$APPROX_PAGE_H px"

for ((i=START; i<=END; i++)); do
  PAGE_NUM=$(printf "%02d" $((i + 1)))
  OUT_PATH="$OUT/page-$PAGE_NUM.png"

  # Step 1: scroll dev-app__main to roughly page i's position to mount it.
  TARGET_SCROLL=$((i * APPROX_PAGE_H))
  agent-browser eval "document.querySelector('.dev-app__main').scrollTop = $TARGET_SCROLL" > /dev/null 2>&1
  sleep 0.5

  # Step 2: now scrollIntoView for precise alignment (top).
  agent-browser eval "document.querySelector('[data-page-index=\"$i\"]')?.scrollIntoView({block:'start'})" > /dev/null 2>&1
  sleep 0.3
  RT=$(agent-browser eval "
    const el = document.querySelector('[data-page-index=\"$i\"]');
    if (!el) 'NONE'; else { const r = el.getBoundingClientRect(); r.x + ',' + r.y + ',' + r.width + ',' + r.height; }
  " 2>&1 | tail -1 | tr -d '"')
  if [ "$RT" = "NONE" ]; then
    echo "  page $i: NOT MOUNTED after scroll, skipping" >&2
    continue
  fi
  agent-browser screenshot /tmp/snap-top.png > /dev/null 2>&1

  # Bottom-aligned
  agent-browser eval "document.querySelector('[data-page-index=\"$i\"]')?.scrollIntoView({block:'end'})" > /dev/null 2>&1
  sleep 0.3
  RB=$(agent-browser eval "
    const el = document.querySelector('[data-page-index=\"$i\"]');
    const r = el.getBoundingClientRect(); r.x + ',' + r.y + ',' + r.width + ',' + r.height;
  " 2>&1 | tail -1 | tr -d '"')
  agent-browser screenshot /tmp/snap-bot.png > /dev/null 2>&1

  RT="$RT" RB="$RB" CLIP="$CLIP" OUT="$OUT_PATH" python3 - <<'PY'
import os
from PIL import Image
rt = list(map(float, os.environ['RT'].split(',')))
rb = list(map(float, os.environ['RB'].split(',')))
cx0, cy0, cx1, cy1 = list(map(float, os.environ['CLIP'].split(',')))
top_im = Image.open('/tmp/snap-top.png')
bot_im = Image.open('/tmp/snap-bot.png')
page_w, page_h = int(round(rt[2])), int(round(rt[3]))
final = Image.new('RGB', (page_w, page_h), 'white')

def paste_visible(im, rect):
    x, y, w, h = rect
    vp_x0 = max(x, cx0); vp_y0 = max(y, cy0)
    vp_x1 = min(x + w, cx1); vp_y1 = min(y + h, cy1)
    if vp_x1 <= vp_x0 or vp_y1 <= vp_y0:
        return
    crop = im.crop((int(round(vp_x0)), int(round(vp_y0)),
                    int(round(vp_x1)), int(round(vp_y1))))
    final.paste(crop, (0, int(round(vp_y0 - y))))

paste_visible(top_im, rt)
paste_visible(bot_im, rb)
final.save(os.environ['OUT'])
PY

  echo "  page $i -> $OUT_PATH"
done

# Restore chrome
agent-browser eval "
  const h = document.querySelector('.dev-app__header');
  const t = document.querySelector('.dev-app__toolbar-ruler-container');
  if (h) h.style.display = '';
  if (t) t.style.display = '';
" > /dev/null 2>&1

echo "[capture-pages] done: $OUT"
