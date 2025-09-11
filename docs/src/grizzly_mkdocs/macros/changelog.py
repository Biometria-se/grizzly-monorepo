"""Macro for generating changelog information."""

from __future__ import annotations

import re

from mkdocs_macros.util import trace
from packaging.version import Version

from grizzly_mkdocs.macros.command import command


def changelog(package: str, tag_prefix: str) -> str:
    tags = command(f"git tag | grep '^{tag_prefix}@v'").splitlines()

    git_remote, _ = command(['git', 'remote', '-v']).splitlines()
    _, git_remote, _ = git_remote.split(maxsplit=2)

    repo_url = git_remote.removesuffix('.git').replace(':', '/', 1).replace('git@', 'https://', 1)

    trace(f'{package}: generating changelog for tag prefix "{tag_prefix}@"')

    head_version = command(['hatch', 'version'], cwd=package)
    tags.append(f'v{head_version}')

    # remove tag_prefix from all retrieved tags
    versions = [tag.removeprefix(f'{tag_prefix}@') for tag in tags]
    versions.sort(reverse=True, key=Version)

    markdown_changelog: list[str] = []

    for index, version in enumerate(versions[1:], start=1):
        previous_tag = f'{tag_prefix}@{version}'
        current_version = versions[index - 1]
        current_tag = f'{tag_prefix}@{current_version}' if current_version != f'v{head_version}' else 'HEAD'

        trace(f'generating changelog for {package}: {current_tag} <- {previous_tag}', level='debug')

        cmd = [
            'git',
            'log',
            f'{previous_tag}..{current_tag}',
            '--oneline',
            '--no-decorate',
            '--no-color',
            '--no-abbrev',
            '--no-merges',
            '--',
            f"'{package}/*'",
            f"'{package}/src/**/*'",
            f"'{package}/tests/**/*'",
        ]
        output = command(' '.join(cmd))

        markdown_changelog.extend([f'## {current_version}', ''])

        for line in output.splitlines():
            commit, message = line.split(' ', 1)
            commit_short = commit[:8]

            markdown_changelog.append(f'- <a href="{repo_url}/commit/{commit}" target="_blank">`{commit_short}`</a> {message}')

        markdown_changelog.append('')

    return '\n'.join(markdown_changelog)
