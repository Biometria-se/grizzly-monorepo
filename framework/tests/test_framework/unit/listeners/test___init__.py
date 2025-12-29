"""Unit tests of grizzly.listeners."""

from __future__ import annotations

import logging
from os import environ
from secrets import choice
from typing import TYPE_CHECKING, Any, cast

import pytest
from grizzly.auth import RefreshTokenDistributor
from grizzly.context import GrizzlyContextScenarioResponseTimePercentile
from grizzly.listeners import (
    init,
    init_statistics_listener,
    locust_test_start,
    spawning_complete,
    validate_result,
)
from grizzly.testdata.communication import TestdataConsumer, TestdataProducer
from grizzly.types import MessageDirection
from grizzly.types.behave import Scenario, Status
from grizzly.types.locust import Environment, LocalRunner, MasterRunner, Message, WorkerRunner
from locust.runners import STATE_RUNNING, WorkerNode
from locust.stats import RequestStats

if TYPE_CHECKING:  # pragma: no cover
    from collections.abc import Callable

    from _pytest.logging import LogCaptureFixture

    from test_framework.fixtures import GrizzlyFixture, LocustFixture, MockerFixture, NoopZmqFixture


def mocked_testdata_producer___init__(self: TestdataProducer, runner: MasterRunner | LocalRunner, testdata: Any) -> None:  # noqa: ARG001
    self.testdata = testdata


@pytest.fixture
def _listener_test_mocker(mocker: MockerFixture, noop_zmq: NoopZmqFixture) -> None:
    mocker.patch(
        'grizzly.testdata.communication.TestdataProducer.__init__',
        mocked_testdata_producer___init__,
    )

    noop_zmq('locust.rpc.zmqrpc')

    mocker.patch('locust.runners.rpc.Client.__init__', return_value=None)
    mocker.patch('locust.runners.rpc.BaseSocket.send', autospec=True)
    mocker.patch('locust.runners.WorkerRunner.heartbeat', autospec=True)
    mocker.patch('locust.runners.WorkerRunner.worker', autospec=True)
    mocker.patch('locust.runners.WorkerRunner.connect_to_master', autospec=True)
    mocker.patch('locust.runners.MasterRunner.client_listener', autospec=True)


@pytest.mark.usefixtures('_listener_test_mocker')
def test_init_master(caplog: LogCaptureFixture, grizzly_fixture: GrizzlyFixture) -> None:
    try:
        grizzly_fixture()
        grizzly = grizzly_fixture.grizzly
        runner = MasterRunner(grizzly_fixture.behave.locust.environment, '0.0.0.0', 5555)
        grizzly.state.locust = runner

        init_function: Callable[..., None] = init(grizzly, {RefreshTokenDistributor}, {})
        assert callable(init_function)

        assert not grizzly.state.spawning_complete.locked()

        init_function(runner)

        assert grizzly.state.spawning_complete.locked()
        assert grizzly.state.producer is not None
        assert grizzly.state.locust.custom_messages == {
            'produce_token': (RefreshTokenDistributor.handle_request, True),
        }

        grizzly.state.locust.custom_messages.clear()
        grizzly.state.spawning_complete.release()

        with caplog.at_level(logging.ERROR):
            init_function = init(grizzly, set(), None)
            assert callable(init_function)
            init_function(runner)

        assert grizzly.state.spawning_complete.locked()
        assert 'there is no test data' in caplog.text
        grizzly.state.spawning_complete.release()

        grizzly.state.locust.custom_messages.clear()

        def callback(environment: Environment, msg: Message, *_args: Any, **_kwargs: Any) -> None:
            pass

        def callback_ack(environment: Environment, msg: Message, *_args: Any, **_kwargs: Any) -> None:
            pass

        grizzly.setup.locust.messages.register(MessageDirection.CLIENT_SERVER, 'test_message', callback)
        grizzly.setup.locust.messages.register(MessageDirection.SERVER_CLIENT, 'test_message_ack', callback_ack)

        init_function = init(grizzly, {RefreshTokenDistributor}, {})
        init_function(runner)

        assert grizzly.state.spawning_complete.locked()
        assert grizzly.state.locust.custom_messages == cast(
            'dict[str, tuple[Callable, bool]]',
            {
                'test_message': (callback, True),
                'produce_token': (RefreshTokenDistributor.handle_request, True),
            },
        )
        grizzly.state.spawning_complete.release()
    finally:
        if runner is not None:
            runner.quit()
            runner.environment.events.quit.fire(exit_code=0)


