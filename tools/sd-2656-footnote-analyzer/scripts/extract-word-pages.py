#!/usr/bin/env python3
"""
Extract per-page content from Word's PDF output.

For each Word page (1..49):
  - first 30 chars of body text (after trim)
  - last 30 chars of body text (before trim)
  - footnote IDs visible on page (parsed from superscript markers)
  - bookmark / page-footer text (e.g., "Last Updated October 2025")

Output: tools/sd-2656-footnote-analyzer/output/word-pages.json
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORD_PDF = Path(os.path.expanduser("~/Documents/sd-2656-it923-current-fixtures/word.pdf"))


def extract_per_page_text() -> list[str]:
    if not WORD_PDF.exists():
        print(f"ERROR: {WORD_PDF} not found", file=sys.stderr)
        sys.exit(1)
    # pdftotext -layout preserves columns; uses form-feed between pages.
    res = subprocess.run(
        ["pdftotext", "-layout", str(WORD_PDF), "-"],
        capture_output=True, text=True, check=True,
    )
    pages = res.stdout.split("\f")
    # Drop trailing empty page if present.
    if pages and not pages[-1].strip():
        pages = pages[:-1]
    return pages


def collapse_ws(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def extract_footnote_band(page_text: str) -> tuple[str, str]:
    """
    Find the footnote band on a page. The footnote band typically starts after
    a horizontal line marker which pdftotext renders as a row of underscores
    or simply blank space. Heuristic: lines beginning with a superscript-style
    digit followed by space are footnote starts.
    """
    lines = page_text.splitlines()
    # Find first line that looks like a footnote: starts with digit + space
    # or has the pattern "1 The..." / "2 Pursuant..." with a tab-ish offset.
    body_lines = []
    fn_lines = []
    in_fn = False
    for line in lines:
        stripped = line.strip()
        # Footnotes typically start with a small digit at the start of line
        # followed by space and capital letter. Or they follow a separator
        # made of underscores. A practical heuristic for IT-923:
        if not in_fn:
            # The footnote band begins after a row of underscores, OR with
            # a line matching "<digit> <CapWord>" pattern.
            if re.match(r"^_{3,}", stripped):
                in_fn = True
                continue
            if re.match(r"^\d+\s+[A-Z][a-z]", stripped):
                in_fn = True
        if in_fn:
            fn_lines.append(line)
        else:
            body_lines.append(line)
    return "\n".join(body_lines), "\n".join(fn_lines)


def extract_footnote_ids(fn_text: str) -> list[int]:
    """
    Extract the visible footnote IDs that have an explicit start line in the
    band (i.e., "1 Body text...", "2 Body text..."). Continuations from prior
    pages don't have a leading number marker.
    """
    ids = []
    for line in fn_text.splitlines():
        m = re.match(r"^\s*(\d+)\s+[A-Z]", line)
        if m:
            ids.append(int(m.group(1)))
    return ids


def first_chars(s: str, n: int = 80) -> str:
    return collapse_ws(s)[:n]


def last_chars(s: str, n: int = 80) -> str:
    cs = collapse_ws(s)
    if len(cs) <= n:
        return cs
    return "…" + cs[-n:]


def main() -> int:
    pages = extract_per_page_text()
    word_pages = []
    for i, page_text in enumerate(pages, start=1):
        body, fn_band = extract_footnote_band(page_text)
        # Footer pattern: "Last Updated October 2025" + page number.
        footer_m = re.search(r"Last Updated\s+[A-Z][a-z]+\s+\d+\s+([A-Za-z0-9\-]+)", body)
        footer_page = footer_m.group(1) if footer_m else None
        word_pages.append({
            "page": i,
            "bodyStart": first_chars(body, 100),
            "bodyEnd": last_chars(body, 100),
            "footnoteIds": extract_footnote_ids(fn_band),
            "footer": footer_page,
        })

    out = ROOT / "output" / "word-pages.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"totalPages": len(word_pages), "pages": word_pages}, indent=2))
    print(f"Extracted {len(word_pages)} Word pages → {out}")

    # Print first 5 + last 5 for verification
    print("\nFirst 5 pages:")
    for p in word_pages[:5]:
        print(f"  p{p['page']}: fns={p['footnoteIds']}")
        print(f"    body[0..]: {p['bodyStart']}")
        print(f"    body[-1]: {p['bodyEnd']}")
    print("\nLast 3 pages:")
    for p in word_pages[-3:]:
        print(f"  p{p['page']}: fns={p['footnoteIds']}")
        print(f"    body[0..]: {p['bodyStart']}")
        print(f"    body[-1]: {p['bodyEnd']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
