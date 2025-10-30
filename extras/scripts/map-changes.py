#!/usr/bin/env python
#
# /// script
# requires-python = ">=3.13"
# dependencies = [
#    "pyyaml>=6.0.2",
# ]
# ///


import argparse
import json
import sys
from contextlib import suppress
from dataclasses import asdict, dataclass
from operator import itemgetter
from os import environ
from pathlib import Path
from typing import Any, TypedDict

import tomllib
import yaml


@dataclass(eq=True, frozen=True)
class ChangeE2eTests:
    local: str
    dist: str


@dataclass(eq=True, frozen=True)
class ChangeTests:
    unit: str
    e2e: ChangeE2eTests


@dataclass(eq=True, frozen=True)
class Change:
    directory: str
    package: str
    tests: ChangeTests


class Changes(TypedDict):
    npm: set[Change]
    uv: set[Change]


def _create_python_change(directory: str, package: str) -> Change:
    directory_path = Path(directory)

    try:
        test_directory = next(iter([test_base for test_base in Path.joinpath(directory_path, 'tests').glob('test_*') if test_base.is_dir()]))
    except StopIteration:  # no tests and/or tests/test_ directories, ergo: no tests
        return Change(directory=directory, package=package, tests=ChangeTests(unit='', e2e=ChangeE2eTests(local='', dist='')))

    test_unit_directory = Path.joinpath(test_directory, 'unit')
    test_e2e_directory = Path.joinpath(test_directory, 'e2e')

    args_unit: str = ''
    args_e2e: str = ''
    args_e2e_dist: str = ''

    if test_unit_directory.exists() and test_e2e_directory.exists():
        args_unit = test_unit_directory.relative_to(directory_path).as_posix()
        args_e2e = test_e2e_directory.relative_to(directory_path).as_posix()

        if package == 'grizzly-loadtester':
            args_e2e_dist = args_e2e
    else:
        args_unit = f'{test_directory.relative_to(directory_path).as_posix()}'

    tests = ChangeTests(unit=args_unit, e2e=ChangeE2eTests(local=args_e2e, dist=args_e2e_dist))

    return Change(directory=directory, package=package, tests=tests)


def python_package(directory: str, uv_lock_package: list[dict[str, Any]]) -> set[Change]:
    changes: set[Change] = set()

    directory_path = Path(directory)
    pyproject_file = directory_path / 'pyproject.toml'

    if not pyproject_file.exists():
        return changes

    with pyproject_file.open('rb') as pyproject_fd:
        pyproject = tomllib.load(pyproject_fd)
        project = pyproject.get('project', {})

        package = project.get('name', None)

        changes.add(_create_python_change(directory, package))

        # workspace packages that has dependencies on this package
        for value in uv_lock_package:
            if not (value.get('name', '').startswith('grizzly-') and any(dependency['name'] == package for dependency in value.get('dependencies', []))):
                continue

            reverse_package: str = value['name']
            reverse_directory: str = value['source']['editable']

            changes.add(_create_python_change(reverse_directory, reverse_package))

    return changes


def node_package(directory: str) -> set[Change]:
    changes: set[Change] = set()

    package_json_file = Path(directory) / 'package.json'
    if not package_json_file.exists():
        return changes

    with package_json_file.open('r') as fd:
        package_json = json.loads(fd.read())
        package_scripts = package_json.get('scripts', {})

        args_unit: str = 'tests' if 'tests' in package_scripts else ''
        args_e2e: str = 'e2e-tests' if 'e2e-tests' in package_scripts else ''

        changes.add(Change(directory=directory, package=package_json['name'], tests=ChangeTests(args_unit, e2e=ChangeE2eTests(local=args_e2e, dist=''))))

    return changes


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--changes', required=True, type=str, help='JSON string of list of directories that had changes')
    parser.add_argument('--force', required=True, type=str, help='Force run on all packages')

    args = parser.parse_args()

    if args.force == 'true':
        change_filters_file = Path.joinpath(Path(__file__).parent.parent.parent, '.github', 'change-filters.yaml')
        with change_filters_file.open('r') as fd:
            change_filters = yaml.safe_load(fd)
            workflow_input = list(change_filters.keys())
    else:
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
            changes['npm'].update(node_package(directory))

        if len(changes) < 1:
            print('no changes detected in known locations', file=sys.stderr)
            return 1

    changes_npm = json.dumps(sorted([asdict(change) for change in changes['npm']], key=itemgetter('package')))
    changes_uv = json.dumps(sorted([asdict(change) for change in changes['uv']], key=itemgetter('package')))

    print(f'detected changes:\nuv={changes_uv}\nnpm={changes_npm}')

    with suppress(KeyError), Path(environ['GITHUB_OUTPUT']).open('a') as fd:
        fd.write(f'changes_uv={changes_uv}\n')
        fd.write(f'changes_npm={changes_npm}\n')

    return 0


if __name__ == '__main__':
    sys.exit(main())
