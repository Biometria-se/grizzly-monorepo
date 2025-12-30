import { expect } from 'chai';
import sinon from 'sinon';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { getNextReleaseTag, cleanup } from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('getNextReleaseTag', () => {
  const frameworkPath = resolve(__dirname, '../../../../framework');
  let execStub;

  // Create stub logger to suppress output during tests
  const mockLogger = {
    info: sinon.stub(),
    warning: sinon.stub(),
    error: sinon.stub(),
    debug: sinon.stub()
  };

  beforeEach(() => {
    // Create exec stub to suppress command output during tests
    execStub = {
      exec: sinon.stub().callsFake(async (command, args, options) => {
        // Simulate git tag command output
        if (command === 'git' && args[0] === 'tag') {
          if (options?.listeners?.stdout) {
            options.listeners.stdout(Buffer.from('framework@v3.2.5\n'));
          }
          return 0;
        }
        return 0;
      })
    };
  });

  afterEach(() => {
    // Reset all stubs after each test
    sinon.reset();
  });

  describe('version bumping', () => {
    it('should calculate next patch version', async () => {
      const result = await getNextReleaseTag(frameworkPath, 'patch', mockLogger, execStub);

      expect(result).to.have.property('nextVersion');
      expect(result).to.have.property('nextTag');
      expect(result.nextVersion).to.match(/^\d+\.\d+\.\d+$/);
      expect(result.nextTag).to.include(result.nextVersion);
    });

    it('should calculate next minor version', async () => {
      const result = await getNextReleaseTag(frameworkPath, 'minor', mockLogger, execStub);

      expect(result).to.have.property('nextVersion');
      expect(result).to.have.property('nextTag');
      expect(result.nextVersion).to.match(/^\d+\.\d+\.0$/);
      expect(result.nextTag).to.include(result.nextVersion);
    });

    it('should calculate next major version', async () => {
      const result = await getNextReleaseTag(frameworkPath, 'major', mockLogger, execStub);

      expect(result).to.have.property('nextVersion');
      expect(result).to.have.property('nextTag');
      expect(result.nextVersion).to.match(/^\d+\.0\.0$/);
      expect(result.nextTag).to.include(result.nextVersion);
    });

    it('should increment version correctly for patch', async () => {
      const result = await getNextReleaseTag(frameworkPath, 'patch', mockLogger, execStub);
      const [major, minor, patch] = result.nextVersion.split('.').map(Number);

      expect(patch).to.be.greaterThan(0);
    });

    it('should reset patch to 0 for minor bump', async () => {
      const result = await getNextReleaseTag(frameworkPath, 'minor', mockLogger, execStub);
      const [major, minor, patch] = result.nextVersion.split('.').map(Number);

      expect(patch).to.equal(0);
      expect(minor).to.be.greaterThan(0);
    });

    it('should reset minor and patch to 0 for major bump', async () => {
      const result = await getNextReleaseTag(frameworkPath, 'major', mockLogger, execStub);
      const [major, minor, patch] = result.nextVersion.split('.').map(Number);

      expect(minor).to.equal(0);
      expect(patch).to.equal(0);
      expect(major).to.be.greaterThan(0);
    });
  });

  describe('tag format', () => {
    it('should include project prefix in tag', async () => {
      const result = await getNextReleaseTag(frameworkPath, 'patch', mockLogger, execStub);

      expect(result.nextTag).to.match(/^framework@v\d+\.\d+\.\d+$/);
    });
  });

  describe('error handling', () => {
    it('should throw error for non-existent path', async () => {
      try {
        await getNextReleaseTag('/non/existent/path', 'patch', mockLogger, execStub);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.exist;
      }
    });
  });
});

