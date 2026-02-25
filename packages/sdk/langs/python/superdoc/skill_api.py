from __future__ import annotations

import os
from pathlib import Path
import re
from importlib import resources
from typing import Literal, TypedDict

from .errors import SuperDocError

_SKILL_NAME_RE = re.compile(r'^[A-Za-z0-9][A-Za-z0-9_-]*$')
_SUPPORTED_SKILL_RUNTIMES = ('claude',)
_SUPPORTED_INSTALL_SCOPES = ('project', 'user')
SkillRuntime = Literal['claude']
SkillInstallScope = Literal['project', 'user']


class InstalledSkillResult(TypedDict):
    name: str
    runtime: SkillRuntime
    scope: Literal['project', 'user', 'custom']
    path: str
    written: bool
    overwritten: bool


def _normalize_skill_name(name: str) -> str:
    normalized = name.strip()
    if not normalized or _SKILL_NAME_RE.fullmatch(normalized) is None:
        raise SuperDocError('Skill name is required.', code='INVALID_ARGUMENT', details={'name': name})
    return normalized


def _available_skills_for_error() -> list:
    try:
        return list_skills()
    except SuperDocError:
        return []


def list_skills() -> list:
    result: list = []
    try:
        directory = resources.files('superdoc').joinpath('skills')
        for entry in directory.iterdir():
            name = entry.name
            if Path(name).suffix == '.md':
                result.append(Path(name).stem)
    except Exception as error:
        raise SuperDocError(
            'Unable to enumerate SDK skills.',
            code='SKILL_IO_ERROR',
            details={'message': str(error)},
        ) from error

    result.sort()
    return result


def get_skill(name: str) -> str:
    normalized = _normalize_skill_name(name)

    resource = resources.files('superdoc').joinpath('skills', f'{normalized}.md')
    try:
        return resource.read_text(encoding='utf-8')
    except FileNotFoundError as error:
        raise SuperDocError(
            'Requested SDK skill was not found.',
            code='SKILL_NOT_FOUND',
            details={'name': normalized, 'available': _available_skills_for_error()},
        ) from error
    except Exception as error:
        raise SuperDocError(
            'Unable to read SDK skill file.',
            code='SKILL_IO_ERROR',
            details={'name': normalized, 'message': str(error)},
        ) from error


def install_skill(
    name: str,
    *,
    runtime: SkillRuntime = 'claude',
    scope: SkillInstallScope = 'project',
    target_dir: str | None = None,
    cwd: str | None = None,
    home_dir: str | None = None,
    overwrite: bool = True,
) -> InstalledSkillResult:
    normalized = _normalize_skill_name(name)

    if runtime not in _SUPPORTED_SKILL_RUNTIMES:
        raise SuperDocError(
            'Unsupported skill runtime.',
            code='INVALID_ARGUMENT',
            details={'runtime': runtime, 'supportedRuntimes': list(_SUPPORTED_SKILL_RUNTIMES)},
        )

    if scope not in _SUPPORTED_INSTALL_SCOPES:
        raise SuperDocError(
            'Unsupported skill install scope.',
            code='INVALID_ARGUMENT',
            details={'scope': scope, 'supportedScopes': list(_SUPPORTED_INSTALL_SCOPES)},
        )

    if target_dir is not None:
        skills_root = Path(target_dir).resolve()
        result_scope: Literal['project', 'user', 'custom'] = 'custom'
    elif scope == 'user':
        skills_root = Path(home_dir or str(Path.home())).resolve() / '.claude' / 'skills'
        result_scope = 'user'
    else:
        skills_root = Path(cwd or os.getcwd()).resolve() / '.claude' / 'skills'
        result_scope = 'project'

    skill_path = skills_root / normalized / 'SKILL.md'
    existed = skill_path.exists()
    if existed and not overwrite:
        return {
            'name': normalized,
            'runtime': runtime,
            'scope': result_scope,
            'path': str(skill_path),
            'written': False,
            'overwritten': False,
        }

    try:
        content = get_skill(normalized)
        skill_path.parent.mkdir(parents=True, exist_ok=True)
        skill_path.write_text(content, encoding='utf-8')
    except SuperDocError:
        raise
    except Exception as error:
        raise SuperDocError(
            'Unable to install SDK skill.',
            code='SKILL_IO_ERROR',
            details={
                'name': normalized,
                'runtime': runtime,
                'scope': result_scope,
                'path': str(skill_path),
                'message': str(error),
            },
        ) from error

    return {
        'name': normalized,
        'runtime': runtime,
        'scope': result_scope,
        'path': str(skill_path),
        'written': True,
        'overwritten': existed,
    }
