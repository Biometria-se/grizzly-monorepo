#!/usr/bin/env python
#
# /// script
# requires-python = ">=3.13"
# dependencies = []
# ///


import json
import sys
from os import environ
from pathlib import Path
from typing import Any

import tomllib


class HashableDict(dict):
    def __hash__(self) -> int:  # type: ignore[override]
        return hash((frozenset(self), frozenset(self.values())))


def main() -> int:
    try:
        argument = sys.argv[1]
        workflow_input = json.loads(argument)
    except IndexError:
        print('invalid argument', file=sys.stderr)
        return 1
    except json.JSONDecodeError:
        print(f'invalid json in argument: "{argument}"', file=sys.stderr)
        return 1

    workflow_output: set[dict[str, str]] = set()
    workspace_dependencies: set[str] = set()
    uv_lock_file = (Path(__file__).parent / '..' / '..' / 'uv.lock').resolve()

    with uv_lock_file.open('rb') as fd:
        uv_lock = tomllib.load(fd)
        uv_lock_package: list[dict[str, Any]] = uv_lock.get('package', {})

        for directory in workflow_input:
            pyproject_file = Path(directory) / 'pyproject.toml'

            with pyproject_file.open('rb') as pyproject_fd:
                pyproject = tomllib.load(pyproject_fd)
                project = pyproject.get('project', {})

                package = project.get('name', None)
                workflow_output.add(HashableDict({'directory': directory, 'package': package}))

                # workspace packages that has dependencies on this package
                reversed_dependencies: list[str] = [
                    value['name']
                    for value in uv_lock_package
                    if value.get('name', '').startswith('grizzly-') and any(dependency['name'] == package for dependency in value.get('dependencies', []))
                ]
                if len(reversed_dependencies) > 0:
                    workspace_dependencies.update(reversed_dependencies)

        if len(workflow_output) < 1:
            print('no changes detected in known locations', file=sys.stderr)
            return 1

        if len(workspace_dependencies) > 0:
            workspace_packages: dict[str, str] = {
                value['name']: value.get('source', {}).get('editable', None) for value in uv_lock_package if value.get('name') in workspace_dependencies
            }

            for workspace_dependency in workspace_dependencies:
                directory = workspace_packages.get(workspace_dependency)
                workflow_output.add(HashableDict({'directory': directory, 'package': workspace_dependency}))

    workflow_output_log = json.dumps(list(workflow_output), indent=2)
    print(f'detected changes:\n{workflow_output_log}')

    with Path(environ['GITHUB_OUTPUT']).open('a') as fd:
        github_output = json.dumps(list(workflow_output))
        fd.write(f'mapped_changes={github_output}\n')

    return 0


if __name__ == '__main__':
    sys.exit(main())
