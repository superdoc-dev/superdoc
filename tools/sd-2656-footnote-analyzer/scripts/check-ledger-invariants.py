#!/usr/bin/env python3
"""
SD-2656 Phase 0: ledger invariant checks.

Reads tools/sd-2656-footnote-analyzer/output/superdoc-state.json (which now
includes page.footnoteLedger per page) and verifies the four invariants:

  I1. actualBandHeightPx <= appliedBodyReservePx
      Band actually fits in the reserved space — no overflow.

  I2. mandatorySliceIds == anchorIds  (page's cluster anchors all rendered
      at least once via a non-continuation slice)

  I3. continuationIn[P] matches continuationOut[P-1]  (carry parity)
      Every continuation deferred from page P-1 arrives at page P.

  I4. deadReservePx < THRESHOLD  (default 30 px)
      Body reserved space that the planner did not actually fill —
      this is the drift fuel the next phase will target.

Exit non-zero if any invariant fails. Prints per-page diagnostic table.

Usage:
  python3 check-ledger-invariants.py [--dead-reserve-threshold 30]
"""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dead-reserve-threshold", type=int, default=30)
    ap.add_argument("--strict", action="store_true", help="Fail on dead-reserve violations too")
    args = ap.parse_args()

    sd = json.loads((ROOT / "output" / "superdoc-state.json").read_text())
    pages = sd["pages"]

    # Find pages with a ledger (those with body refs or continuations).
    pages_with_ledger = [p for p in pages if p.get("ledger")]

    if not pages_with_ledger:
        print("ERROR: no pages have a ledger. Was capture run with current code?", file=sys.stderr)
        return 2

    print(f"Total pages: {len(pages)}")
    print(f"Pages with ledger: {len(pages_with_ledger)}")
    print()

    failures = []

    # I1: band fits in reserve. Allow 2-px tolerance for floating-point
    # rounding between planner usedHeight (continuationDividerHeight vs
    # safeDividerHeight may differ by ~1 px) and ledger overhead computation.
    I1_TOLERANCE_PX = 2
    for p in pages_with_ledger:
        L = p["ledger"]
        overflow = L["actualBandHeightPx"] - L["appliedBodyReservePx"]
        if overflow > I1_TOLERANCE_PX:
            failures.append({
                "page": p["pageIndex"] + 1,
                "invariant": "I1",
                "msg": f"actualBandHeightPx={L['actualBandHeightPx']} > appliedBodyReservePx={L['appliedBodyReservePx']} by {overflow:.1f} px (band overflows reserve)",
            })

    # I2: every anchor has a mandatory slice
    for p in pages_with_ledger:
        L = p["ledger"]
        anchors = set(L["anchorIds"])
        mandatory = set(L["mandatorySliceIds"])
        missing = anchors - mandatory
        if missing:
            failures.append({
                "page": p["pageIndex"] + 1,
                "invariant": "I2",
                "msg": f"anchors with no mandatory slice on page: {sorted(missing)}",
            })

    # I3: continuationIn vs prior continuationOut parity
    for i in range(1, len(pages_with_ledger)):
        prev = pages_with_ledger[i - 1]["ledger"]
        cur = pages_with_ledger[i]["ledger"]
        prev_out = {(e["id"], e["remainingRangeCount"], e["remainingHeightPx"]) for e in prev["continuationOut"]}
        cur_in = {(e["id"], e["remainingRangeCount"], e["remainingHeightPx"]) for e in cur["continuationIn"]}
        if prev_out != cur_in:
            failures.append({
                "page": pages_with_ledger[i]["pageIndex"] + 1,
                "invariant": "I3",
                "msg": f"continuationIn[P={cur['pageIndex']+1}] != continuationOut[P-1] (prev_out={prev_out}, cur_in={cur_in})",
            })

    # I4: dead reserve below threshold
    dead_reserve_warnings = []
    for p in pages_with_ledger:
        L = p["ledger"]
        if L["deadReservePx"] > args.dead_reserve_threshold:
            entry = {
                "page": p["pageIndex"] + 1,
                "deadReservePx": L["deadReservePx"],
                "appliedBodyReservePx": L["appliedBodyReservePx"],
                "actualBandHeightPx": L["actualBandHeightPx"],
            }
            if args.strict:
                failures.append({
                    "page": p["pageIndex"] + 1,
                    "invariant": "I4",
                    "msg": f"deadReservePx={L['deadReservePx']} > {args.dead_reserve_threshold}",
                })
            else:
                dead_reserve_warnings.append(entry)

    # I5 (Phase 7): mandatory-only pages — band == mandatoryReserve (within
    # 2 px tolerance) and last anchor rendered only 1 line, but preferred would
    # have rendered more. These are the "first-line-only" cases the diagnosis
    # called out: legally correct but visually thinner than Word.
    MANDATORY_ONLY_TOLERANCE_PX = 2
    mandatory_only_warnings = []
    for p in pages_with_ledger:
        L = p["ledger"]
        if not L["anchorIds"]:
            continue
        if "preferredReservePx" not in L or "lastAnchorRenderedLines" not in L:
            continue
        actual = L["actualBandHeightPx"]
        mandatory = L["mandatoryReservePx"]
        preferred = L["preferredReservePx"]
        last_lines = L["lastAnchorRenderedLines"]
        # Mandatory-only signal: actual within tolerance of mandatory, AND
        # preferred is meaningfully bigger, AND last anchor rendered <= 1 line.
        if (
            abs(actual - mandatory) <= MANDATORY_ONLY_TOLERANCE_PX
            and preferred - mandatory > MANDATORY_ONLY_TOLERANCE_PX
            and last_lines <= 1
        ):
            mandatory_only_warnings.append({
                "page": p["pageIndex"] + 1,
                "anchors": L["anchorIds"],
                "mandatoryPx": mandatory,
                "preferredPx": preferred,
                "actualPx": actual,
                "lastAnchorLines": last_lines,
            })

    # Report
    print(f"{'Page':>5} {'Anchors':<20} {'Mand':>5} {'Cont':>5} {'Ext':>5} {'Reserved':>10} {'Actual':>8} {'Dead':>6} {'MandPx':>7} {'PrefPx':>7} {'LastL':>6}")
    print("-" * 110)
    for p in pages_with_ledger:
        L = p["ledger"]
        anchors = ",".join(L["anchorIds"])[:18]
        mand_px = L.get("mandatoryReservePx", 0)
        pref_px = L.get("preferredReservePx", 0)
        last_l = L.get("lastAnchorRenderedLines", 0)
        print(
            f"{p['pageIndex']+1:>5} {anchors:<20} "
            f"{len(L['mandatorySliceIds']):>5} {len(L['continuationSliceIds']):>5} {len(L['extendedSliceIds']):>5} "
            f"{L['appliedBodyReservePx']:>10} {L['actualBandHeightPx']:>8} {L['deadReservePx']:>6} "
            f"{mand_px:>7} {pref_px:>7} {last_l:>6}"
        )

    print()
    if failures:
        print(f"FAILURES: {len(failures)} invariant violations")
        for f in failures[:20]:
            print(f"  page {f['page']:>3} {f['invariant']}: {f['msg']}")
        if len(failures) > 20:
            print(f"  ... and {len(failures) - 20} more")

    if dead_reserve_warnings:
        print()
        print(f"DEAD-RESERVE WARNINGS (> {args.dead_reserve_threshold}px): {len(dead_reserve_warnings)} pages")
        for w in dead_reserve_warnings[:15]:
            print(
                f"  page {w['page']:>3}: deadReserve={w['deadReservePx']:>5}px "
                f"(reserved {w['appliedBodyReservePx']}, used {w['actualBandHeightPx']})"
            )
        if len(dead_reserve_warnings) > 15:
            print(f"  ... and {len(dead_reserve_warnings) - 15} more")

    if mandatory_only_warnings:
        print()
        print(f"MANDATORY-ONLY WARNINGS: {len(mandatory_only_warnings)} pages render only firstLine where preferred has room")
        for w in mandatory_only_warnings[:15]:
            print(
                f"  page {w['page']:>3}: anchors={w['anchors']} "
                f"mandatory={w['mandatoryPx']}px preferred={w['preferredPx']}px actual={w['actualPx']}px "
                f"(last anchor: {w['lastAnchorLines']} line)"
            )
        if len(mandatory_only_warnings) > 15:
            print(f"  ... and {len(mandatory_only_warnings) - 15} more")

    if failures:
        return 1
    if not dead_reserve_warnings and not mandatory_only_warnings:
        print("ALL INVARIANTS HOLD. NO WARNINGS.")
    else:
        msgs = []
        if dead_reserve_warnings:
            msgs.append(f"{len(dead_reserve_warnings)} dead-reserve")
        if mandatory_only_warnings:
            msgs.append(f"{len(mandatory_only_warnings)} mandatory-only")
        print(f"All hard invariants hold ({' / '.join(msgs)} warnings — see above).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
