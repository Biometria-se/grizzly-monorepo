from __future__ import annotations

import asyncio
import os
from contextlib import suppress
from importlib import reload as reload_module
from logging import DEBUG
from pathlib import Path
from threading import Thread
from typing import TYPE_CHECKING, Any, Literal

from lsprotocol.types import EXIT
from pygls.server import LanguageServer
from typing_extensions import Self

if TYPE_CHECKING:
    from types import TracebackType

    from grizzly_ls.server import GrizzlyLanguageServer


class DummyClient(LanguageServer):
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)

        @self.feature('window/workDoneProgress/create')
        def window_work_done_progress_create(*_args: Any, **_kwargs: Any) -> None:
            return

        @self.feature('textDocument/publishDiagnostics')
        def text_document_publish_diagnostics(*_args: Any, **_kwargs: Any) -> None:
            return


class LspFixture:
    client: LanguageServer
    server: GrizzlyLanguageServer

    _server_thread: Thread
    _client_thread: Thread

    datadir: Path

    def _reset_behave_runtime(self) -> None:
        from behave import step_registry

        step_registry.setup_step_decorators(None, step_registry.registry)

        import parse

        reload_module(parse)

    def __enter__(self) -> Self:
        self._reset_behave_runtime()
        cstdio, cstdout = os.pipe()
        sstdio, sstdout = os.pipe()

        def start(ls: LanguageServer, fdr: int, fdw: int) -> None:
            with suppress(Exception):
                ls.start_io(os.fdopen(fdr, 'rb'), os.fdopen(fdw, 'wb'))  # type: ignore[arg-type]

        from grizzly_ls.server import server

        server.logger.logger.setLevel(DEBUG)

        server.loop.close()
        server._owns_loop = False
        asyncio.set_event_loop(None)

        server.loop = asyncio.new_event_loop()

        self.server = server
        self.server.language = 'en'
        self._server_thread = Thread(target=start, args=(self.server, cstdio, sstdout), daemon=True)
        self._server_thread.start()

        self.client = DummyClient(loop=asyncio.new_event_loop(), name='dummy client', version='0.0.0')
        self._client_thread = Thread(target=start, args=(self.client, sstdio, cstdout), daemon=True)
        self._client_thread.start()

        self.datadir = (Path(__file__).parent / '..' / '..' / 'tests' / 'project').resolve()

        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> Literal[True]:
        self.server.send_notification(EXIT)
        self.client.send_notification(EXIT)

        self._server_thread.join(timeout=2.0)
        self._client_thread.join(timeout=2.0)

        return True
