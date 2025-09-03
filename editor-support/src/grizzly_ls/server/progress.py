from __future__ import annotations

from typing import TYPE_CHECKING, Any
from uuid import uuid4

from lsprotocol import types as lsp
from typing_extensions import Self

if TYPE_CHECKING:  # pragma: no cover
    from types import TracebackType

    from pygls.progress import Progress as PyglsProgress


class Progress:
    progress: PyglsProgress
    title: str
    token: str

    def __init__(self, progress: PyglsProgress, title: str) -> None:
        self.progress = progress
        self.title = title
        self.token = str(uuid4())

    @staticmethod
    def callback(*_args: Any, **_kwargs: Any) -> None:
        return  # pragma: no cover

    def __enter__(self) -> Self:
        self.progress.create(self.token, self.__class__.callback)

        self.progress.begin(
            self.token,
            lsp.WorkDoneProgressBegin(title=self.title, percentage=0, cancellable=False),
        )

        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> bool:
        self.report(None, 100)

        self.progress.end(self.token, lsp.WorkDoneProgressEnd())

        return exc is None

    def report(self, message: str | None = None, percentage: int | None = None) -> None:
        self.progress.report(
            self.token,
            lsp.WorkDoneProgressReport(message=message, percentage=percentage),
        )
