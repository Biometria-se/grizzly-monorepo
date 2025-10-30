#!/usr/bin/env python

from __future__ import annotations

import sys
from os import environ
from pathlib import Path
from tempfile import gettempdir


def main() -> int:
    workspace = Path(environ['GITHUB_WORKSPACE'])
    virtual_env = Path.joinpath(workspace, '.venv')
    virtual_env_path = Path.joinpath(virtual_env, ('Scripts' if sys.platform == 'win32' else 'bin'))
    tmp_dir = Path(gettempdir())
    grizzly_tmp_logfile = Path.joinpath(tmp_dir, 'grizzly.log')

    with Path(environ['GITHUB_ENV']).open('a') as fd:
        fd.write(f'VIRTUAL_ENV={virtual_env!s}\n')
        fd.write(f'GRIZZLY_TMP_DIR={tmp_dir!s}\n')
        fd.write(f'GRIZZLY_TMP_LOGFILE={grizzly_tmp_logfile!s}\n')

    with Path(environ['GITHUB_PATH']).open('a') as fd:
        fd.write(f'{virtual_env_path!s}\n')

    return 0


if __name__ == '__main__':
    raise SystemExit(main())
