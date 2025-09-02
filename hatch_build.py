"""Hatch build hook for installing editor-support/client/vscode."""

from __future__ import annotations

import subprocess
from contextlib import suppress
from os import environ
from pathlib import Path
from typing import Any

from hatchling.builders.hooks.plugin.interface import BuildHookInterface
from hatchling.metadata.plugin.interface import MetadataHookInterface


class BuildGrizzly(BuildHookInterface):
    def _build_client(self) -> None:
        if environ.get('SKIP_BUILD_CLIENT', None) is None:
            try:
                target = 'clients/vscode'
                print(f'Building {target}')
                subprocess.check_output('npm install', cwd=target, shell=True, stderr=subprocess.STDOUT)
            except subprocess.CalledProcessError as e:
                message = f'"{e.cmd}" got exit code {e.returncode}: {e.output}'
                raise RuntimeError(message) from e

    def initialize(self, version: str, build_data: dict[str, Any]) -> None:
        match self.metadata.name:
            case 'grizzly-loadtester-ls':
                self._build_client()
            case _:
                pass

        return super().initialize(version, build_data)