@pytest.mark.usefixtures('_listener_test_mocker')
def test_init_worker(grizzly_fixture: GrizzlyFixture) -> None:
    grizzly_fixture()
    runner: WorkerRunner | None = None

    try:
        grizzly = grizzly_fixture.grizzly

        init_function: Callable[..., None] = init(grizzly, {RefreshTokenDistributor})
        assert callable(init_function)

        runner = WorkerRunner(grizzly_fixture.behave.locust.environment, 'localhost', 5555)

        grizzly.state.locust = runner

        assert not grizzly.state.spawning_complete.locked()

        init_function(runner)

        assert grizzly.state.spawning_complete.locked()
        assert environ.get('TESTDATA_PRODUCER_ADDRESS', None) is None
        assert runner.custom_messages == cast(
            'dict[str, tuple[Callable, bool]]',
            {
                'consume_testdata': (TestdataConsumer.handle_response, True),
                'consume_token': (RefreshTokenDistributor.handle_response, True),
            },
        )

        grizzly.state.spawning_complete.release()

        def callback(environment: Environment, msg: Message, *_args: Any, **_kwargs: Any) -> None:
            pass

        def callback_ack(environment: Environment, msg: Message, *_args: Any, **_kwargs: Any) -> None:
            pass

        grizzly.state.locust.custom_messages.clear()

        grizzly.setup.locust.messages.register(MessageDirection.CLIENT_SERVER, 'test_message', callback)
        grizzly.setup.locust.messages.register(MessageDirection.SERVER_CLIENT, 'test_message_ack', callback_ack)

        init_function(runner)

        assert grizzly.state.spawning_complete.locked()
        assert grizzly.state.locust.custom_messages == cast(
            'dict[str, tuple[Callable, bool]]',
            {
                'consume_testdata': (TestdataConsumer.handle_response, True),
                'consume_token': (RefreshTokenDistributor.handle_response, True),
                'test_message_ack': (callback_ack, True),
            },
        )
        grizzly.state.spawning_complete.release()
    finally:
        if runner is not None:
            runner.quit()
            runner.custom_messages.clear()
            runner.environment.events.quit.fire(exit_code=0)


@pytest.mark.usefixtures('_listener_test_mocker')
def test_init_local(grizzly_fixture: GrizzlyFixture) -> None:
    grizzly_fixture()

    grizzly = grizzly_fixture.grizzly

    init_function: Callable[..., None] = init(grizzly, {RefreshTokenDistributor}, {})
    assert callable(init_function)
    assert not grizzly.state.spawning_complete.locked()

    init_function(grizzly.state.locust)

    assert grizzly.state.spawning_complete.locked()
    assert grizzly.state.producer is not None
    assert grizzly.state.locust.custom_messages == {
        'consume_testdata': (TestdataConsumer.handle_response, True),
        'consume_token': (RefreshTokenDistributor.handle_response, True),
        'produce_token': (RefreshTokenDistributor.handle_request, True),
    }

    grizzly.state.spawning_complete.release()
    grizzly.state.locust.custom_messages.clear()

    def callback(environment: Environment, msg: Message, *_args: Any, **_kwargs: Any) -> None:
        pass

    def callback_ack(environment: Environment, msg: Message, *_args: Any, **_kwargs: Any) -> None:
        pass

    grizzly.setup.locust.messages.register(MessageDirection.CLIENT_SERVER, 'test_message', callback)
    grizzly.setup.locust.messages.register(MessageDirection.SERVER_CLIENT, 'test_message_ack', callback_ack)

    init_function(grizzly.state.locust)

    assert grizzly.state.spawning_complete.locked()
    assert grizzly.state.locust.custom_messages == cast(
        'dict[str, tuple[Callable, bool]]',
        {
            'consume_testdata': (TestdataConsumer.handle_response, True),
            'consume_token': (RefreshTokenDistributor.handle_response, True),
            'produce_token': (RefreshTokenDistributor.handle_request, True),
            'test_message': (callback, True),
            'test_message_ack': (callback_ack, True),
        },
    )
    grizzly.state.spawning_complete.release()


def test_init_statistics_listener(mocker: MockerFixture, locust_fixture: LocustFixture) -> None:
    # Influx -- short circuit
    mocker.patch(
        'grizzly.listeners.influxdb.InfluxDbV1.connect',
        return_value=None,
    )

    mocker.patch(
        'grizzly.listeners.influxdb.InfluxDbListener.run_events',
        return_value=None,
    )

    mocker.patch(
        'grizzly.listeners.influxdb.InfluxDbListener.run_user_count',
        return_value=None,
    )

    from grizzly.context import grizzly

    environment = locust_fixture.environment

    environment.events.quitting._handlers = []
    environment.events.spawning_complete._handlers = []

    # not a valid scheme
    try:
        grizzly.setup.statistics_url = 'http://localhost'
        init_statistics_listener(grizzly.setup.statistics_url)(environment)
        assert len(environment.events.request._handlers) == 1
        assert len(environment.events.quitting._handlers) == 0
        assert len(environment.events.quit._handlers) == 0
        assert len(environment.events.spawning_complete._handlers) == 0
    finally:
        environment.events.quit.fire(exit_code=0)

    try:
        grizzly.setup.statistics_url = 'influxdb://test/database?Testplan=test'
        init_statistics_listener(grizzly.setup.statistics_url)(environment)
        assert len(environment.events.request._handlers) == 2
        assert len(environment.events.quitting._handlers) == 0
        assert len(environment.events.quit._handlers) == 1
        assert len(environment.events.spawning_complete._handlers) == 0
    finally:
        environment.events.quit.fire(exit_code=0)

    mocker.patch(
        'grizzly.listeners.influxdb.InfluxDbV2.connect',
        return_value=None,
    )

    try:
        grizzly.setup.statistics_url = 'influxdb2://token@influxhost/org:bucket?Testplan=test'
        init_statistics_listener(grizzly.setup.statistics_url)(environment)
        assert len(environment.events.request._handlers) == 3
        assert len(environment.events.quitting._handlers) == 0
        assert len(environment.events.quit._handlers) == 2
        assert len(environment.events.spawning_complete._handlers) == 0
    finally:
        environment.events.quit.fire(exit_code=0)