describe('cleanup', () => {
  let coreStub;
  let execStub;
  let octokitStub;
  let githubStub;

  beforeEach(() => {
    // Setup core stub
    coreStub = {
      getState: sinon.stub(),
      info: sinon.stub(),
      warning: sinon.stub(),
      error: sinon.stub(),
      setFailed: sinon.stub(),
    };

    // Setup exec stub
    execStub = {
      exec: sinon.stub().resolves(),
    };

    // Setup octokit mock
    octokitStub = {
      rest: {
        actions: {
          listJobsForWorkflowRun: sinon.stub(),
        },
      },
    };

    // Setup github stub
    githubStub = {
      getOctokit: sinon.stub().returns(octokitStub),
    };
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('job status checking', () => {
    it('should push tag when job succeeded and not dry-run', async () => {
      coreStub.getState.withArgs('next-release-tag').returns('framework@v1.2.3');
      coreStub.getState.withArgs('dry-run').returns('false');
      coreStub.getState.withArgs('github-token').returns('test-token');

      octokitStub.rest.actions.listJobsForWorkflowRun.resolves({
        data: {
          jobs: [
            {
              id: 12345,
              name: 'test-job',
              status: 'completed',
              conclusion: 'success',
            },
          ],
        },
      });

      const env = {
        GITHUB_TOKEN: 'test-token',
        GITHUB_RUN_ID: '12345',
        GITHUB_REPOSITORY: 'owner/repo',
        GITHUB_JOB: '12345',
      };

      await cleanup({
        core: coreStub,
        exec: execStub,
        github: githubStub,
        env,
      });

      expect(execStub.exec.calledWith('git', ['push', 'origin', 'framework@v1.2.3'])).to.be.true;
      expect(execStub.exec.calledWith('git', ['tag', '-d', 'framework@v1.2.3'])).to.be.false;
    });

    it('should push tag when job is in_progress and not dry-run', async () => {
      coreStub.getState.withArgs('next-release-tag').returns('framework@v1.2.3');
      coreStub.getState.withArgs('dry-run').returns('false');
      coreStub.getState.withArgs('github-token').returns('test-token');

      octokitStub.rest.actions.listJobsForWorkflowRun.resolves({
        data: {
          jobs: [
            {
              id: 12345,
              name: 'test-job',
              status: 'in_progress',
              conclusion: null,
            },
          ],
        },
      });

      const env = {
        GITHUB_TOKEN: 'test-token',
        GITHUB_RUN_ID: '12345',
        GITHUB_REPOSITORY: 'owner/repo',
        GITHUB_JOB: '12345',
      };

      await cleanup({
        core: coreStub,
        exec: execStub,
        github: githubStub,
        env,
      });

      expect(execStub.exec.calledWith('git', ['push', 'origin', 'framework@v1.2.3'])).to.be.true;
      expect(execStub.exec.calledWith('git', ['tag', '-d', 'framework@v1.2.3'])).to.be.false;
    });

    it('should delete tag when job failed', async () => {
      coreStub.getState.withArgs('next-release-tag').returns('framework@v1.2.3');
      coreStub.getState.withArgs('dry-run').returns('false');
      coreStub.getState.withArgs('github-token').returns('test-token');

      octokitStub.rest.actions.listJobsForWorkflowRun.resolves({
        data: {
          jobs: [
            {
              id: 12345,
              name: 'test-job',
              status: 'completed',
              conclusion: 'failure',
            },
          ],
        },
      });

      const env = {
        GITHUB_TOKEN: 'test-token',
        GITHUB_RUN_ID: '12345',
        GITHUB_REPOSITORY: 'owner/repo',
        GITHUB_JOB: '12345',
      };

      await cleanup({
        core: coreStub,
        exec: execStub,
        github: githubStub,
        env,
      });

      expect(execStub.exec.calledWith('git', ['push', 'origin', 'framework@v1.2.3'])).to.be.false;
      expect(execStub.exec.calledWith('git', ['tag', '-d', 'framework@v1.2.3'], { ignoreReturnCode: true })).to.be.true;
    });

    it('should delete tag when job was cancelled', async () => {
      coreStub.getState.withArgs('next-release-tag').returns('framework@v1.2.3');
      coreStub.getState.withArgs('dry-run').returns('false');
      coreStub.getState.withArgs('github-token').returns('test-token');

      octokitStub.rest.actions.listJobsForWorkflowRun.resolves({
        data: {
          jobs: [
            {
              id: 12345,
              name: 'test-job',
              status: 'completed',
              conclusion: 'cancelled',
            },
          ],
        },
      });

      const env = {
        GITHUB_TOKEN: 'test-token',
        GITHUB_RUN_ID: '12345',
        GITHUB_REPOSITORY: 'owner/repo',
        GITHUB_JOB: '12345',
      };

      await cleanup({
        core: coreStub,
        exec: execStub,
        github: githubStub,
        env,
      });

      expect(execStub.exec.calledWith('git', ['push', 'origin', 'framework@v1.2.3'])).to.be.false;
      expect(execStub.exec.calledWith('git', ['tag', '-d', 'framework@v1.2.3'], { ignoreReturnCode: true })).to.be.true;
    });

    it('should delete tag in dry-run mode even if job succeeded', async () => {
      coreStub.getState.withArgs('next-release-tag').returns('framework@v1.2.3');
      coreStub.getState.withArgs('dry-run').returns('true');
      coreStub.getState.withArgs('github-token').returns('test-token');

      octokitStub.rest.actions.listJobsForWorkflowRun.resolves({
        data: {
          jobs: [
            {
              id: 12345,
              name: 'test-job',
              status: 'completed',
              conclusion: 'success',
            },
          ],
        },
      });

      const env = {
        GITHUB_TOKEN: 'test-token',
        GITHUB_RUN_ID: '12345',
        GITHUB_REPOSITORY: 'owner/repo',
        GITHUB_JOB: '12345',
      };

      await cleanup({
        core: coreStub,
        exec: execStub,
        github: githubStub,
        env,
      });

      expect(execStub.exec.calledWith('git', ['push', 'origin', 'framework@v1.2.3'])).to.be.false;
      expect(execStub.exec.calledWith('git', ['tag', '-d', 'framework@v1.2.3'], { ignoreReturnCode: true })).to.be.true;
    });

    it('should check job status even in dry-run mode', async () => {
      coreStub.getState.withArgs('next-release-tag').returns('framework@v1.2.3');
      coreStub.getState.withArgs('dry-run').returns('true');
      coreStub.getState.withArgs('github-token').returns('test-token');

      octokitStub.rest.actions.listJobsForWorkflowRun.resolves({
        data: {
          jobs: [
            {
              id: 12345,
              name: 'test-job',
              status: 'completed',
              conclusion: 'success',
            },
          ],
        },
      });

      const env = {
        GITHUB_TOKEN: 'test-token',
        GITHUB_RUN_ID: '12345',
        GITHUB_REPOSITORY: 'owner/repo',
        GITHUB_JOB: '12345',
      };

      await cleanup({
        core: coreStub,
        exec: execStub,
        github: githubStub,
        env,
      });

      expect(octokitStub.rest.actions.listJobsForWorkflowRun.calledOnce).to.be.true;
      expect(octokitStub.rest.actions.listJobsForWorkflowRun.calledWith({
        owner: 'owner',
        repo: 'repo',
        run_id: 12345,
      })).to.be.true;
    });

    it('should parse GITHUB_REPOSITORY correctly', async () => {
      coreStub.getState.withArgs('next-release-tag').returns('framework@v1.2.3');
      coreStub.getState.withArgs('dry-run').returns('false');
      coreStub.getState.withArgs('github-token').returns('test-token');

      octokitStub.rest.actions.listJobsForWorkflowRun.resolves({
        data: {
          jobs: [
            {
              id: 99999,
              name: 'test-job',
              status: 'completed',
              conclusion: 'success',
            },
          ],
        },
      });

      const env = {
        GITHUB_TOKEN: 'test-token',
        GITHUB_RUN_ID: '99999',
        GITHUB_REPOSITORY: 'my-org/my-repo',
        GITHUB_JOB: '99999',
      };

      await cleanup({
        core: coreStub,
        exec: execStub,
        github: githubStub,
        env,
      });

      expect(octokitStub.rest.actions.listJobsForWorkflowRun.calledWith({
        owner: 'my-org',
        repo: 'my-repo',
        run_id: 99999,
      })).to.be.true;
    });
  });

  describe('error handling', () => {
    it('should fail when next-release-tag is missing', async () => {
      coreStub.getState.withArgs('next-release-tag').returns('');
      coreStub.getState.withArgs('dry-run').returns('false');
      coreStub.getState.withArgs('github-token').returns('test-token');

      const env = {
        GITHUB_TOKEN: 'test-token',
        GITHUB_RUN_ID: '12345',
        GITHUB_REPOSITORY: 'owner/repo',
        GITHUB_JOB: 'test-job',
      };

      await cleanup({
        core: coreStub,
        exec: execStub,
        github: githubStub,
        env,
      });

      expect(coreStub.setFailed.called).to.be.true;
      expect(coreStub.setFailed.firstCall.args[0]).to.include('No next-release-tag found');
    });

    it('should fail when github-token is missing from state', async () => {
      coreStub.getState.withArgs('next-release-tag').returns('framework@v1.2.3');
      coreStub.getState.withArgs('dry-run').returns('false');
      coreStub.getState.withArgs('github-token').returns(''); // Empty token from state

      const env = {
        GITHUB_RUN_ID: '12345',
        GITHUB_REPOSITORY: 'owner/repo',
        GITHUB_JOB: 'test-job',
      };

      await cleanup({
        core: coreStub,
        exec: execStub,
        github: githubStub,
        env,
      });

      expect(coreStub.setFailed.called).to.be.true;
      expect(coreStub.setFailed.firstCall.args[0]).to.include('Missing required environment variables');
    });

    it('should fail when GITHUB_RUN_ID is missing', async () => {
      coreStub.getState.withArgs('next-release-tag').returns('framework@v1.2.3');
      coreStub.getState.withArgs('dry-run').returns('false');
      coreStub.getState.withArgs('github-token').returns('test-token');

      const env = {
        GITHUB_TOKEN: 'test-token',
        GITHUB_REPOSITORY: 'owner/repo',
        GITHUB_JOB: 'test-job',
      };

      await cleanup({
        core: coreStub,
        exec: execStub,
        github: githubStub,
        env,
      });

      expect(coreStub.setFailed.called).to.be.true;
      expect(coreStub.setFailed.firstCall.args[0]).to.include('Missing required environment variables');
    });

    it('should fail when GITHUB_REPOSITORY is missing', async () => {
      coreStub.getState.withArgs('next-release-tag').returns('framework@v1.2.3');
      coreStub.getState.withArgs('dry-run').returns('false');
      coreStub.getState.withArgs('github-token').returns('test-token');

      const env = {
        GITHUB_TOKEN: 'test-token',
        GITHUB_RUN_ID: '12345',
        GITHUB_JOB: 'test-job',
      };

      await cleanup({
        core: coreStub,
        exec: execStub,
        github: githubStub,
        env,
      });

      expect(coreStub.setFailed.called).to.be.true;
      expect(coreStub.setFailed.firstCall.args[0]).to.include('Missing required environment variables');
    });

    it('should fail when job ID is not found', async () => {
      coreStub.getState.withArgs('next-release-tag').returns('framework@v1.2.3');
      coreStub.getState.withArgs('dry-run').returns('false');
      coreStub.getState.withArgs('github-token').returns('test-token');

      octokitStub.rest.actions.listJobsForWorkflowRun.resolves({
        data: {
          jobs: [
            {
              id: 99999,
              name: 'other-job',
              status: 'completed',
              conclusion: 'success',
            },
          ],
        },
      });

      const env = {
        GITHUB_TOKEN: 'test-token',
        GITHUB_RUN_ID: '12345',
        GITHUB_REPOSITORY: 'owner/repo',
        GITHUB_JOB: '12345',
      };

      await cleanup({
        core: coreStub,
        exec: execStub,
        github: githubStub,
        env,
      });

      expect(coreStub.setFailed.called).to.be.true;
      expect(coreStub.setFailed.firstCall.args[0]).to.include('Could not find current job');
    });

    it('should log all jobs for debugging', async () => {
      coreStub.getState.withArgs('next-release-tag').returns('framework@v1.2.3');
      coreStub.getState.withArgs('dry-run').returns('false');
      coreStub.getState.withArgs('github-token').returns('test-token');

      octokitStub.rest.actions.listJobsForWorkflowRun.resolves({
        data: {
          jobs: [
            {
              id: 123,
              name: 'job1',
              status: 'completed',
              conclusion: 'success',
            },
            {
              id: 456,
              name: 'job2',
              status: 'in_progress',
              conclusion: null,
            },
          ],
        },
      });

      const env = {
        GITHUB_TOKEN: 'test-token',
        GITHUB_RUN_ID: '12345',
        GITHUB_REPOSITORY: 'owner/repo',
        GITHUB_JOB: '456',
      };

      await cleanup({
        core: coreStub,
        exec: execStub,
        github: githubStub,
        env,
      });

      expect(coreStub.info.calledWith('Found 2 jobs in workflow run')).to.be.true;
      expect(coreStub.info.calledWith('  Job: name="job1", id=123, status=completed, conclusion=success')).to.be.true;
      expect(coreStub.info.calledWith('  Job: name="job2", id=456, status=in_progress, conclusion=none')).to.be.true;
      expect(coreStub.info.calledWith('Looking for job with id: 456')).to.be.true;
    });

    it('should fail when github api call fails', async () => {
      coreStub.getState.withArgs('next-release-tag').returns('framework@v1.2.3');
      coreStub.getState.withArgs('dry-run').returns('false');
      coreStub.getState.withArgs('github-token').returns('test-token');

      octokitStub.rest.actions.listJobsForWorkflowRun.rejects(new Error('API error'));

      const env = {
        GITHUB_TOKEN: 'test-token',
        GITHUB_RUN_ID: '12345',
        GITHUB_REPOSITORY: 'owner/repo',
        GITHUB_JOB: 'test-job',
      };

      await cleanup({
        core: coreStub,
        exec: execStub,
        github: githubStub,
        env,
      });

      expect(coreStub.setFailed.called).to.be.true;
      expect(coreStub.setFailed.firstCall.args[0]).to.include('API error');
    });
  });

  describe('logging', () => {
    it('should log job status information', async () => {
      coreStub.getState.withArgs('next-release-tag').returns('framework@v1.2.3');
      coreStub.getState.withArgs('dry-run').returns('false');
      coreStub.getState.withArgs('github-token').returns('test-token');

      octokitStub.rest.actions.listJobsForWorkflowRun.resolves({
        data: {
          jobs: [
            {
              id: 12345,
              name: 'test-job',
              status: 'completed',
              conclusion: 'success',
            },
          ],
        },
      });

      const env = {
        GITHUB_TOKEN: 'test-token',
        GITHUB_RUN_ID: '12345',
        GITHUB_REPOSITORY: 'owner/repo',
        GITHUB_JOB: '12345',
      };

      await cleanup({
        core: coreStub,
        exec: execStub,
        github: githubStub,
        env,
      });

      expect(coreStub.info.calledWith('Running post-job cleanup...')).to.be.true;
      expect(coreStub.info.calledWith('Checking job status for run 12345...')).to.be.true;
      expect(coreStub.info.calledWith('Job status: completed, conclusion: success')).to.be.true;
      expect(coreStub.info.calledWith('Pushing tag framework@v1.2.3 to remote')).to.be.true;
    });

    it('should log error when job fails', async () => {
      coreStub.getState.withArgs('next-release-tag').returns('framework@v1.2.3');
      coreStub.getState.withArgs('dry-run').returns('false');
      coreStub.getState.withArgs('github-token').returns('test-token');

      octokitStub.rest.actions.listJobsForWorkflowRun.resolves({
        data: {
          jobs: [
            {
              id: 12345,
              name: 'test-job',
              status: 'completed',
              conclusion: 'failure',
            },
          ],
        },
      });

      const env = {
        GITHUB_TOKEN: 'test-token',
        GITHUB_RUN_ID: '12345',
        GITHUB_REPOSITORY: 'owner/repo',
        GITHUB_JOB: '12345',
      };

      await cleanup({
        core: coreStub,
        exec: execStub,
        github: githubStub,
        env,
      });

      expect(coreStub.error.calledWith('Job completed with conclusion: failure')).to.be.true;
      expect(coreStub.info.calledWith('Deleting tag framework@v1.2.3 (job failed or was cancelled)')).to.be.true;
    });

    it('should log dry-run reason when deleting tag', async () => {
      coreStub.getState.withArgs('next-release-tag').returns('framework@v1.2.3');
      coreStub.getState.withArgs('dry-run').returns('true');
      coreStub.getState.withArgs('github-token').returns('test-token');

      octokitStub.rest.actions.listJobsForWorkflowRun.resolves({
        data: {
          jobs: [
            {
              id: 12345,
              name: 'test-job',
              status: 'completed',
              conclusion: 'success',
            },
          ],
        },
      });

      const env = {
        GITHUB_TOKEN: 'test-token',
        GITHUB_RUN_ID: '12345',
        GITHUB_REPOSITORY: 'owner/repo',
        GITHUB_JOB: '12345',
      };

      await cleanup({
        core: coreStub,
        exec: execStub,
        github: githubStub,
        env,
      });

      expect(coreStub.info.calledWith('Deleting tag framework@v1.2.3 (dry-run mode)')).to.be.true;
    });
  });
});
