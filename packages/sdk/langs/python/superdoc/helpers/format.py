"""
Format helper functions for the SuperDoc Python SDK.

These are hand-written convenience wrappers that call the canonical
``format.apply`` operation with pre-filled inline directives.  They are NOT generated
from the contract and will not be overwritten by ``pnpm run generate:all``.

Usage::

    from superdoc import SuperDocClient
    from superdoc.helpers import format_bold, unformat_bold, clear_bold

    client = SuperDocClient()
    client.connect()

    # Apply bold ON:
    result = format_bold(client.doc, block_id="p1", start=0, end=5)

    # Apply explicit bold OFF (override style inheritance):
    result = unformat_bold(client.doc, block_id="p1", start=0, end=5)

    # Clear direct bold formatting (inherit from style cascade):
    result = clear_bold(client.doc, block_id="p1", start=0, end=5)
"""

from __future__ import annotations

from typing import Any, Optional, Protocol


class FormatApplyCallable(Protocol):
    """Protocol matching the generated ``doc.format_apply`` method."""

    def __call__(self, **kwargs: Any) -> Any: ...


class DocApi(Protocol):
    """Minimal protocol for the doc API object returned by the generated client."""

    format_apply: FormatApplyCallable


def _normalize_target(
    target: Optional[dict[str, Any]],
    block_id: Optional[str],
    start: Optional[int],
    end: Optional[int],
) -> Optional[dict[str, Any]]:
    """Convert flat flags (block_id, start, end) to a canonical target dict.

    If *target* is already provided, flat flags are ignored. If *block_id*
    is provided without *target*, a text-range target is constructed.
    """
    if target is not None:
        return target
    if block_id is not None:
        return {
            "kind": "text",
            "blockId": block_id,
            "range": {"start": start if start is not None else 0, "end": end if end is not None else 0},
        }
    return None


def _format_inline(
    doc: DocApi,
    inline: dict[str, str],
    *,
    target: Optional[dict[str, Any]] = None,
    block_id: Optional[str] = None,
    start: Optional[int] = None,
    end: Optional[int] = None,
    dry_run: Optional[bool] = None,
    change_mode: Optional[str] = None,
    expected_revision: Optional[str] = None,
    **extra: Any,
) -> Any:
    """Internal dispatch -- merges ``inline`` and forwards to ``format.apply``.

    Flat-flag shortcuts (``block_id``, ``start``, ``end``) are normalized
    into a canonical ``target`` dict before calling the API.
    """
    kwargs: dict[str, Any] = {"inline": inline}

    resolved_target = _normalize_target(target, block_id, start, end)
    if resolved_target is not None:
        kwargs["target"] = resolved_target

    if dry_run is not None:
        kwargs["dry_run"] = dry_run
    if change_mode is not None:
        kwargs["change_mode"] = change_mode
    if expected_revision is not None:
        kwargs["expected_revision"] = expected_revision
    if "inline" in extra:
        raise TypeError("Cannot pass 'inline' directly; it is set by the format helper.")
    kwargs.update(extra)
    return doc.format_apply(**kwargs)


# ---------------------------------------------------------------------------
# format_* helpers — apply ON directive
# ---------------------------------------------------------------------------


def format_bold(doc: DocApi, **kwargs: Any) -> Any:
    """Apply bold ON.  Equivalent to ``format.apply(inline={"bold": "on"})``."""
    return _format_inline(doc, {"bold": "on"}, **kwargs)


def format_italic(doc: DocApi, **kwargs: Any) -> Any:
    """Apply italic ON.  Equivalent to ``format.apply(inline={"italic": "on"})``."""
    return _format_inline(doc, {"italic": "on"}, **kwargs)


def format_underline(doc: DocApi, **kwargs: Any) -> Any:
    """Apply underline ON.  Equivalent to ``format.apply(inline={"underline": "on"})``."""
    return _format_inline(doc, {"underline": "on"}, **kwargs)


def format_strikethrough(doc: DocApi, **kwargs: Any) -> Any:
    """Apply strikethrough ON.  Equivalent to ``format.apply(inline={"strike": "on"})``."""
    return _format_inline(doc, {"strike": "on"}, **kwargs)


# ---------------------------------------------------------------------------
# unformat_* helpers — apply explicit OFF directive (style override)
# ---------------------------------------------------------------------------


def unformat_bold(doc: DocApi, **kwargs: Any) -> Any:
    """Apply bold OFF.  Equivalent to ``format.apply(inline={"bold": "off"})``."""
    return _format_inline(doc, {"bold": "off"}, **kwargs)


def unformat_italic(doc: DocApi, **kwargs: Any) -> Any:
    """Apply italic OFF.  Equivalent to ``format.apply(inline={"italic": "off"})``."""
    return _format_inline(doc, {"italic": "off"}, **kwargs)


def unformat_underline(doc: DocApi, **kwargs: Any) -> Any:
    """Apply underline OFF.  Equivalent to ``format.apply(inline={"underline": "off"})``."""
    return _format_inline(doc, {"underline": "off"}, **kwargs)


def unformat_strikethrough(doc: DocApi, **kwargs: Any) -> Any:
    """Apply strikethrough OFF.  Equivalent to ``format.apply(inline={"strike": "off"})``."""
    return _format_inline(doc, {"strike": "off"}, **kwargs)


# ---------------------------------------------------------------------------
# clear_* helpers — remove direct formatting (inherit from style cascade)
# ---------------------------------------------------------------------------


def clear_bold(doc: DocApi, **kwargs: Any) -> Any:
    """Clear bold formatting.  Equivalent to ``format.apply(inline={"bold": "clear"})``."""
    return _format_inline(doc, {"bold": "clear"}, **kwargs)


def clear_italic(doc: DocApi, **kwargs: Any) -> Any:
    """Clear italic formatting.  Equivalent to ``format.apply(inline={"italic": "clear"})``."""
    return _format_inline(doc, {"italic": "clear"}, **kwargs)


def clear_underline(doc: DocApi, **kwargs: Any) -> Any:
    """Clear underline formatting.  Equivalent to ``format.apply(inline={"underline": "clear"})``."""
    return _format_inline(doc, {"underline": "clear"}, **kwargs)


def clear_strikethrough(doc: DocApi, **kwargs: Any) -> Any:
    """Clear strikethrough formatting.  Equivalent to ``format.apply(inline={"strike": "clear"})``."""
    return _format_inline(doc, {"strike": "clear"}, **kwargs)
