import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class _SyncRuntimeStub:
    def invoke(self, operation_id, params, **_kwargs):
        return {"operation_id": operation_id, "params": params}


async def _async_invoke(operation_id, params, **_kwargs):
    return {"operation_id": operation_id, "params": params}


class _AsyncRuntimeStub:
    invoke = staticmethod(_async_invoke)


class _SyncEnvelopeRuntimeStub:
    def invoke(self, operation_id, params, **_kwargs):
        if operation_id == "doc.getMarkdown":
            return {"document": {"path": "x.docx"}, "markdown": "# Hello"}
        if operation_id == "doc.getText":
            return {"document": {"path": "x.docx"}, "text": "Hello"}
        if operation_id == "doc.getHtml":
            return {"document": {"path": "x.docx"}, "html": "<p>Hello</p>"}
        return {"operation_id": operation_id, "params": params}


async def _async_invoke_with_envelopes(operation_id, params, **_kwargs):
    if operation_id == "doc.getMarkdown":
        return {"document": {"path": "x.docx"}, "markdown": "# Hello"}
    if operation_id == "doc.getText":
        return {"document": {"path": "x.docx"}, "text": "Hello"}
    if operation_id == "doc.getHtml":
        return {"document": {"path": "x.docx"}, "html": "<p>Hello</p>"}
    return {"operation_id": operation_id, "params": params}


class _AsyncEnvelopeRuntimeStub:
    invoke = staticmethod(_async_invoke_with_envelopes)


def test_sync_doc_api_exposes_snake_case_and_camel_aliases():
    from superdoc.generated.client import _SyncDocApi

    doc = _SyncDocApi(_SyncRuntimeStub())

    assert hasattr(doc, "get_markdown")
    assert hasattr(doc, "getMarkdown")
    assert doc.get_markdown({})["operation_id"] == "doc.getMarkdown"
    assert doc.getMarkdown({})["operation_id"] == "doc.getMarkdown"

    assert hasattr(doc, "get_html")
    assert hasattr(doc, "getHtml")
    assert doc.get_html({})["operation_id"] == "doc.getHtml"
    assert doc.getHtml({})["operation_id"] == "doc.getHtml"

    assert hasattr(doc, "track_changes")
    assert hasattr(doc, "trackChanges")
    assert doc.track_changes.list({})["operation_id"] == "doc.trackChanges.list"
    assert doc.trackChanges.list({})["operation_id"] == "doc.trackChanges.list"


def test_async_doc_api_exposes_snake_case_and_camel_aliases():
    from superdoc.generated.client import _AsyncDocApi

    doc = _AsyncDocApi(_AsyncRuntimeStub())

    assert hasattr(doc, "get_markdown")
    assert hasattr(doc, "getMarkdown")
    assert asyncio.run(doc.get_markdown({}))["operation_id"] == "doc.getMarkdown"
    assert asyncio.run(doc.getMarkdown({}))["operation_id"] == "doc.getMarkdown"

    assert hasattr(doc, "get_html")
    assert hasattr(doc, "getHtml")
    assert asyncio.run(doc.get_html({}))["operation_id"] == "doc.getHtml"
    assert asyncio.run(doc.getHtml({}))["operation_id"] == "doc.getHtml"


def test_sync_doc_api_unwraps_string_envelopes():
    from superdoc.generated.client import _SyncDocApi

    doc = _SyncDocApi(_SyncEnvelopeRuntimeStub())
    assert doc.get_markdown({}) == "# Hello"
    assert doc.get_text({}) == "Hello"
    assert doc.get_html({}) == "<p>Hello</p>"


def test_async_doc_api_unwraps_string_envelopes():
    from superdoc.generated.client import _AsyncDocApi

    doc = _AsyncDocApi(_AsyncEnvelopeRuntimeStub())
    assert asyncio.run(doc.get_markdown({})) == "# Hello"
    assert asyncio.run(doc.get_text({})) == "Hello"
    assert asyncio.run(doc.get_html({})) == "<p>Hello</p>"
