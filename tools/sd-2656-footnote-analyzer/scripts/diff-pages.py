#!/usr/bin/env python3
"""
Compare Word's expected per-page anchor inventory vs SuperDoc's captured state.

Usage:
  python3 diff-pages.py [--word data/word-expected.json] [--sd output/superdoc-state.json]

Output:
  Prints a per-page table + summary to stdout, and writes:
    output/diff-summary.json   — structured diff
    output/diff-table.md       — human-readable markdown table

Analysis applies the Word ordered-cluster rule:
  For anchors [a, b, c] on a page, a and b must complete on that page and
  only c may split. The "completion" check requires the slice's continuesOnNext
  to be false AND its toLine to equal totalLines (full coverage).
"""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(p: Path) -> dict:
    return json.loads(p.read_text())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--word", default=str(ROOT / "data" / "word-expected.json"))
    ap.add_argument("--sd", default=str(ROOT / "output" / "superdoc-state.json"))
    ap.add_argument("--out", default=str(ROOT / "output"))
    args = ap.parse_args()

    word_p = Path(args.word)
    sd_p = Path(args.sd)
    if not word_p.exists():
        print(f"missing word inventory: {word_p}", file=sys.stderr)
        return 2
    if not sd_p.exists():
        print(f"missing superdoc state: {sd_p}", file=sys.stderr)
        return 2

    word = load(word_p)
    sd = load(sd_p)

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    # Build alignment: Word's expected pages are 1-indexed.
    word_pages = {p["page"]: p["anchors"] for p in word["pages"]}
    sd_pages = {(p["pageIndex"] + 1): p for p in sd["pages"]}

    # Build "Word page for each footnote" — inverse map.
    word_anchor_page = {}
    for p in word["pages"]:
        for a in p["anchors"]:
            word_anchor_page[a] = p["page"]

    # Build "SuperDoc anchor page" for each footnote (the page where its body
    # ref lands). bodyRefs are [{sdId, wordNum}].
    sd_anchor_page = {}
    for p in sd["pages"]:
        for ref in p["bodyRefs"]:
            num = ref.get("wordNum")
            if num is not None and num not in sd_anchor_page:
                sd_anchor_page[num] = p["pageIndex"] + 1

    # Compute per-footnote shift (sd_page - word_page).
    per_footnote_shift = {}
    for num, sd_pg in sd_anchor_page.items():
        word_pg = word_anchor_page.get(num)
        if word_pg is not None:
            per_footnote_shift[num] = sd_pg - word_pg

    rows = []
    drift_started_at = None
    cluster_violations = []

    for page_num in sorted(set(list(word_pages.keys()) + list(sd_pages.keys()))):
        expected = word_pages.get(page_num, [])
        actual_page = sd_pages.get(page_num)
        actual_refs = []
        actual_slices = []
        if actual_page:
            # bodyRefs are objects { sdId, wordNum } — compare on wordNum.
            actual_refs = [r["wordNum"] for r in actual_page["bodyRefs"] if r.get("wordNum") is not None]
            actual_slices = actual_page["footnoteSlices"]

        # Build "what SuperDoc rendered on this page" by Word number (slices
        # carry { id (OOXML), wordNum, ... }).
        slices_by_num = {}
        for s in actual_slices:
            num = s.get("wordNum")
            if num is None:
                continue
            slices_by_num.setdefault(num, []).append(s)

        # For each expected anchor, did SuperDoc render at least one slice on this page?
        # And is the completion correct?
        cluster_status = []
        if expected:
            for idx, a in enumerate(expected):
                is_last = idx == len(expected) - 1
                slices = slices_by_num.get(a, [])
                if not slices:
                    cluster_status.append({"anchor": a, "status": "missing", "isLast": is_last})
                    cluster_violations.append({
                        "page": page_num, "anchor": a,
                        "kind": "anchor-missing-on-anchor-page",
                        "expected": "at least firstLine" if is_last else "full render",
                    })
                else:
                    # Any slice that "continuesOnNext" means it didn't complete on this page.
                    any_completes = any(not s["continuesOnNext"] for s in slices)
                    if is_last:
                        status = "ok-split-or-full" if slices else "missing"
                    else:
                        status = "ok-complete" if any_completes else "split-not-complete"
                        if not any_completes:
                            cluster_violations.append({
                                "page": page_num, "anchor": a,
                                "kind": "non-last-anchor-not-complete-on-page",
                                "expected": "full render",
                            })
                    cluster_status.append({"anchor": a, "status": status, "isLast": is_last})

        # Track first divergence between expected anchor set and SD ref set
        # (treat ordering as significant).
        if expected != actual_refs and drift_started_at is None:
            drift_started_at = page_num

        rows.append({
            "page": page_num,
            "expectedAnchors": expected,
            "actualRefs": actual_refs,
            "footnoteSliceNums": sorted({s["wordNum"] for s in actual_slices if s.get("wordNum") is not None}),
            "footnoteReserved": (actual_page or {}).get("footnoteReserved", None),
            "match": expected == actual_refs,
            "cluster": cluster_status,
        })

    # Summary
    summary = {
        "word": {"totalPages": word["totalPages"]},
        "superdoc": {"totalPages": sd["totalPages"]},
        "delta": sd["totalPages"] - word["totalPages"],
        "driftStartsAt": drift_started_at,
        "matchingPages": sum(1 for r in rows if r["match"]),
        "totalPagesCompared": len(rows),
        "clusterViolations": cluster_violations,
        "perFootnoteShift": per_footnote_shift,
        "pages": rows,
    }
    (out_dir / "diff-summary.json").write_text(json.dumps(summary, indent=2))

    # Markdown table
    md = []
    md.append("# IT-923 footnote layout — Word vs SuperDoc diff\n")
    md.append(f"- Word total pages: **{word['totalPages']}**")
    md.append(f"- SuperDoc total pages: **{sd['totalPages']}** (delta {summary['delta']:+d})")
    md.append(f"- Drift starts at page: **{drift_started_at}**" if drift_started_at else "- No drift detected")
    md.append(f"- Cluster violations: **{len(cluster_violations)}**")
    md.append("")
    md.append("| Pg | Word anchors | SD body refs | SD note slices | Reserve | Match | Cluster status |")
    md.append("|---:|---|---|---|---:|:--:|---|")
    for r in rows:
        def fmt_list(xs):
            if not xs:
                return "—"
            return ", ".join(str(x) for x in xs)

        cluster_repr = "—"
        if r["cluster"]:
            parts = []
            for c in r["cluster"]:
                tag = c["status"]
                marker = "L" if c["isLast"] else " "
                parts.append(f"{c['anchor']}{marker}={tag}")
            cluster_repr = " ".join(parts)
        match_str = "✓" if r["match"] else "✗"
        md.append(
            f"| {r['page']} | {fmt_list(r['expectedAnchors'])} | {fmt_list(r['actualRefs'])} | "
            f"{fmt_list(r['footnoteSliceNums'])} | {r['footnoteReserved'] if r['footnoteReserved'] is not None else '—'} | "
            f"{match_str} | {cluster_repr} |"
        )

    (out_dir / "diff-table.md").write_text("\n".join(md))

    # Stdout summary
    print(f"Word pages:     {word['totalPages']}")
    print(f"SuperDoc pages: {sd['totalPages']}  (delta {summary['delta']:+d})")
    print(f"Drift starts:   {'page ' + str(drift_started_at) if drift_started_at else 'no drift'}")
    print(f"Matching pages: {summary['matchingPages']} / {summary['totalPagesCompared']}")
    print(f"Cluster violations: {len(cluster_violations)}")
    print()
    print("Per-footnote anchor drift (Word page → SD page):")
    by_shift = {}
    for num, shift in sorted(per_footnote_shift.items()):
        by_shift.setdefault(shift, []).append(num)
    for shift in sorted(by_shift.keys()):
        nums = by_shift[shift]
        print(f"  shift {shift:+d}: {len(nums)} footnotes (e.g. {nums[:8]}{'...' if len(nums)>8 else ''})")
    print()
    print("First 10 cluster violations:")
    for v in cluster_violations[:10]:
        print(f"  page {v['page']:>3} fn {v['anchor']}: {v['kind']}")
    print()
    print(f"Wrote {out_dir / 'diff-summary.json'}")
    print(f"Wrote {out_dir / 'diff-table.md'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
