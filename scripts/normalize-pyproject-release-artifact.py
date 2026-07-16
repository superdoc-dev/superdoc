#!/usr/bin/env python3

import re
import sys


PROJECT_VERSION = re.compile(
    r"(?m)^([ \t]*version[ \t]*=[ \t]*)([\"'])([^\"'\r\n]+)\2([ \t]*(?:#.*)?(?:\r?\n|$))"
)
SDK_PLATFORM_PIN = re.compile(
    r"([\"'])(superdoc-sdk-cli-(?:darwin-(?:arm64|x64)|linux-(?:arm64|x64)|windows-x64))(==)([^;\"'\s]+)"
)
NORMALIZED_VERSION = "<RELEASE_VERSION>"


def fail(message: str) -> None:
    print(message, file=sys.stderr)
    raise SystemExit(1)


content = sys.stdin.read()
version_matches = list(PROJECT_VERSION.finditer(content))

if len(version_matches) != 1:
    fail(f"expected exactly one project version, found {len(version_matches)}")

project_version = version_matches[0].group(3)


def is_in_toml_comment(match: re.Match[str]) -> bool:
    line_start = match.string.rfind("\n", 0, match.start()) + 1
    quote = None
    escaped = False

    for character in match.string[line_start : match.start()]:
        if quote == '"':
            if escaped:
                escaped = False
            elif character == "\\":
                escaped = True
            elif character == quote:
                quote = None
        elif quote == "'":
            if character == quote:
                quote = None
        elif character == "#":
            return True
        elif character in {'"', "'"}:
            quote = character

    return False


for pin_match in SDK_PLATFORM_PIN.finditer(content):
    if is_in_toml_comment(pin_match):
        continue
    if pin_match.group(4) != project_version:
        fail(
            f"{pin_match.group(2)} pin {pin_match.group(4)} "
            f"does not match project version {project_version}"
        )


def normalize_project_version(match: re.Match[str]) -> str:
    prefix, quote, _, suffix = match.groups()
    return f"{prefix}{quote}{NORMALIZED_VERSION}{quote}{suffix}"


def normalize_sdk_platform_pin(match: re.Match[str]) -> str:
    if is_in_toml_comment(match):
        return match.group(0)
    quote, package_name, operator, _ = match.groups()
    return f"{quote}{package_name}{operator}{NORMALIZED_VERSION}"


normalized = PROJECT_VERSION.sub(normalize_project_version, content, count=1)
normalized = SDK_PLATFORM_PIN.sub(normalize_sdk_platform_pin, normalized)
sys.stdout.write(normalized)
