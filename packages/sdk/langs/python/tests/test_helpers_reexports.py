"""
Failing tests that expose missing re-exports in ``superdoc.helpers``.

The helper module defines ``unformat_*`` and ``clear_*`` functions in
``superdoc.helpers.format``, but package-level imports from
``superdoc.helpers`` currently fail.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def test_superdoc_helpers_reexports_unformat_helpers():
    from superdoc.helpers import (
        unformat_bold,
        unformat_italic,
        unformat_underline,
        unformat_strikethrough,
    )

    assert callable(unformat_bold)
    assert callable(unformat_italic)
    assert callable(unformat_underline)
    assert callable(unformat_strikethrough)


def test_superdoc_helpers_reexports_clear_helpers():
    from superdoc.helpers import (
        clear_bold,
        clear_italic,
        clear_underline,
        clear_strikethrough,
    )

    assert callable(clear_bold)
    assert callable(clear_italic)
    assert callable(clear_underline)
    assert callable(clear_strikethrough)


def test_superdoc_helpers_all_includes_new_helpers():
    from superdoc import helpers

    expected = {
        "unformat_bold",
        "unformat_italic",
        "unformat_underline",
        "unformat_strikethrough",
        "clear_bold",
        "clear_italic",
        "clear_underline",
        "clear_strikethrough",
    }

    assert expected.issubset(set(helpers.__all__))
