#!/usr/bin/env python

from __future__ import annotations

from os import environ
from pathlib import Path


def main() -> int:
    with Path(environ['GITHUB_PATH']).open('a') as fd:
        fd.write(f'{environ["VIRTUAL_ENV"]}/bin\n')

    return 0


if __name__ == '__main__':
    raise SystemExit(main())
