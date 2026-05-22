#!/usr/bin/env python3
"""
Explains per-anchor drift between Word and SuperDoc by combining the captured
state JSON with the Word inventory. For each footnote, it reports:

  - Word page         (where Word puts the anchor)
  - SD anchor page    (where SD puts the body ref)
  - Shift             (sd - word)
  - "Reserve at Word page" (current SD's footnoteReserved on that page)
  - "Reserve at SD anchor page" (where SD ended up putting it)
  - Total slices on SD anchor page

Then groups footnotes by shift to surface the systematic pattern.

Usage:
  python3 explain-drift.py
"""
import json
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    sd = json.loads((ROOT / "output" / "superdoc-state.json").read_text())
    word = json.loads((ROOT / "data" / "word-expected.json").read_text())

    sd_pages = {(p["pageIndex"] + 1): p for p in sd["pages"]}
    word_anchor_page = {}
    for p in word["pages"]:
        for a in p["anchors"]:
            word_anchor_page[a] = p["page"]

    # For each footnote, get the SD anchor page (where the body ref lands).
    sd_anchor_page = {}
    for p in sd["pages"]:
        for ref in p["bodyRefs"]:
            num = ref.get("wordNum")
            if num is not None and num not in sd_anchor_page:
                sd_anchor_page[num] = p["pageIndex"] + 1

    rows = []
    for num in sorted(word_anchor_page.keys()):
        word_pg = word_anchor_page[num]
        sd_pg = sd_anchor_page.get(num, None)
        sd_page_state = sd_pages.get(sd_pg) if sd_pg else None
        word_page_state = sd_pages.get(word_pg)
        rows.append({
            "fn": num,
            "wordPage": word_pg,
            "sdPage": sd_pg,
            "shift": (sd_pg - word_pg) if (sd_pg and word_pg) else None,
            "reserveAtWordPage": (word_page_state or {}).get("footnoteReserved", None),
            "reserveAtSdPage": (sd_page_state or {}).get("footnoteReserved", None),
            "sliceCountAtSdPage": len((sd_page_state or {}).get("footnoteSlices", [])),
        })

    # Group by Word page to see cluster behavior.
    by_word_page = defaultdict(list)
    for r in rows:
        by_word_page[r["wordPage"]].append(r)

    out_lines = []
    out_lines.append("# IT-923 per-anchor drift explanation\n")

    # Summary by shift.
    by_shift = defaultdict(list)
    for r in rows:
        by_shift[r["shift"]].append(r["fn"])
    out_lines.append("## Shift distribution\n")
    for shift in sorted(by_shift.keys(), key=lambda x: (x is None, x or 0)):
        nums = by_shift[shift]
        out_lines.append(f"- shift **{shift}**: {len(nums)} footnotes — {nums}")
    out_lines.append("")

    out_lines.append("## Per-Word-page cluster analysis\n")
    out_lines.append("Each row groups footnotes by where Word puts them. Look for clusters that\n"
                     "Word fits on one page but SD splits across two — that's the over-reservation bug.\n")
    out_lines.append("| Word pg | Anchors | SD result | Reserve@word | Shift | Diagnosis |")
    out_lines.append("|---:|---|---|---:|---|---|")

    diagnoses = []
    for word_pg in sorted(by_word_page.keys()):
        group = by_word_page[word_pg]
        anchors = [r["fn"] for r in group]
        sd_pgs = [r["sdPage"] for r in group]
        shifts = [r["shift"] for r in group]
        reserves = [r["reserveAtWordPage"] for r in group]
        reserve = reserves[0] if reserves else None

        if all(s == 0 for s in shifts):
            diag = "✓ perfect match"
        elif all(s == shifts[0] for s in shifts) and shifts[0] is not None and shifts[0] > 0:
            diag = f"all shifted +{shifts[0]} together — cluster moved as a unit"
        elif len(set(shifts)) > 1:
            mins = min(s for s in shifts if s is not None)
            maxs = max(s for s in shifts if s is not None)
            diag = f"CLUSTER SPLIT: first {sum(1 for s in shifts if s == mins)} stay shift +{mins}, last {sum(1 for s in shifts if s == maxs)} shift +{maxs}"
            diagnoses.append({"wordPg": word_pg, "anchors": anchors, "shifts": shifts, "diag": diag})
        else:
            diag = f"shifts: {shifts}"

        sd_str = ",".join(str(p) for p in sd_pgs)
        shift_str = ",".join(str(s) for s in shifts)
        out_lines.append(
            f"| {word_pg} | {anchors} | pages {sd_str} | {reserve} | {shift_str} | {diag} |"
        )

    out_lines.append("")
    out_lines.append("## Split clusters (the bug pattern)\n")
    out_lines.append("These are pages where Word fits all anchors but SD breaks the cluster:\n")
    for d in diagnoses:
        out_lines.append(f"- Word page **{d['wordPg']}**: anchors {d['anchors']}, shifts {d['shifts']} — {d['diag']}")

    out_text = "\n".join(out_lines)
    (ROOT / "output" / "drift-explanation.md").write_text(out_text)
    print(out_text)
    print(f"\nWrote {ROOT / 'output' / 'drift-explanation.md'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