@pytest.mark.usefixtures('_listener_test_mocker')
def test_locust_test_start(grizzly_fixture: GrizzlyFixture, caplog: LogCaptureFixture) -> None:
    grizzly_fixture()

    grizzly = grizzly_fixture.grizzly
    grizzly.scenario.iterations = 2
    runner = MasterRunner(grizzly_fixture.behave.locust.environment, '0.0.0.0', 5555)
    runner.clients._worker_nodes.update(
        {
            'worker-1': WorkerNode('worker-1', STATE_RUNNING),
            'worker-2': WorkerNode('worker-2', STATE_RUNNING),
        },
    )
    grizzly.state.locust = runner
    grizzly.state.locust.environment.runner = runner

    with caplog.at_level(logging.ERROR):
        locust_test_start()(grizzly.state.locust.environment)

    assert caplog.messages == []


def test_spawning_complete(grizzly_fixture: GrizzlyFixture) -> None:
    grizzly = grizzly_fixture.grizzly

    grizzly.state.spawning_complete.acquire()
    assert grizzly.state.spawning_complete.locked()

    func: Callable[[int], None] = spawning_complete(grizzly)

    func(10)

    assert not grizzly.state.spawning_complete.locked()


@pytest.mark.usefixtures('_listener_test_mocker')
def test_validate_result(mocker: MockerFixture, caplog: LogCaptureFixture, grizzly_fixture: GrizzlyFixture) -> None:  # noqa: PLR0915
    grizzly_fixture()

    mocker.patch(
        'locust.stats.print_error_report',
        return_value=None,
    )

    mocker.patch(
        'locust.stats.print_percentile_stats',
        return_value=None,
    )

    mocker.patch(
        'locust.stats.print_stats',
        return_value=None,
    )

    grizzly = grizzly_fixture.grizzly
    grizzly.scenarios.clear()

    environment = grizzly.state.locust.environment

    environment.stats = RequestStats()
    for method, name in [
        ('POST', '001 OAuth2 client token'),
        ('POST', '001 Register'),
        ('GET', '001 Read'),
    ]:
        for i in range(100):
            environment.stats.log_request(method, name, choice(range(10, 57)), len(name))
            if i % 5 == 0:
                environment.stats.log_error(method, name, RuntimeError('Error'))

    environment.stats.total.total_response_time = 2000

    validate_result_wrapper: Callable[..., None] = validate_result(grizzly)
    assert callable(validate_result_wrapper)

    # environment has statistics, but can't find a matching scenario
    with caplog.at_level(logging.ERROR):
        validate_result_wrapper(environment)
    assert len(caplog.messages) == 3
    assert 'does not match any scenario' in caplog.text
    caplog.clear()

    # scenario name must match with the name that the pickled stats object was dumped from
    scenario = Scenario(None, None, '', 'do some posts')
    grizzly.scenarios.create(scenario)

    # fail ratio
    environment.process_exit_code = 0
    grizzly.scenario.validation.fail_ratio = 0.1

    assert environment.process_exit_code == 0
    assert grizzly.scenario.behave.status == Status.passed

    with caplog.at_level(logging.ERROR):
        validate_result_wrapper(environment)

    assert 'failed due to' in caplog.text
    assert environment.process_exit_code == 1
    assert grizzly.scenario.behave.status == Status.failed

    grizzly.scenario.validation.fail_ratio = None
    grizzly.scenario.behave.set_status(Status.passed)
    caplog.clear()

    # avg response time
    environment.process_exit_code = 0
    grizzly.scenario.validation.avg_response_time = 2

    assert environment.process_exit_code == 0
    assert grizzly.scenario.behave.status == Status.passed

    with caplog.at_level(logging.ERROR):
        validate_result_wrapper(environment)

    assert 'failed due to' in caplog.text
    assert environment.process_exit_code == 1
    assert grizzly.scenario.behave.status == Status.failed

    grizzly.scenario.validation.avg_response_time = None
    grizzly.scenario.behave.set_status(Status.passed)
    caplog.clear()

    # response time percentile
    environment.process_exit_code = 0
    grizzly.scenario.validation.response_time_percentile = GrizzlyContextScenarioResponseTimePercentile(2, 0.99)

    assert environment.process_exit_code == 0
    assert grizzly.scenario.behave.status == Status.passed

    with caplog.at_level(logging.ERROR):
        validate_result_wrapper(environment)

    assert 'failed due to' in caplog.text
    assert environment.process_exit_code == 1
    assert grizzly.scenario.behave.status == Status.failed

    grizzly.scenario.validation.response_time_percentile = None
    grizzly.scenario.behave.set_status(Status.passed)
