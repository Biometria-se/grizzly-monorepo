import * as core from '@actions/core';
import * as exec from '@actions/exec';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import * as semver from 'semver';
import { parse as parseToml } from '@iarna/toml';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Get the next release tag based on project configuration
 * @param {string} projectPath - Path to the project directory
 * @param {string} bump - Version bump type (major, minor, patch)
 * @param {object} logger - Logger object with info, warning, error methods (defaults to core)
 * @returns {Promise<{nextVersion: string, nextTag: string}>}
 */
async function getNextReleaseTag(projectPath, bump, logger = core) {
  let tagPattern;

  // Check for pyproject.toml first
  const pyprojectPath = join(projectPath, 'pyproject.toml');
  if (existsSync(pyprojectPath)) {
    const pyprojectContent = readFileSync(pyprojectPath, 'utf8');
    const pyproject = parseToml(pyprojectContent);

    const describeCommand = pyproject?.tool?.hatch?.version?.['raw-options']?.scm?.git?.describe_command;
    if (!describeCommand) {
      throw new Error('no git.scm.describe_command found in pyproject.toml');
    }

    const regex = /git.*--match ['"]([^'"]+)['"]/;
    const match = describeCommand.match(regex);

    if (!match) {
      throw new Error('no tag pattern found in git.scm.describe_command');
    }

    tagPattern = match[1];
  } else {
    // Check for package.json
    const packageJsonPath = join(projectPath, 'package.json');
    if (!existsSync(packageJsonPath)) {
      throw new Error('no recognized project file found in the specified directory');
    }

    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    tagPattern = packageJson.version;

    if (!tagPattern) {
      throw new Error('no version found in package.json');
    }

    tagPattern = tagPattern.replace('v0.0.0', 'v*[0-9]*');
  }

  logger.info(`Tag pattern: ${tagPattern}`);

  // Get existing tags
  let stdout = '';
  await exec.exec('git', [
    'tag',
    '-l',
    tagPattern,
    '--sort=-version:refname',
    '--format=%(refname:lstrip=2)'
  ], {
    listeners: {
      stdout: (data) => {
        stdout += data.toString();
      }
    }
  });

  const tags = stdout.trim().split('\n').filter(t => t);
  const previousTag = tags.length > 0 ? tags[0] : tagPattern.replace('v*[0-9]*', 'v0.0.1');

  logger.info(`Previous tag    : ${previousTag}`);

  // Split tag into prefix and version
  const [tagPrefix, previousTagVersion] = previousTag.split('@');
  const previousVersion = previousTagVersion.replace(/^v/, '');

  logger.info(`Tag prefix      : ${tagPrefix}`);
  logger.info(`Previous version: ${previousVersion}`);

  // Parse and bump version
  const currentVersion = semver.parse(previousVersion);
  if (!currentVersion) {
    throw new Error(`Invalid semver version: ${previousVersion}`);
  }

  const nextVersion = semver.inc(currentVersion, bump);
  if (!nextVersion) {
    throw new Error(`Invalid bump type: ${bump}`);
  }

  const nextTag = `${tagPrefix}@v${nextVersion}`;

  logger.info(`Next version    : ${nextVersion}`);
  logger.info(`Next tag        : ${nextTag}`);

  return { nextVersion, nextTag };
}

async function run() {
  try {
    const project = core.getInput('project', { required: true });
    const versionBump = core.getInput('version-bump', { required: true });
    const dryRun = core.getInput('dry-run') === 'true';

    core.info(`Starting release with version bump: ${versionBump}`);
    core.info(`Dry run mode: ${dryRun}`);

    // Get next release version and tag
    const { nextVersion, nextTag } = await getNextReleaseTag(project, versionBump);

    // Set outputs
    core.setOutput('next-release-version', nextVersion);
    core.setOutput('next-release-tag', nextTag);

    // Save state for post-job cleanup
    core.saveState('next-release-tag', nextTag);
    core.saveState('dry-run', dryRun.toString());

    // Configure git
    await exec.exec('git', ['config', 'user.name', process.env.GITHUB_ACTOR]);
    await exec.exec('git', ['config', 'user.email', `${process.env.GITHUB_ACTOR}@users.noreply.github.com`]);

    // Create tag
    await exec.exec('git', ['tag', '-a', nextTag, '-m', `Automatic release ${nextVersion}`]);

    core.info('Release setup completed successfully');
  } catch (error) {
    core.setFailed(error.message);
  }
}

async function cleanup() {
  try {
    const nextTag = core.getState('next-release-tag');
    const dryRun = core.getState('dry-run') === 'true';

    if (nextTag) {
      core.info('Running post-job cleanup...');

      if (dryRun) {
        // Dry run: delete the tag
        core.info(`deleting temporary tag ${nextTag}`);
        await exec.exec('git', ['tag', '-d', nextTag], {
          ignoreReturnCode: true
        });
      } else {
        // Production: push the tag
        core.info(`Pushing tag ${nextTag} to remote`);
        await exec.exec('git', ['push', 'origin', nextTag]);
      }

      core.info('Cleanup completed');
    } else {
        throw new Error('no next-release-tag found in state for cleanup');
    }
  } catch (error) {
    core.warning(`Cleanup failed: ${error.message}`);
  }
}

// CLI mode for testing
// Check if this file is being run directly (not imported as a module)
const isCliMode = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isCliMode) {
  const args = process.argv.slice(2);

  if (args.length < 2 || args[0] === '--help' || args[0] === '-h') {
    console.log('Usage: node index.js <project-path> <bump-type>');
    console.log('');
    console.log('Arguments:');
    console.log('  project-path   Path to the project directory');
    console.log('  bump-type      Version bump type (major, minor, patch)');
    console.log('');
    console.log('Example:');
    console.log('  node index.js ./framework patch');
    process.exit(args.length < 2 ? 1 : 0);
  }

  const [projectPath, bumpType] = args;

  // Create a simple logger for CLI mode
  const cliLogger = {
    info: (msg) => console.log(`[INFO] ${msg}`),
    warning: (msg) => console.warn(`[WARN] ${msg}`),
    error: (msg) => console.error(`[ERROR] ${msg}`)
  };

  // Call getNextReleaseTag with CLI logger
  getNextReleaseTag(projectPath, bumpType, cliLogger)
    .then(({ nextVersion, nextTag }) => {
      console.log('');
      console.log('Results:');
      console.log(`  Next Version: ${nextVersion}`);
      console.log(`  Next Tag    : ${nextTag}`);
      process.exit(0);
    })
    .catch((error) => {
      console.error('');
      console.error(`Error: ${error.message}`);
      process.exit(1);
    });
} else {
  // GitHub Actions mode
  // Check if we're in post-job cleanup phase
  if (core.getState('isPost') === 'true') {
    cleanup();
  } else {
    core.saveState('isPost', 'true');
    run();
  }
}
