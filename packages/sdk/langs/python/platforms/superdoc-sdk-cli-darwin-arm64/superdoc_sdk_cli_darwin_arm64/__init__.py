"""SuperDoc CLI binary for macOS ARM64 (Apple Silicon)."""

from __future__ import annotations

import os
from importlib import resources


_BINARY_NAME = 'superdoc'


def get_binary_path() -> str:
    """Return the absolute path to the bundled CLI binary, ensuring it is executable."""
    binary = resources.files(__package__).joinpath('bin', _BINARY_NAME)
    path = str(binary)

    if not os.path.isfile(path):
        raise FileNotFoundError(f'CLI binary not found: {path}')

    if os.name != 'nt':
        mode = os.stat(path).st_mode
        os.chmod(path, mode | 0o111)

    return path
