from __future__ import annotations

import os
import platform
from importlib import resources
from pathlib import Path
from typing import Optional

from .errors import SuperDocError


def _normalized_machine(value: str) -> str:
    normalized = value.strip().lower()
    if normalized in {'x86_64', 'amd64'}:
        return 'x64'
    if normalized in {'aarch64', 'arm64'}:
        return 'arm64'
    return normalized


def _resolve_target() -> Optional[str]:
    system = platform.system().lower()
    machine = _normalized_machine(platform.machine())

    if system == 'darwin' and machine == 'arm64':
        return 'darwin-arm64'
    if system == 'darwin' and machine == 'x64':
        return 'darwin-x64'
    if system == 'linux' and machine == 'x64':
        return 'linux-x64'
    if system == 'linux' and machine == 'arm64':
        return 'linux-arm64'
    if system == 'windows' and machine == 'x64':
        return 'windows-x64'

    return None


def _resolve_binary_name(target: str) -> str:
    return 'superdoc.exe' if target.startswith('windows-') else 'superdoc'


def _resource_to_path(resource) -> Optional[Path]:
    try:
        candidate = Path(str(resource))
    except Exception:
        return None

    return candidate if candidate.exists() else None


def resolve_embedded_cli_path() -> str:
    target = _resolve_target()
    if target is None:
        raise SuperDocError(
            'No embedded SuperDoc CLI binary is available for this platform.',
            code='UNSUPPORTED_PLATFORM',
            details={'platform': platform.system(), 'machine': platform.machine()},
        )

    binary_name = _resolve_binary_name(target)
    resource = resources.files('superdoc').joinpath('_vendor', 'cli', target, binary_name)
    binary_path = _resource_to_path(resource)

    if binary_path is None:
        raise SuperDocError(
            'Embedded SuperDoc CLI binary is missing for this platform.',
            code='CLI_BINARY_MISSING',
            details={'target': target, 'binary': binary_name},
        )

    if os.name != 'nt':
        try:
            mode = binary_path.stat().st_mode
            os.chmod(binary_path, mode | 0o111)
        except Exception:
            pass

    return str(binary_path)
