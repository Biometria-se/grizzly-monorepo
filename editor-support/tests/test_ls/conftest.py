from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

import pytest

from .fixtures import LspFixture

if TYPE_CHECKING:
    from collections.abc import Generator


def _lsp_fixture() -> Generator[LspFixture, None, None]:
    with LspFixture() as fixture:
        yield fixture


lsp_fixture = pytest.fixture(scope='session')(_lsp_fixture)

GRIZZLY_PROJECT = (Path(__file__) / '..' / '..' / '..' / 'tests' / 'project').resolve()

assert GRIZZLY_PROJECT.is_dir()
