#!/usr/bin/env python3
"""
Anchor-based drift analysis. Uses footnote anchors as reliable page
landmarks. For each Word page with anchors, finds where SD places each
anchor and reports drift events (where the drift increments).

Output:
  output/anchor-drift.json
  output/anchor-drift-report.md
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    sd = json.loads((ROOT / "output" / "sd-pages.json").read_text())
    word = json.loads((ROOT / "data" / "word-expected.json").read_text())

    # SD: anchor → SD page
    sd_fn_page = {}
    for p in sd["pages"]:
        for num in p["bodyRefs"]:
            if num not in sd_fn_page:
                sd_fn_page[num] = p["pageIndex"] + 1

    # Per-page: which SD page does each Word page's first anchor land on?
    rows = []
    prev_drift = 0
    drift_events = []
    for p in word["pages"]:
        anchors = p["anchors"]
        if not anchors:
            rows.append({
                "wordPage": p["page"],
                "wordAnchors": [],
                "sdPages": [],
                "drift": None,
                "spillCount": 0,
            })
            continue
        sd_pages = [sd_fn_page.get(a) for a in anchors]
        first_sd = sd_pages[0] if sd_pages and sd_pages[0] is not None else None
        drift = (first_sd - p["page"]) if first_sd is not None else None
        # Count "spills" — anchors that landed on a page after the first.
        spill_count = sum(1 for x in sd_pages if x is not None and x != first_sd)
        rows.append({
            "wordPage": p["page"],
            "wordAnchors": anchors,
            "sdPages": sd_pages,
            "drift": drift,
            "spillCount": spill_count,
        })
        if drift is not None and drift != prev_drift:
            drift_events.append({
                "wordPage": p["page"],
                "delta": drift - prev_drift,
                "newDrift": drift,
                "anchors": anchors,
                "sdPages": sd_pages,
                "cause": "cluster-spill" if spill_count > 0 else "page-break-shift",
            })
            prev_drift = drift

    # Identify spill-rich pages (clusters that didn't stay intact in SD)
    spill_pages = [r for r in rows if r["spillCount"] > 0]

    summary = {
        "wordTotal": word["totalPages"],
        "sdTotal": sd["totalPages"],
        "delta": sd["totalPages"] - word["totalPages"],
        "perfectlyAligned": sum(1 for r in rows if r["drift"] == 0),
        "totalWithAnchors": sum(1 for r in rows if r["wordAnchors"]),
        "driftEvents": len(drift_events),
        "spillEvents": len(spill_pages),
    }

    # Markdown report
    md = []
    md.append("# IT-923 Anchor-Based Drift Analysis\n")
    md.append(f"- Word pages: **{word['totalPages']}**, SD pages: **{sd['totalPages']}** ({sd['totalPages'] - word['totalPages']:+d})")
    md.append(f"- Word pages with anchors aligned exactly: **{summary['perfectlyAligned']} / {summary['totalWithAnchors']}**")
    md.append(f"- Drift events (drift incremented): **{len(drift_events)}**")
    md.append(f"- Cluster-spill pages: **{len(spill_pages)}**")
    md.append("")

    md.append("## Drift trajectory\n")
    md.append("How the total drift accumulates across the document. Each line shows where the drift CHANGES from the previous Word page that had anchors.\n")
    md.append("| Word pg | Δ | New drift | Cause | Anchors | SD lands on |")
    md.append("|---:|---:|---:|---|---|---|")
    for e in drift_events:
        md.append(
            f"| {e['wordPage']} | {e['delta']:+d} | {e['newDrift']:+d} | "
            f"{e['cause']} | {e['anchors']} | {e['sdPages']} |"
        )
    md.append("")

    md.append("## Cluster spills (where SD couldn't keep Word's cluster intact)\n")
    md.append("Each entry is a Word page whose multi-anchor cluster got split across multiple SD pages — the LAST anchor(s) spilled to a later page. Each spill compounds the total drift.\n")
    md.append("| Word pg | Word anchors | SD landings | Spills |")
    md.append("|---:|---|---|---:|")
    for r in spill_pages:
        md.append(
            f"| {r['wordPage']} | {r['wordAnchors']} | {r['sdPages']} | {r['spillCount']} |"
        )
    md.append("")

    md.append("## Full alignment table (every Word page with anchors)\n")
    md.append("| Word | Anchors | SD lands on | First on | Drift |")
    md.append("|---:|---|---|---:|---:|")
    for r in rows:
        if not r["wordAnchors"]:
            continue
        first = r["sdPages"][0] if r["sdPages"] else None
        drift_str = f"{r['drift']:+d}" if r["drift"] is not None else "?"
        md.append(
            f"| {r['wordPage']} | {r['wordAnchors']} | {r['sdPages']} | {first} | {drift_str} |"
        )

    out_md = ROOT / "output" / "anchor-drift-report.md"
    out_md.write_text("\n".join(md))

    out_json = ROOT / "output" / "anchor-drift.json"
    out_json.write_text(json.dumps({"summary": summary, "rows": rows, "driftEvents": drift_events}, indent=2))

    # Stdout summary
    print(f"Word: {word['totalPages']}  SD: {sd['totalPages']}  Delta: {sd['totalPages']-word['totalPages']:+d}")
    print(f"Aligned: {summary['perfectlyAligned']} / {summary['totalWithAnchors']}  (pages with anchors)")
    print(f"Drift events: {len(drift_events)}")
    print(f"Cluster spills: {len(spill_pages)}")
    print()
    print("=== DRIFT TRAJECTORY ===")
    print(f"{'Word':>4} {'Δ':>4} {'Drift':>6} {'Cause':<20} {'Anchors':<25} {'Lands on':<25}")
    print("-" * 90)
    for e in drift_events:
        anchors = str(e["anchors"])[:22]
        sd_pages = str(e["sdPages"])[:22]
        print(f"{e['wordPage']:>4} {e['delta']:>+4} {e['newDrift']:>+6} {e['cause']:<20} {anchors:<25} {sd_pages:<25}")
    print()
    print(f"Wrote {out_md}")
    print(f"Wrote {out_json}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
