#!/usr/bin/env python
#
# /// script
# requires-python = ">=3.13"
# dependencies = []
# ///


import argparse
import json
import sys
from contextlib import suppress
from dataclasses import asdict, dataclass
from os import environ
from pathlib import Path
from typing import Any, Literal, TypedDict

import tomllib


@dataclass(eq=True, frozen=True)
class Change:
    directory: str
    package: str
    script: str
    label: str


class Changes(TypedDict):
    npm: set[Change]
    uv: set[Change]


# @TODO: uv and npm should have seperate jobs, hence seperate output variables
# @TODO: check client-vscode job https://github.com/Biometria-se/grizzly-lsp/blob/main/.github/workflows/code-quality.yaml


def python_package(directory: str, uv_lock_package: list[dict[str, Any]]) -> set[Change]:
    scripts: list[str] = ['ruff check .', 'ruff format .', 'mypy .']
    changes: set[Change] = set()

    pyproject_file = Path(directory) / 'pyproject.toml'
    if not pyproject_file.exists():
        return changes

    with pyproject_file.open('rb') as pyproject_fd:
        pyproject = tomllib.load(pyproject_fd)
        project = pyproject.get('project', {})

        package = project.get('name', None)

        for script in scripts:
            label = ' '.join(script.split(' ')[:-1])
            changes.add(Change(directory=directory, package=package, script=script, label=label))

        # workspace packages that has dependencies on this package
        for value in uv_lock_package:
            if not (value.get('name', '').startswith('grizzly-') and any(dependency['name'] == package for dependency in value.get('dependencies', []))):
                continue

            reverse_package: str = value['name']
            reverse_directory: str = value['source']['editable']

            for script in scripts:
                label = ' '.join(script.split(' ')[:-1])
                changes.add(Change(directory=reverse_directory, package=reverse_package, script=script, label=label))

    return changes


def node_package(directory: str, branch: str) -> set[Change]:
    changes: set[Change] = set()

    package_json_file = Path(directory) / 'package.json'
    if not package_json_file.exists():
        return changes

    with package_json_file.open('r') as fd:
        package_json = json.loads(fd.read())
        package_json_scripts = package_json.get('scripts', {})

        for script in ['lint', 'types', 'tests']:
            if script not in package_json_scripts or (script == 'tests' and branch == 'HEAD'):
                continue

            changes.add(Change(directory=directory, package=package_json['name'], script=script, label=script))

    return changes


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--changes', required=True, type=str, help='JSON string of list of directories that had changes')
    parser.add_argument('--branch', required=True, type=str, help='branch where changes has been detected')

    args = parser.parse_args()

    try:
        workflow_input = json.loads(args.changes)
    except json.JSONDecodeError:
        print(f'invalid json in --changes: "{args.changed_projects}"', file=sys.stderr)
        return 1

    changes: Changes = {'uv': set(), 'npm': set()}
    uv_lock_file = (Path(__file__).parent / '..' / '..' / 'uv.lock').resolve()

    with uv_lock_file.open('rb') as fd:
        uv_lock = tomllib.load(fd)
        uv_lock_package: list[dict[str, Any]] = uv_lock.get('package', {})

        for directory in workflow_input:
            changes['uv'].update(python_package(directory, uv_lock_package))
            changes['npm'].update(node_package(directory, args.branch))

        if len(changes) < 1:
            print('no changes detected in known locations', file=sys.stderr)
            return 1

    changes_npm = json.dumps([asdict(change) for change in changes['npm']])
    changes_uv = json.dumps([asdict(change) for change in changes['uv']])

    print(f'detected changes:\nuv={changes_uv}\nnpm={changes_npm}')

    with suppress(KeyError), Path(environ['GITHUB_OUTPUT']).open('a') as fd:
        fd.write(f'changes_uv={changes_uv}\n')
        fd.write(f'changes_npm={changes_npm}\n')

    return 0


if __name__ == '__main__':
    sys.exit(main())
