"""Any import from a grizzly module should intialize version (grizzly and locust) variables."""

from gevent import monkey

monkey.patch_all()

from importlib.metadata import PackageNotFoundError, version

from grizzly_common.__version__ import __version__ as __common_version__

from grizzly.__version__ import __version__

try:
    __locust_version__ = version('locust')
except PackageNotFoundError:  # pragma: no cover
    __locust_version__ = '<unknown>'

__all__ = ['__common_version__', '__version__']
