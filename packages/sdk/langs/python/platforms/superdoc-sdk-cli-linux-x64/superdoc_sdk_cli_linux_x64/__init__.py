"""SuperDoc CLI binary for Linux x64."""

from __future__ import annotations

import os
from importlib import resources


_BINARY_NAME = 'superdoc'


def get_binary_path() -> str:
    """Return the absolute path to the bundled CLI binary.

    The binary is made executable at build time via setup.py's build_py hook,
    so no runtime chmod is needed.
    """
    binary = resources.files(__package__).joinpath('bin', _BINARY_NAME)
    path = str(binary)

    if not os.path.isfile(path):
        raise FileNotFoundError(f'CLI binary not found: {path}')

    return path
