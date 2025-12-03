#!/usr/bin/env python
#
# /// script
# requires-python = ">=3.13"
# dependencies = [
#    "semver>=3.0.4",
# ]
# ///

import argparse
import json
import re
import subprocess
import sys
from contextlib import suppress
from os import environ
from pathlib import Path

import semver
import tomllib


def main() -> int:
    parser = argparse.ArgumentParser(description='Get tag regex for project')
    parser.add_argument('--project', type=str, required=True, help='Path to project file')
    parser.add_argument('--bump', type=str, required=True, choices=['major', 'minor', 'patch'], help='Version bump type (major, minor, patch)')
    args = parser.parse_args()

    project_path = Path(args.project)

    if not project_path.is_dir():
        parser.error('--project must be a directory')

    project_file = project_path / 'pyproject.toml'

    if project_file.exists():
        with project_file.open('rb') as fd:
            pyproject = tomllib.load(fd)
            describe_command = pyproject.get('tool', {}).get('hatch', {}).get('version', {}).get('raw-options', {}).get('scm', {}).get('git', {}).get('describe_command', None)
            if describe_command is None:
                print('no git.scm.describe_command found in pyproject.toml', file=sys.stderr)
                return 1

            regex = r"git.*--match ['\"]([^'\"]+)['\"]"
            match = re.search(regex, describe_command)

            if not match:
                print('no tag pattern found in git.scm.describe_command', file=sys.stderr)
                return 1

            tag_pattern = match.group(1)
    else:
        project_file = project_path / 'package.json'

        if not project_file.exists():
            print('no recognized project file found in the specified directory', file=sys.stderr)
            return 1

        with project_file.open('r') as fd:
            package_json = json.loads(fd.read())
            tag_pattern = package_json.get('version', None)
            if tag_pattern is None:
                print('no version found in package.json', file=sys.stderr)
                return 1

            tag_pattern = tag_pattern.replace('v0.0.0', 'v*[0-9]*')

    output = subprocess.run(['git', 'tag', '-n', tag_pattern, '--sort=-version:refname', '--format=%(refname:lstrip=2)'], check=False, capture_output=True, text=True)  # noqa: S607

    tags = output.stdout.strip().splitlines()

    previous_tag = tags[0] if len(tags) > 0 else tag_pattern.replace('v*[0-9]*', 'v0.0.1')

    tag_prefix, previous_tag_version = previous_tag.split('@', 1)

    print(f'{tag_prefix=}\n{previous_tag_version=}')
    previous_version = previous_tag_version.lstrip('v')

    current_version = semver.Version.parse(previous_version)

    print(f'{current_version=!s}')

    match args.bump:
        case 'major':
            next_version = current_version.bump_major()
        case 'minor':
            next_version = current_version.bump_minor()
        case 'patch':
            next_version = current_version.bump_patch()

    print(f'{next_version=!s}')

    next_tag = f'{tag_prefix}@v{next_version}'

    print(f'{next_tag=}')

    with suppress(KeyError), Path(environ['GITHUB_OUTPUT']).open('a') as fd:
        fd.write(f'next-release-tag={next_tag}\n')
        fd.write(f'next-release-version={next_version!s}\n')

    return 0


if __name__ == '__main__':
    raise sys.exit(main())
