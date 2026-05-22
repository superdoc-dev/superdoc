#!/usr/bin/env python3
"""
Renders a focused drift-aware comparison HTML showing the KEY drift events.

For each drift event:
  - Word page N (the page where drift increments) and Word page N+1 (context)
  - SD page that contains the first anchor (Word p N's first anchor)
  - SD page that contains the LAST anchor (where the spill landed)

This makes it obvious where in the document SD diverged from Word.

Usage:
  python3 render-drift-comparison.py
"""
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORD_DIR = Path(os.path.expanduser("~/Documents/sd-2656-it923-current-fixtures"))
SD_DIR = ROOT / "output" / "per-page" / "sd"
OUT = ROOT / "output" / "drift-comparison.html"


def main() -> int:
    drift = json.loads((ROOT / "output" / "anchor-drift.json").read_text())
    rows = drift["rows"]
    events = drift["driftEvents"]
    summary = drift["summary"]

    def img_rel(p: Path) -> str:
        return os.path.relpath(p, OUT.parent)

    # Section A: Drift trajectory chart
    chart_rows = []
    for r in rows:
        if not r["wordAnchors"]:
            continue
        chart_rows.append(r)

    drift_chart = []
    for r in chart_rows:
        drift_val = r["drift"]
        bar = "█" * (drift_val + 1) if drift_val is not None else "?"
        drift_chart.append(
            f"<tr><td>{r['wordPage']}</td><td style='font-family:monospace'>{bar}</td>"
            f"<td>{drift_val:+d}</td><td>{r['wordAnchors']}</td><td>{r['sdPages']}</td></tr>"
        )

    # Section B: For each drift event, build a row of Word vs SD images
    event_sections = []
    for e in events:
        wpg = e["wordPage"]
        sd_first = e["sdPages"][0] if e["sdPages"] else None
        sd_last = e["sdPages"][-1] if e["sdPages"] else None
        # Pictures: Word page wpg + neighbor; SD first + last
        word_img = WORD_DIR / f"word-page-{wpg:02d}.png"
        word_next_img = WORD_DIR / f"word-page-{wpg+1:02d}.png"
        sd_first_img = SD_DIR / f"page-{sd_first:02d}.png" if sd_first else None
        sd_last_img = SD_DIR / f"page-{sd_last:02d}.png" if sd_last and sd_last != sd_first else None

        cells = []
        cells.append(
            f"<div class='cell'><div class='label'>Word page {wpg}</div>"
            f"{'<img src=\"' + img_rel(word_img) + '\"/>' if word_img.exists() else '(missing)'}</div>"
        )
        if word_next_img.exists() and wpg + 1 <= 49:
            cells.append(
                f"<div class='cell'><div class='label'>Word page {wpg+1}</div>"
                f"<img src='{img_rel(word_next_img)}'/></div>"
            )
        if sd_first_img and sd_first_img.exists():
            cells.append(
                f"<div class='cell'><div class='label'>SD page {sd_first} (first anchor)</div>"
                f"<img src='{img_rel(sd_first_img)}'/></div>"
            )
        if sd_last_img and sd_last_img.exists():
            cells.append(
                f"<div class='cell'><div class='label'>SD page {sd_last} (last anchor spilled)</div>"
                f"<img src='{img_rel(sd_last_img)}'/></div>"
            )

        event_sections.append(f"""
        <section class='event'>
          <h3>Drift event: Word page {wpg} (Δ {e['delta']:+d}, drift now {e['newDrift']:+d})</h3>
          <div class='meta'>
            <span><b>Anchors</b>: {e['anchors']}</span>
            <span><b>SD landings</b>: {e['sdPages']}</span>
            <span><b>Cause</b>: {e['cause']}</span>
          </div>
          <div class='row'>{''.join(cells)}</div>
        </section>
        """)

    html = f"""<!doctype html>
<html><head><meta charset='utf-8'><title>IT-923 Drift Analysis</title>
<style>
  body {{ font-family: -apple-system, system-ui, sans-serif; margin: 0; padding: 24px; }}
  h1 {{ font-size: 22px; margin-bottom: 8px; }}
  .summary {{ background: #f8f8f8; padding: 16px; border-radius: 6px; margin-bottom: 20px; }}
  .summary table {{ border-collapse: collapse; margin-top: 10px; font-size: 13px; }}
  .summary td {{ padding: 2px 8px; }}
  .row {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; margin-top: 12px; }}
  .cell {{ background: #fff; border: 1px solid #eee; border-radius: 6px; overflow: hidden; }}
  .label {{ font-size: 12px; padding: 6px 10px; background: #f0f0f0; }}
  .cell img {{ display: block; width: 100%; height: auto; }}
  .event {{ margin: 32px 0; padding: 16px; border: 1px solid #ddd; border-radius: 6px; background: #fffefa; }}
  .event h3 {{ margin: 0 0 8px 0; font-size: 16px; color: #a32e1f; }}
  .meta {{ font-size: 13px; color: #555; }}
  .meta span {{ margin-right: 16px; }}
</style>
</head><body>
<h1>IT-923 Drift Analysis — Word vs SuperDoc</h1>
<div class='summary'>
  <div>Word pages: <b>{summary['wordTotal']}</b>, SD pages: <b>{summary['sdTotal']}</b> ({summary['delta']:+d})</div>
  <div>Aligned (anchor-perfect): <b>{summary['perfectlyAligned']} / {summary['totalWithAnchors']}</b></div>
  <div>Drift events: <b>{summary['driftEvents']}</b></div>
  <div>Cluster-spill pages: <b>{summary['spillEvents']}</b></div>
  <details><summary>Drift trajectory chart (click to expand)</summary>
    <table>
      <tr><th>Word pg</th><th>Drift bar</th><th>Drift</th><th>Anchors</th><th>SD landings</th></tr>
      {''.join(drift_chart)}
    </table>
  </details>
</div>

<h2>Drift Events (chronological)</h2>
<p>Each event below shows where SD's layout first diverged by +1 page from Word's. The "cause" is the heuristic: a <i>cluster-spill</i> means SD couldn't keep all of Word's cluster anchors on the same page; a <i>page-break-shift</i> means SD broke the body earlier than Word (compounded drift from earlier spills).</p>
{''.join(event_sections)}
</body></html>
"""
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(html)
    print(f"Wrote {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
