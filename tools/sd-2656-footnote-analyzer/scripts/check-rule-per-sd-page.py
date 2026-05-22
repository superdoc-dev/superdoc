#!/usr/bin/env python3
"""
Per-SD-page rule check. For each SuperDoc page with N>0 body refs, asserts:
- Footnotes r1..r_{N-1} render completely on that page (continuesOnNext=false
  for their last slice on this page).
- Footnote rN has at least one slice on this page.

This is the actual ordered-cluster correctness signal — independent of where
Word would have put each cluster.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    sd = json.loads((ROOT / "output" / "superdoc-state.json").read_text())

    # Build "all slices for footnote N" indexed by page, so we can check
    # whether non-last footnotes truly completed on their anchor page (no
    # slices on later pages).
    slices_by_fn_by_page = {}
    for p in sd["pages"]:
        for s in p["footnoteSlices"]:
            num = s.get("wordNum")
            if num is None:
                continue
            slices_by_fn_by_page.setdefault(num, {}).setdefault(p["pageIndex"], []).append(s)

    total_pages_with_refs = 0
    pages_satisfying_rule = 0
    violations = []

    for p in sd["pages"]:
        body_refs = p["bodyRefs"]
        if not body_refs:
            continue
        total_pages_with_refs += 1
        slices = p["footnoteSlices"]

        # Group slices by Word number on this page.
        slices_by_num = {}
        for s in slices:
            num = s.get("wordNum")
            if num is None:
                continue
            slices_by_num.setdefault(num, []).append(s)

        # The cluster: bodyRefs in document order (already sorted by extractor).
        cluster = [r["wordNum"] for r in body_refs if r.get("wordNum") is not None]
        if not cluster:
            continue

        last = cluster[-1]
        non_last = cluster[:-1]
        page_idx = p["pageIndex"]

        page_violations = []
        # Check non-last completeness — stricter:
        # 1. fn appears on the anchor page (has slices)
        # 2. last slice on anchor page is not mid-paragraph continuation
        # 3. fn has NO slices on any later page (i.e., fully rendered on anchor page)
        for fn in non_last:
            slices_for_fn = slices_by_num.get(fn, [])
            if not slices_for_fn:
                page_violations.append(f"fn {fn} (non-last) has NO slice on page {page_idx+1}")
                continue
            last_slice = slices_for_fn[-1]
            if last_slice.get("continuesOnNext"):
                page_violations.append(f"fn {fn} (non-last) on page {page_idx+1} has mid-paragraph continuesOnNext")
            # Check no slices on later pages.
            all_pages_for_fn = slices_by_fn_by_page.get(fn, {})
            later_pages = [pi for pi in all_pages_for_fn if pi > page_idx]
            if later_pages:
                page_violations.append(
                    f"fn {fn} (non-last) on page {page_idx+1} has trailing slices on pages "
                    f"{[pi+1 for pi in sorted(later_pages)]}"
                )

        # Check last anchor has at least firstSlice on page.
        last_slices = slices_by_num.get(last, [])
        if not last_slices:
            page_violations.append(f"fn {last} (last) has NO slice on page {page_idx+1}")

        if page_violations:
            violations.append({
                "page": p["pageIndex"] + 1,
                "cluster": cluster,
                "issues": page_violations,
            })
        else:
            pages_satisfying_rule += 1

    print(f"Pages with body refs:        {total_pages_with_refs}")
    print(f"Pages satisfying the rule:   {pages_satisfying_rule}")
    print(f"Pages violating the rule:    {len(violations)}")
    print()
    if violations:
        print("Violations:")
        for v in violations[:15]:
            print(f"  page {v['page']:>3} cluster {v['cluster']}:")
            for issue in v["issues"]:
                print(f"    - {issue}")
        if len(violations) > 15:
            print(f"  ... and {len(violations) - 15} more")
    else:
        print("ALL CLUSTERS SATISFY THE RULE.")
    return 0 if not violations else 1


if __name__ == "__main__":
    sys.exit(main())
