from __future__ import annotations

import os
import platform
from importlib import resources
from pathlib import Path
from typing import Optional

from .errors import SuperDocError


# Maps target triple → companion package module name.
_TARGET_TO_COMPANION_MODULE = {
    'darwin-arm64': 'superdoc_sdk_cli_darwin_arm64',
    'darwin-x64': 'superdoc_sdk_cli_darwin_x64',
    'linux-x64': 'superdoc_sdk_cli_linux_x64',
    'linux-arm64': 'superdoc_sdk_cli_linux_arm64',
    'windows-x64': 'superdoc_sdk_cli_windows_x64',
}


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


def _resolve_from_companion_package(target: str) -> Optional[str]:
    """Try #1: import the installed platform companion package."""
    module_name = _TARGET_TO_COMPANION_MODULE.get(target)
    if not module_name:
        return None
    try:
        module = __import__(module_name)
        return module.get_binary_path()
    except (ImportError, FileNotFoundError):
        return None


def _resolve_from_vendor_fallback(target: str) -> Optional[str]:
    """Try #2: legacy _vendor/cli/ path (source/dev environments only).

    This path only exists when running from a source checkout with
    manually staged binaries — it is NOT shipped in published wheels.
    """
    binary_name = _resolve_binary_name(target)
    resource = resources.files('superdoc').joinpath('_vendor', 'cli', target, binary_name)
    try:
        candidate = Path(str(resource))
    except Exception:
        return None
    return str(candidate) if candidate.exists() else None


def resolve_embedded_cli_path() -> str:
    target = _resolve_target()
    if target is None:
        raise SuperDocError(
            'No embedded SuperDoc CLI binary is available for this platform.',
            code='UNSUPPORTED_PLATFORM',
            details={'platform': platform.system(), 'machine': platform.machine()},
        )

    # Companion package (primary — used in published wheels)
    path = _resolve_from_companion_package(target)

    # Legacy vendor fallback (source/dev only — not shipped in wheels)
    if path is None:
        path = _resolve_from_vendor_fallback(target)

    if path is None:
        raise SuperDocError(
            f'Embedded SuperDoc CLI binary is missing for this platform.\n'
            f'Install the companion package: pip install superdoc-sdk-cli-{target}\n'
            f'Or set SUPERDOC_CLI_BIN to a compatible superdoc binary path.',
            code='CLI_BINARY_MISSING',
            details={'target': target},
        )

    # Ensure binary is executable on unix
    if os.name != 'nt':
        try:
            mode = os.stat(path).st_mode
            os.chmod(path, mode | 0o111)
        except Exception:
            pass

    return path
