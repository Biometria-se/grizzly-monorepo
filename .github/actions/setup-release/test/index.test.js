import { expect } from 'chai';
import sinon from 'sinon';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { getNextReleaseTag } from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('getNextReleaseTag', () => {
  const frameworkPath = resolve(__dirname, '../../../../framework');

  // Create stub logger to suppress output during tests
  const mockLogger = {
    info: sinon.stub(),
    warning: sinon.stub(),
    error: sinon.stub(),
    debug: sinon.stub()
  };

  afterEach(() => {
    // Reset all logger stubs after each test
    sinon.reset();
  });

  describe('version bumping', () => {
    it('should calculate next patch version', async () => {
      const result = await getNextReleaseTag(frameworkPath, 'patch', mockLogger);

      expect(result).to.have.property('nextVersion');
      expect(result).to.have.property('nextTag');
      expect(result.nextVersion).to.match(/^\d+\.\d+\.\d+$/);
      expect(result.nextTag).to.include(result.nextVersion);
    });

    it('should calculate next minor version', async () => {
      const result = await getNextReleaseTag(frameworkPath, 'minor', mockLogger);

      expect(result).to.have.property('nextVersion');
      expect(result).to.have.property('nextTag');
      expect(result.nextVersion).to.match(/^\d+\.\d+\.0$/);
      expect(result.nextTag).to.include(result.nextVersion);
    });

    it('should calculate next major version', async () => {
      const result = await getNextReleaseTag(frameworkPath, 'major', mockLogger);

      expect(result).to.have.property('nextVersion');
      expect(result).to.have.property('nextTag');
      expect(result.nextVersion).to.match(/^\d+\.0\.0$/);
      expect(result.nextTag).to.include(result.nextVersion);
    });

    it('should increment version correctly for patch', async () => {
      const result = await getNextReleaseTag(frameworkPath, 'patch', mockLogger);
      const [major, minor, patch] = result.nextVersion.split('.').map(Number);

      expect(patch).to.be.greaterThan(0);
    });

    it('should reset patch to 0 for minor bump', async () => {
      const result = await getNextReleaseTag(frameworkPath, 'minor', mockLogger);
      const [major, minor, patch] = result.nextVersion.split('.').map(Number);

      expect(patch).to.equal(0);
      expect(minor).to.be.greaterThan(0);
    });

    it('should reset minor and patch to 0 for major bump', async () => {
      const result = await getNextReleaseTag(frameworkPath, 'major', mockLogger);
      const [major, minor, patch] = result.nextVersion.split('.').map(Number);

      expect(minor).to.equal(0);
      expect(patch).to.equal(0);
      expect(major).to.be.greaterThan(0);
    });
  });

  describe('tag format', () => {
    it('should include project prefix in tag', async () => {
      const result = await getNextReleaseTag(frameworkPath, 'patch', mockLogger);

      expect(result.nextTag).to.match(/^framework@v\d+\.\d+\.\d+$/);
    });
  });

  describe('error handling', () => {
    it('should throw error for non-existent path', async () => {
      try {
        await getNextReleaseTag('/non/existent/path', 'patch', mockLogger);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.exist;
      }
    });
  });
});

