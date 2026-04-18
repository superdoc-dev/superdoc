"""
Format helper functions for the SuperDoc Python SDK.

These are hand-written convenience wrappers that call the canonical
``format.apply`` operation with pre-filled inline directives.  They are NOT generated
from the contract and will not be overwritten by ``pnpm run generate:all``.

Usage::

    from superdoc import AsyncSuperDocClient
    from superdoc.helpers import format_bold, unformat_bold, clear_bold

    client = AsyncSuperDocClient()
    await client.connect()
    doc = await client.open({"doc": "path/to/file.docx"})

    # Apply bold ON:
    result = format_bold(doc, block_id="p1", start=0, end=5)

    # Apply explicit bold OFF (override style inheritance):
    result = unformat_bold(doc, block_id="p1", start=0, end=5)

    # Clear direct bold formatting (inherit from style cascade):
    result = clear_bold(doc, block_id="p1", start=0, end=5)
"""

from __future__ import annotations

from typing import Any, Optional, Protocol


class FormatApplyCallable(Protocol):
    """Protocol matching the ``format.apply`` method on a bound document handle."""

    def __call__(self, params: dict[str, Any] | None = None, **kwargs: Any) -> Any: ...


class FormatNamespace(Protocol):
    """Minimal protocol for the format namespace on a document handle."""

    apply: FormatApplyCallable


class DocumentHandle(Protocol):
    """Minimal protocol for a bound document handle with format support."""

    format: FormatNamespace


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
    document: DocumentHandle,
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
    params: dict[str, Any] = {"inline": inline}

    resolved_target = _normalize_target(target, block_id, start, end)
    if resolved_target is not None:
        params["target"] = resolved_target

    if dry_run is not None:
        params["dryRun"] = dry_run
    if change_mode is not None:
        params["changeMode"] = change_mode
    if expected_revision is not None:
        params["expectedRevision"] = expected_revision
    if "inline" in extra:
        raise TypeError("Cannot pass 'inline' directly; it is set by the format helper.")
    params.update(extra)
    return document.format.apply(params)


# ---------------------------------------------------------------------------
# format_* helpers — apply ON directive
# ---------------------------------------------------------------------------


def format_bold(document: DocumentHandle, **kwargs: Any) -> Any:
    """Apply bold ON.  Equivalent to ``format.apply({"inline": {"bold": "on"}})``."""
    return _format_inline(document, {"bold": "on"}, **kwargs)


def format_italic(document: DocumentHandle, **kwargs: Any) -> Any:
    """Apply italic ON.  Equivalent to ``format.apply({"inline": {"italic": "on"}})``."""
    return _format_inline(document, {"italic": "on"}, **kwargs)


def format_underline(document: DocumentHandle, **kwargs: Any) -> Any:
    """Apply underline ON.  Equivalent to ``format.apply({"inline": {"underline": "on"}})``."""
    return _format_inline(document, {"underline": "on"}, **kwargs)


def format_strikethrough(document: DocumentHandle, **kwargs: Any) -> Any:
    """Apply strikethrough ON.  Equivalent to ``format.apply({"inline": {"strike": "on"}})``."""
    return _format_inline(document, {"strike": "on"}, **kwargs)


# ---------------------------------------------------------------------------
# unformat_* helpers — apply explicit OFF directive (style override)
# ---------------------------------------------------------------------------


def unformat_bold(document: DocumentHandle, **kwargs: Any) -> Any:
    """Apply bold OFF.  Equivalent to ``format.apply({"inline": {"bold": "off"}})``."""
    return _format_inline(document, {"bold": "off"}, **kwargs)


def unformat_italic(document: DocumentHandle, **kwargs: Any) -> Any:
    """Apply italic OFF.  Equivalent to ``format.apply({"inline": {"italic": "off"}})``."""
    return _format_inline(document, {"italic": "off"}, **kwargs)


def unformat_underline(document: DocumentHandle, **kwargs: Any) -> Any:
    """Apply underline OFF.  Equivalent to ``format.apply({"inline": {"underline": "off"}})``."""
    return _format_inline(document, {"underline": "off"}, **kwargs)


def unformat_strikethrough(document: DocumentHandle, **kwargs: Any) -> Any:
    """Apply strikethrough OFF.  Equivalent to ``format.apply({"inline": {"strike": "off"}})``."""
    return _format_inline(document, {"strike": "off"}, **kwargs)


# ---------------------------------------------------------------------------
# clear_* helpers — remove direct formatting (inherit from style cascade)
# ---------------------------------------------------------------------------


def clear_bold(document: DocumentHandle, **kwargs: Any) -> Any:
    """Clear bold formatting.  Equivalent to ``format.apply({"inline": {"bold": "clear"}})``."""
    return _format_inline(document, {"bold": "clear"}, **kwargs)


def clear_italic(document: DocumentHandle, **kwargs: Any) -> Any:
    """Clear italic formatting.  Equivalent to ``format.apply({"inline": {"italic": "clear"}})``."""
    return _format_inline(document, {"italic": "clear"}, **kwargs)


def clear_underline(document: DocumentHandle, **kwargs: Any) -> Any:
    """Clear underline formatting.  Equivalent to ``format.apply({"inline": {"underline": "clear"}})``."""
    return _format_inline(document, {"underline": "clear"}, **kwargs)


def clear_strikethrough(document: DocumentHandle, **kwargs: Any) -> Any:
    """Clear strikethrough formatting.  Equivalent to ``format.apply({"inline": {"strike": "clear"}})``."""
    return _format_inline(document, {"strike": "clear"}, **kwargs)
