#!/usr/bin/env python3
"""
Renders a 2-column comparison HTML + PDF:
  Word page N | SuperDoc page N

For each row, annotates the diff status from output/diff-summary.json.

Usage:
  python3 render-comparison.py [--word-dir ~/Documents/sd-2656-it923-current-fixtures]
                               [--sd-dir tools/sd-2656-footnote-analyzer/output/per-page/sd]
                               [--out tools/sd-2656-footnote-analyzer/output/comparison.html]
"""
import argparse
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--word-dir", default=os.path.expanduser("~/Documents/sd-2656-it923-current-fixtures"))
    ap.add_argument("--sd-dir", default=str(ROOT / "output" / "per-page" / "sd"))
    ap.add_argument("--diff", default=str(ROOT / "output" / "diff-summary.json"))
    ap.add_argument("--out", default=str(ROOT / "output" / "comparison.html"))
    args = ap.parse_args()

    word_dir = Path(args.word_dir)
    sd_dir = Path(args.sd_dir)
    out_path = Path(args.out)

    # Load diff if present.
    diff = None
    diff_p = Path(args.diff)
    if diff_p.exists():
        diff = json.loads(diff_p.read_text())
    page_status = {}
    if diff:
        for p in diff["pages"]:
            page_status[p["page"]] = p

    # Find page range: Word has 49 pages, SD may have more or fewer.
    word_pages = sorted(int(f.stem.replace("word-page-", ""))
                        for f in word_dir.glob("word-page-*.png"))
    sd_pages = sorted(int(f.stem.replace("page-", ""))
                      for f in sd_dir.glob("page-*.png"))
    all_pages = sorted(set(word_pages) | set(sd_pages))

    if not all_pages:
        print(f"no pages found in {word_dir} or {sd_dir}", file=__import__("sys").stderr)
        return 2

    def img_relative(p: Path) -> str:
        return os.path.relpath(p, out_path.parent)

    rows_html = []
    for pg in all_pages:
        word_img = word_dir / f"word-page-{pg:02d}.png"
        sd_img = sd_dir / f"page-{pg:02d}.png"
        word_src = img_relative(word_img) if word_img.exists() else None
        sd_src = img_relative(sd_img) if sd_img.exists() else None

        status = page_status.get(pg)
        match_cls = "ok" if (status and status.get("match")) else "drift"
        match_label = ""
        if status:
            ex = status.get("expectedAnchors") or []
            ac = status.get("actualRefs") or []
            cluster_ok = all(c["status"] in ("ok-complete", "ok-split-or-full")
                              for c in (status.get("cluster") or []))
            if status.get("match") and cluster_ok:
                match_label = f"<span class='tag ok'>OK</span>"
            else:
                match_label = (
                    f"<span class='tag drift'>DRIFT</span>"
                    f"<div class='diff'>expected {ex} got {ac}</div>"
                )

        word_cell = (
            f"<img src='{word_src}' alt='word p{pg}' />"
            if word_src else f"<div class='missing'>(no Word page {pg})</div>"
        )
        sd_cell = (
            f"<img src='{sd_src}' alt='sd p{pg}' />"
            if sd_src else f"<div class='missing'>(no SuperDoc page {pg})</div>"
        )

        rows_html.append(f"""
        <section class="page-row {match_cls}">
          <h2>Page {pg} {match_label}</h2>
          <div class="cols">
            <div class="col"><div class="label">Word</div>{word_cell}</div>
            <div class="col"><div class="label">SuperDoc</div>{sd_cell}</div>
          </div>
        </section>
        """)

    sd_total = diff["superdoc"]["totalPages"] if diff else len(sd_pages)
    word_total = diff["word"]["totalPages"] if diff else len(word_pages)
    delta = sd_total - word_total
    drift_at = diff.get("driftStartsAt") if diff else None
    violations = len(diff.get("clusterViolations", [])) if diff else 0

    html = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>IT-923 Word vs SuperDoc</title>
<style>
  body {{ font-family: -apple-system, system-ui, sans-serif; margin: 0; padding: 24px; }}
  .summary {{ position: sticky; top: 0; background: #fff; padding: 12px; border-bottom: 1px solid #ddd; z-index: 10; }}
  .summary h1 {{ margin: 0 0 8px 0; font-size: 18px; }}
  .summary .stats {{ display: flex; gap: 20px; font-size: 13px; color: #444; }}
  .page-row {{ margin: 32px 0; padding: 16px; border: 1px solid #eee; border-radius: 6px; page-break-inside: avoid; }}
  .page-row.drift {{ background: #fff7f6; border-color: #e8b8b3; }}
  .page-row h2 {{ margin: 0 0 12px 0; font-size: 16px; display: flex; align-items: center; gap: 12px; }}
  .cols {{ display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }}
  .col {{ background: #fff; border: 1px solid #eee; border-radius: 4px; overflow: hidden; }}
  .label {{ font-size: 12px; color: #666; padding: 6px 8px; background: #f8f8f8; border-bottom: 1px solid #eee; }}
  .col img {{ display: block; width: 100%; height: auto; }}
  .missing {{ padding: 80px 16px; text-align: center; color: #999; font-style: italic; }}
  .tag {{ display: inline-block; padding: 2px 8px; border-radius: 3px; font-size: 11px; font-weight: 600; }}
  .tag.ok {{ background: #e3f7e6; color: #1f7a2e; }}
  .tag.drift {{ background: #fde2de; color: #a32e1f; }}
  .diff {{ font-size: 12px; color: #666; margin-top: 4px; font-weight: normal; }}
</style>
</head>
<body>
  <div class="summary">
    <h1>IT-923 Footnote Layout — Word vs SuperDoc</h1>
    <div class="stats">
      <span>Word pages: <b>{word_total}</b></span>
      <span>SuperDoc pages: <b>{sd_total}</b> ({delta:+d})</span>
      <span>Drift starts: <b>page {drift_at}</b></span>
      <span>Cluster violations: <b>{violations}</b></span>
    </div>
  </div>
  {''.join(rows_html)}
</body></html>
"""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(html)
    print(f"wrote {out_path}")
    print(f"open it: open {out_path}")
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
