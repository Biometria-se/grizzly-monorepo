"""Base grizzly-cli module."""

from __future__ import annotations

from importlib.metadata import PackageNotFoundError, version
from os import environ
from pathlib import Path
from typing import TYPE_CHECKING, ClassVar

# @TODO: dynamic
try:
    __version__ = version('grizzly-cli')
except PackageNotFoundError:  # pragma: no cover
    __version__ = '<unknown>'

if TYPE_CHECKING:  # pragma: no cover
    from collections.abc import Callable

    from behave.model import Scenario

    from grizzly_cli.argparse import ArgumentSubParser

EXECUTION_CONTEXT = Path.cwd().as_posix()

STATIC_CONTEXT = Path.joinpath(Path(__file__).parent.absolute(), 'static').as_posix()

MOUNT_CONTEXT = environ.get('GRIZZLY_MOUNT_CONTEXT', EXECUTION_CONTEXT)

PROJECT_NAME = Path(EXECUTION_CONTEXT).name

SCENARIOS: list[Scenario] = []

FEATURE_DESCRIPTION: str | None = None


class register_parser:
    registered: ClassVar[list[Callable[[ArgumentSubParser], None]]] = []
    order: int | None

    def __init__(self, order: int | None = None) -> None:
        self.order = order

    def __call__(self, func: Callable[[ArgumentSubParser], None]) -> Callable[[ArgumentSubParser], None]:
        if self.order is not None:
            self.registered.insert(self.order - 1, func)
        else:
            self.registered.append(func)

        return func


__all__ = [
    '__version__',
]
