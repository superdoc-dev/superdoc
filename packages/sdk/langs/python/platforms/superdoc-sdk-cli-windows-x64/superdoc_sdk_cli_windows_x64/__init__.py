"""SuperDoc CLI binary for Windows x64."""

from __future__ import annotations

import os
from importlib import resources


_BINARY_NAME = 'superdoc.exe'


def get_binary_path() -> str:
    """Return the absolute path to the bundled CLI binary.

    On Unix, the binary is made executable at build time via setup.py's build_py
    hook. On Windows, executability is determined by file extension (.exe).
    """
    binary = resources.files(__package__).joinpath('bin', _BINARY_NAME)
    path = str(binary)

    if not os.path.isfile(path):
        raise FileNotFoundError(f'CLI binary not found: {path}')

    return path
