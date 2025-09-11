"""Macro for generating changelog information."""

from __future__ import annotations

from mkdocs_macros.util import trace


def changelog(project: str) -> str:
    return f'Changelog for {project}'
