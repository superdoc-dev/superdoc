#!/usr/bin/env python3
"""
Static "ordered-cluster" simulator: takes the captured SuperDoc state and asks
"if SuperDoc had applied Word's ordered-cluster demand model, would each
Word-expected page have fit?"

The model:

  current SD demand at anchor K = sum(fullHeight(1..K)) + overhead
  Word ordered demand at K       = sum(fullHeight(1..K-1)) + firstLineHeight(K) + overhead

The script reconstructs each footnote's measured full height by summing the
heights of its slices (rendered across one or more SD pages). For first-line
height, we estimate by treating the first slice's first line as ~lineHeight
(default 12px for footnote text; configurable).

It does NOT re-paginate. It only shows the demand delta for each Word page:
how much smaller the cluster demand would have been with the ordered-cluster
rule, and whether that delta likely explains the observed cluster split.

Usage:
  python3 simulate-ordered-cluster.py [--line-height 12]
"""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--line-height", type=float, default=12.0,
                    help="estimated footnote line height (px) used for firstLine(last)")
    ap.add_argument("--separator-overhead", type=float, default=24.0,
                    help="overhead per page (separator + topPadding + dividerHeight)")
    ap.add_argument("--gap", type=float, default=2.0,
                    help="vertical gap between footnotes on a page")
    args = ap.parse_args()

    sd = json.loads((ROOT / "output" / "superdoc-state.json").read_text())
    word = json.loads((ROOT / "data" / "word-expected.json").read_text())

    # For each footnote (Word number), sum the total rendered slice height
    # across all SD pages where it appears. This approximates full(footnote).
    fn_total_height = {}
    fn_first_slice_height = {}
    for p in sd["pages"]:
        for s in p["footnoteSlices"]:
            num = s.get("wordNum")
            if num is None:
                continue
            h = s.get("totalHeight", None)
            if h is None:
                # totalHeight wasn't captured — approximate from line count.
                h = max(0, (s.get("toLine", 0) - s.get("fromLine", 0))) * args.line_height
            fn_total_height[num] = fn_total_height.get(num, 0) + h
            # First slice height = first time this footnote appears.
            if num not in fn_first_slice_height:
                fn_first_slice_height[num] = h

    # Compute per-page demand under both models.
    word_anchors = {p["page"]: p["anchors"] for p in word["pages"]}

    rows = []
    for word_pg in sorted(word_anchors.keys()):
        anchors = word_anchors[word_pg]
        if not anchors:
            continue
        # SD current demand (all full):
        sd_current_demand = (
            sum(fn_total_height.get(a, 0) for a in anchors)
            + args.separator_overhead
            + args.gap * max(0, len(anchors) - 1)
        )
        # Word ordered demand (all full except last is firstLine):
        if anchors:
            non_last = anchors[:-1]
            word_demand = (
                sum(fn_total_height.get(a, 0) for a in non_last)
                + args.line_height  # firstLine(last)
                + args.separator_overhead
                + args.gap * max(0, len(anchors) - 1)
            )
        else:
            word_demand = args.separator_overhead

        delta = sd_current_demand - word_demand
        rows.append({
            "wordPage": word_pg,
            "anchors": anchors,
            "fnHeights": [fn_total_height.get(a, 0) for a in anchors],
            "sdCurrentDemand": round(sd_current_demand, 1),
            "wordOrderedDemand": round(word_demand, 1),
            "saving": round(delta, 1),
            "savingPctOfCurrent": round(100 * delta / sd_current_demand, 1) if sd_current_demand else 0,
        })

    # Output
    out_path = ROOT / "output" / "ordered-cluster-simulation.json"
    out_path.write_text(json.dumps({"params": vars(args), "rows": rows}, indent=2))

    print(f"Ordered-cluster simulation (line-height={args.line_height}, sep-overhead={args.separator_overhead})\n")
    print(f"{'WordPg':>7} {'Anchors':<30} {'SD demand':>10} {'Word demand':>12} {'Saving':>8} {'%':>6}")
    print("-" * 80)
    total_saving = 0
    pages_with_saving = 0
    for r in rows:
        anchors_str = str(r["anchors"])
        if len(anchors_str) > 28:
            anchors_str = anchors_str[:25] + "..."
        print(f"{r['wordPage']:>7} {anchors_str:<30} {r['sdCurrentDemand']:>10.1f} {r['wordOrderedDemand']:>12.1f} {r['saving']:>8.1f} {r['savingPctOfCurrent']:>5.1f}%")
        total_saving += r["saving"]
        if r["saving"] > 0:
            pages_with_saving += 1

    print("-" * 80)
    print(f"Pages with positive saving:    {pages_with_saving}")
    print(f"Total demand saving (px):      {total_saving:.0f}")
    print(f"Avg saving per anchored page:  {total_saving/max(1,len(rows)):.0f}px")
    print(f"\nWrote {out_path}")
    print(f"\nInterpretation: 'saving' is the amount of body-reserve px the body slicer")
    print(f"would have freed up per page under the ordered-cluster rule. Larger savings")
    print(f"on a page mean SD was over-reserving by that much.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
