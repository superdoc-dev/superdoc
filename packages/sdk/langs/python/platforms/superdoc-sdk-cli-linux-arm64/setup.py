"""Build script that ensures the CLI binary is executable before wheel packaging."""

import stat
from pathlib import Path

from setuptools import setup
from setuptools.command.build_py import build_py


class BuildPyWithExecutableBinary(build_py):
    """Custom build_py that ensures the CLI binary has execute permissions."""

    def run(self):
        super().run()
        if self.build_lib:
            binary_path = Path(self.build_lib) / 'superdoc_sdk_cli_linux_arm64' / 'bin' / 'superdoc'
            if binary_path.exists():
                current_mode = binary_path.stat().st_mode
                binary_path.chmod(current_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


setup(cmdclass={'build_py': BuildPyWithExecutableBinary})
