"""Build script for Windows platform package.

Windows doesn't use Unix file permissions, so no chmod is needed.
This setup.py exists for consistency across all platform packages.
"""

from setuptools import setup

setup()
