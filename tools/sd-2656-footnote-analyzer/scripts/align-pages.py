#!/usr/bin/env python3
"""
Page-by-page alignment between Word and SuperDoc.

For each Word page N (1..49), find the SD page that best matches its body
content. Report:
  - Word page → SD page (alignment)
  - Drift (SD page - Word page)
  - Where drift INCREMENTS (drift events) — these are the regression points

Output:
  output/alignment.json — structured data
  output/alignment-report.md — human-readable report
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def normalize(s: str) -> str:
    # Collapse whitespace, lowercase, strip punctuation noise.
    s = re.sub(r"[\[\]_(){}\"“”‘’,:;.!?]", " ", s)
    s = re.sub(r"\s+", " ", s).strip().lower()
    return s


def token_set(s: str, n: int = 8) -> set[str]:
    """Set of first/last n consecutive words for fuzzy match."""
    words = normalize(s).split()
    if not words:
        return set()
    head = " ".join(words[:n])
    tail = " ".join(words[-n:])
    return {head, tail}


def best_match_page(
    word_body_start: str,
    word_body_end: str,
    sd_pages: list[dict],
    search_from: int = 1,
    min_score: float = 0.2,
) -> tuple[int, float]:
    """
    Find the SD page whose bodyStart best matches Word's bodyStart.
    Score = jaccard-like similarity on first ~12 tokens of bodyStart.

    We search FORWARD from `search_from` (1-based SD page) to bias toward
    monotonic alignment — page N+1 should align to an SD page after where
    page N aligned. Allows small back-track (8 pages).
    """
    target_start = set(normalize(word_body_start).split()[:12])
    target_end = set(normalize(word_body_end).split()[-12:])
    if not target_start and not target_end:
        return -1, 0.0

    best_idx, best_score = -1, 0.0
    for sd_p in sd_pages:
        sd_idx = sd_p["pageIndex"] + 1
        if sd_idx < max(1, search_from - 8):
            continue
        c_start = set(normalize(sd_p["bodyStart"]).split()[:12])
        c_end = set(normalize(sd_p["bodyEnd"]).split()[-12:])
        if not c_start and not c_end:
            continue
        s1 = len(target_start & c_start) / max(1, len(target_start | c_start)) if target_start else 0
        s2 = len(target_end & c_end) / max(1, len(target_end | c_end)) if target_end else 0
        # Combined: bodyStart match is heavier weight.
        score = 0.7 * s1 + 0.3 * s2
        # Bias slightly toward smaller drift (closer SD page).
        drift_penalty = abs(sd_idx - search_from) * 0.005
        adjusted = score - drift_penalty
        if adjusted > best_score:
            best_score = adjusted
            best_idx = sd_idx
    if best_score < min_score:
        return -1, best_score
    return best_idx, best_score


def main() -> int:
    word_data = json.loads((ROOT / "output" / "word-pages.json").read_text())
    sd_data = json.loads((ROOT / "output" / "sd-pages.json").read_text())
    word_expected = json.loads((ROOT / "data" / "word-expected.json").read_text())

    word_anchors = {p["page"]: p["anchors"] for p in word_expected["pages"]}

    rows = []
    last_sd = 0
    for w in word_data["pages"]:
        wpg = w["page"]
        search_from = last_sd + 1
        sd_pg, score = best_match_page(w["bodyStart"], w.get("bodyEnd", ""), sd_data["pages"], search_from)
        if sd_pg > 0:
            last_sd = sd_pg
        drift = (sd_pg - wpg) if sd_pg > 0 else None
        sd_entry = next((s for s in sd_data["pages"] if s["pageIndex"] + 1 == sd_pg), None)
        rows.append({
            "wordPage": wpg,
            "sdPage": sd_pg,
            "matchScore": round(score, 2),
            "drift": drift,
            "wordBodyStart": w["bodyStart"][:80],
            "sdBodyStart": (sd_entry or {}).get("bodyStart", "")[:80],
            "wordAnchors": word_anchors.get(wpg, []),
            "sdRefs": (sd_entry or {}).get("bodyRefs", []),
            "sdSlices": (sd_entry or {}).get("footnoteSliceIds", []),
        })

    # Identify drift events: pages where drift changes from the previous
    # Word page (the SD layout "skipped" or "stretched" content).
    prev_drift = 0
    drift_events = []
    for r in rows:
        if r["drift"] is None:
            continue
        if r["drift"] != prev_drift:
            drift_events.append({
                "wordPage": r["wordPage"],
                "sdPage": r["sdPage"],
                "driftBefore": prev_drift,
                "driftAfter": r["drift"],
                "delta": r["drift"] - prev_drift,
                "wordBodyStart": r["wordBodyStart"],
                "sdBodyStart": r["sdBodyStart"],
                "wordAnchors": r["wordAnchors"],
                "sdRefs": r["sdRefs"],
            })
            prev_drift = r["drift"]

    # Write structured output
    out_path = ROOT / "output" / "alignment.json"
    out_path.write_text(json.dumps({
        "summary": {
            "wordTotal": word_data["totalPages"],
            "sdTotal": sd_data["totalPages"],
            "delta": sd_data["totalPages"] - word_data["totalPages"],
            "alignedCount": sum(1 for r in rows if r["drift"] == 0),
            "driftEventCount": len(drift_events),
            "finalDrift": rows[-1]["drift"] if rows else None,
        },
        "rows": rows,
        "driftEvents": drift_events,
    }, indent=2))

    # Markdown report
    md = []
    md.append("# IT-923 page-by-page alignment\n")
    md.append(f"- Word total: **{word_data['totalPages']}**")
    md.append(f"- SuperDoc total: **{sd_data['totalPages']}** ({sd_data['totalPages'] - word_data['totalPages']:+d})")
    md.append(f"- Perfectly aligned: **{sum(1 for r in rows if r['drift'] == 0)} / {len(rows)}**")
    md.append(f"- Drift events: **{len(drift_events)}**")
    md.append(f"- Final drift: **{rows[-1]['drift'] if rows else '?'}**")
    md.append("")
    md.append("## Drift events (where SD diverges from Word)\n")
    md.append("Each event is a Word page where SD's body content first appears on a different SD page than expected.\n")
    md.append("| Word | SD | Δ | Word anchors | SD body refs | Word body start | SD body start |")
    md.append("|---:|---:|:--:|---|---|---|---|")
    for e in drift_events:
        md.append(
            f"| {e['wordPage']} | {e['sdPage']} | {e['delta']:+d} | "
            f"{e['wordAnchors']} | {e['sdRefs']} | "
            f"`{e['wordBodyStart'][:50]}` | `{e['sdBodyStart'][:50]}` |"
        )
    md.append("")
    md.append("## Full alignment table\n")
    md.append("| Word | SD | Drift | Score | Word anchors | SD body refs | SD slices | Body match |")
    md.append("|---:|---:|---:|---:|---|---|---|---|")
    for r in rows:
        sd_str = str(r["sdPage"]) if r["sdPage"] > 0 else "—"
        drift_str = f"{r['drift']:+d}" if r["drift"] is not None else "?"
        word_a = ",".join(str(x) for x in r["wordAnchors"]) or "—"
        sd_r = ",".join(str(x) for x in r["sdRefs"]) or "—"
        sd_s = ",".join(str(x) for x in r["sdSlices"]) or "—"
        match_indicator = "✓" if normalize(r["wordBodyStart"]).split()[:5] == normalize(r["sdBodyStart"]).split()[:5] else "≈"
        md.append(
            f"| {r['wordPage']} | {sd_str} | {drift_str} | {r['matchScore']} | "
            f"{word_a} | {sd_r} | {sd_s} | {match_indicator} |"
        )

    md_path = ROOT / "output" / "alignment-report.md"
    md_path.write_text("\n".join(md))

    # Stdout summary
    print(f"Word: {word_data['totalPages']} pages")
    print(f"SD:   {sd_data['totalPages']} pages")
    print(f"Aligned: {sum(1 for r in rows if r['drift'] == 0)} / {len(rows)}")
    print(f"Drift events: {len(drift_events)}")
    print()
    print("Drift events:")
    for e in drift_events:
        print(f"  Word p{e['wordPage']:>2} → SD p{e['sdPage']:>2}  Δ {e['delta']:+d}  "
              f"(word anchors {e['wordAnchors']}, sd refs {e['sdRefs']})")
    print()
    print(f"Wrote {out_path}")
    print(f"Wrote {md_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
