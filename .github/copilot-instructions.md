# grizzly-monorepo

this is a monorepo for all grizzly related projects, in the form of a [uv workspace](https://docs.astral.sh/uv/concepts/projects/workspaces/)
the language is python, the package manager is [uv](https://docs.astral.sh/uv/) and the build system is [hatchling](https://hatch.pypa.io/latest/).

linting and formatting is done with [ruff](https://docs.astral.sh/ruff/).

**Grizzly is a framework to be able to easily define load scenarios, and is primarily built on-top of two other frameworks.**

> [Locust](https://locust.io): Define user behaviour with Python code, and swarm your system with millions of simultaneous users.

> [Behave](https://behave.readthedocs.io/): Uses tests written in a natural language style, backed up by Python code.

**`behave` is <del>ab</del>used for being able to define `locust` load test scenarios using [gherkin](https://cucumber.io/docs/gherkin). A feature can contain more than one scenario and all scenarios will run in parallell. This makes it possible to implement load test scenarios without knowing python or how to use `locust`.**

the repository is hosted on [github](https://github.com).

all code should be pythonic and follow [PEP-8](https://peps.python.org/pep-0008/) as much as possible.

all code must be covered with unit tests, using [pytest](https://docs.pytest.org/en/latest/), and when possible also have end-to-end tests to validate the full functionality.

builds should be reproducible, meaning that the same source code should always produce the same build output, this is accomplished by using `uv` with a `lock` file, and `--locked` when syncing
dependencies.

## packages

### [grizzly-loadtester-common](../common) - common code shared between the other packages

this package contains code that is shared between the other packages, like custom exceptions, constants and utility functions.
there should not be any duplicated code in the other packages, if so it should be moved to this package.

### [grizzly-loadtester](../framework) - the core framework

this package contains the corner stones of the grizzly framework, like the custom locust messages, the test data producer/consumer and the gherkin parser.
load users that tests different protocols or services.

### [grizzly-loadtester-cli](../command-line-interface) - command line interface

this package contains the command line interface for grizzly, that is used to run the load tests. it is used to start grizzly, either in local mode or in distributed mode with a master and multiple workers.

it also contains utilities such as Azure Keyvault integration (store sensitiv environment variables in a secure way), a TOTP generator, and a utility to generate the project structure of a new grizzly project.

### [grizzly-loadtester-ls](../editor-support) - language server for editor support, using the [LSP protocol](https://microsoft.github.io/language-server-protocol/)

this is the language server with all the logic of validating feature files, step definitions and providing auto-completion. it is built using [pygls](https://github.com/openlawlibrary/pygls).
for common problems there should be a quick fix available.

in theory, the language server should work with any feature files that is using behave, but the main focus is to support grizzly features.

#### [vscode extension](../editor-support/clients/vscode) - visual studio code extension

this is the visual studio code extension that provides the integration with the language server. in general is does not contain any logic, only integrations towards [grizzly-loadtester-ls](../editor-support) features.

### [grizzly-docs](../docs) - documentation

the mkdocs based documentation for grizzly, hosted on [github pages](https://biometria-se.github.io/grizzly/). parts are static, and parts are dynamic generated from the code base with [mkdocstrings](https://mkdocstrings.github.io/).

a custom plugin is used to generate the API reference for the packages and where to insert them in the navigation, and a custom theme is used to provide a better user experience.
