"""Any import from a grizzly module should intialize version (grizzly and locust) variables."""

from gevent import monkey

monkey.patch_all()

from importlib.metadata import PackageNotFoundError, version

# @TODO: dynamic
try:
    __version__ = version('grizzly')
except PackageNotFoundError:  # pragma: no cover
    __version__ = '<unknown>'

try:
    __locust_version__ = version('locust')
except PackageNotFoundError:  # pragma: no cover
    __locust_version__ = '<unknown>'

__all__ = ['__version__']
