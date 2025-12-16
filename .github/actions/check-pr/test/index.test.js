import { expect } from 'chai';
import sinon from 'sinon';
import { checkPullRequest } from '../src/index.js';

describe('checkPullRequest', () => {
    // Create stub logger to suppress output during tests
    const mockLogger = {
        info: sinon.stub(),
        warning: sinon.stub(),
        error: sinon.stub(),
        debug: sinon.stub()
    };

    let mockContext;
    let mockOctokit;

    beforeEach(() => {
        // Reset all logger stubs before each test
        sinon.reset();

        // Create mock context
        mockContext = {
            repo: {
                owner: 'test-owner',
                repo: 'test-repo'
            },
            payload: {
                pull_request: null
            }
        };

        // Create mock octokit
        mockOctokit = {
            rest: {
                pulls: {
                    get: sinon.stub()
                },
                checks: {
                    listForRef: sinon.stub().resolves({
                        data: {
                            check_runs: [
                                { name: 'test-check', conclusion: 'success' },
                                { name: 'lint-check', conclusion: 'success' }
                            ]
                        }
                    })
                }
            }
        };
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('manual trigger (workflow_dispatch)', () => {
        it('should process merged PR with patch label', async () => {
            const mockPR = {
                number: 123,
                merged: true,
                merge_commit_sha: 'abc123',
                base: { sha: 'base123' },
                labels: [{ name: 'patch' }]
            };

            mockOctokit.rest.pulls.get.resolves({ data: mockPR });

            const result = await checkPullRequest(mockContext, mockOctokit, 123, mockLogger);

            expect(result).to.deep.equal({
                shouldRelease: true,
                versionBump: 'patch',
                prNumber: 123,
                commitSha: 'abc123',
                baseCommitSha: 'base123'
            });

            sinon.assert.calledOnce(mockOctokit.rest.pulls.get);
            sinon.assert.calledWith(mockOctokit.rest.pulls.get, {
                owner: 'test-owner',
                repo: 'test-repo',
                pull_number: 123
            });
        });

        it('should process merged PR with minor label', async () => {
            const mockPR = {
                number: 456,
                merged: true,
                merge_commit_sha: 'def456',
                base: { sha: 'base456' },
                labels: [{ name: 'minor' }, { name: 'documentation' }]
            };

            mockOctokit.rest.pulls.get.resolves({ data: mockPR });

            const result = await checkPullRequest(mockContext, mockOctokit, 456, mockLogger);

            expect(result.versionBump).to.equal('minor');
            expect(result.shouldRelease).to.be.true;
        });

        it('should process merged PR with major label', async () => {
            const mockPR = {
                number: 789,
                merged: true,
                merge_commit_sha: 'ghi789',
                base: { sha: 'base789' },
                labels: [{ name: 'major' }]
            };

            mockOctokit.rest.pulls.get.resolves({ data: mockPR });

            const result = await checkPullRequest(mockContext, mockOctokit, 789, mockLogger);

            expect(result.versionBump).to.equal('major');
            expect(result.shouldRelease).to.be.true;
        });

        it('should throw error for unmerged PR', async () => {
            const mockPR = {
                number: 999,
                merged: false,
                merge_commit_sha: null,
                base: { sha: 'base999' },
                labels: [{ name: 'patch' }]
            };

            mockOctokit.rest.pulls.get.resolves({ data: mockPR });

            try {
                await checkPullRequest(mockContext, mockOctokit, 999, mockLogger);
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).to.equal('PR #999 is not merged');
            }
        });

        it('should throw error when no version label found', async () => {
            const mockPR = {
                number: 111,
                merged: true,
                merge_commit_sha: 'jkl111',
                base: { sha: 'base111' },
                labels: [{ name: 'documentation' }, { name: 'bug' }]
            };

            mockOctokit.rest.pulls.get.resolves({ data: mockPR });

            try {
                await checkPullRequest(mockContext, mockOctokit, 111, mockLogger);
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).to.equal('no version release label found on PR #111');
            }
        });
    });

    describe('automatic trigger (pull_request event)', () => {
        it('should process PR from context payload', async () => {
            mockContext.payload.pull_request = {
                number: 222,
                merged: true,
                merge_commit_sha: 'mno222',
                base: { sha: 'base222' },
                labels: [{ name: 'patch' }]
            };

            const result = await checkPullRequest(mockContext, mockOctokit, null, mockLogger);

            expect(result).to.deep.equal({
                shouldRelease: true,
                versionBump: 'patch',
                prNumber: 222,
                commitSha: 'mno222',
                baseCommitSha: 'base222'
            });

            sinon.assert.notCalled(mockOctokit.rest.pulls.get);
        });

        it('should prioritize first matching version label', async () => {
            mockContext.payload.pull_request = {
                number: 333,
                merged: true,
                merge_commit_sha: 'pqr333',
                base: { sha: 'base333' },
                labels: [
                    { name: 'major' },
                    { name: 'minor' },
                    { name: 'patch' }
                ]
            };

            const result = await checkPullRequest(mockContext, mockOctokit, null, mockLogger);

            expect(result.versionBump).to.equal('major');
        });

        it('should throw error when no version label in automatic trigger', async () => {
            mockContext.payload.pull_request = {
                number: 444,
                merged: true,
                merge_commit_sha: 'stu444',
                base: { sha: 'base444' },
                labels: []
            };

            try {
                await checkPullRequest(mockContext, mockOctokit, null, mockLogger);
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).to.equal('no version release label found on PR #444');
            }
        });
    });

    describe('label parsing', () => {
        it('should extract labels correctly', async () => {
            const mockPR = {
                number: 555,
                merged: true,
                merge_commit_sha: 'vwx555',
                base: { sha: 'base555' },
                labels: [
                    { name: 'bug' },
                    { name: 'patch' },
                    { name: 'documentation' }
                ]
            };

            mockOctokit.rest.pulls.get.resolves({ data: mockPR });

            const result = await checkPullRequest(mockContext, mockOctokit, 555, mockLogger);

            expect(result.versionBump).to.equal('patch');
            sinon.assert.calledWith(mockLogger.info, sinon.match(/bug, patch, documentation/));
        });
    });

    describe('status checks validation', () => {
        it('should pass when all checks are successful', async () => {
            const mockPR = {
                number: 666,
                merged: true,
                merge_commit_sha: 'xyz666',
                base: { sha: 'base666' },
                labels: [{ name: 'patch' }]
            };

            mockOctokit.rest.pulls.get.resolves({ data: mockPR });
            mockOctokit.rest.checks.listForRef.resolves({
                data: {
                    check_runs: [
                        { name: 'test', conclusion: 'success' },
                        { name: 'lint', conclusion: 'success' },
                        { name: 'build', conclusion: 'success' }
                    ]
                }
            });

            const result = await checkPullRequest(mockContext, mockOctokit, 666, mockLogger);

            expect(result.shouldRelease).to.be.true;
            sinon.assert.calledWith(mockOctokit.rest.checks.listForRef, {
                owner: 'test-owner',
                repo: 'test-repo',
                ref: 'xyz666'
            });
        });

        it('should pass when checks are skipped or neutral', async () => {
            const mockPR = {
                number: 777,
                merged: true,
                merge_commit_sha: 'abc777',
                base: { sha: 'base777' },
                labels: [{ name: 'minor' }]
            };

            mockOctokit.rest.pulls.get.resolves({ data: mockPR });
            mockOctokit.rest.checks.listForRef.resolves({
                data: {
                    check_runs: [
                        { name: 'test', conclusion: 'success' },
                        { name: 'optional', conclusion: 'skipped' },
                        { name: 'advisory', conclusion: 'neutral' }
                    ]
                }
            });

            const result = await checkPullRequest(mockContext, mockOctokit, 777, mockLogger);

            expect(result.shouldRelease).to.be.true;
        });

        it('should throw error when checks have failed', async () => {
            const mockPR = {
                number: 888,
                merged: true,
                merge_commit_sha: 'def888',
                base: { sha: 'base888' },
                labels: [{ name: 'patch' }]
            };

            mockOctokit.rest.pulls.get.resolves({ data: mockPR });
            mockOctokit.rest.checks.listForRef.resolves({
                data: {
                    check_runs: [
                        { name: 'test', conclusion: 'success' },
                        { name: 'lint', conclusion: 'failure' }
                    ]
                }
            });

            try {
                await checkPullRequest(mockContext, mockOctokit, 888, mockLogger);
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).to.include('has 1 failing check(s)');
                expect(error.message).to.include('lint (failure)');
            }
        });

        it('should throw error when multiple checks have failed', async () => {
            const mockPR = {
                number: 999,
                merged: true,
                merge_commit_sha: 'ghi999',
                base: { sha: 'base999' },
                labels: [{ name: 'major' }]
            };

            mockOctokit.rest.pulls.get.resolves({ data: mockPR });
            mockOctokit.rest.checks.listForRef.resolves({
                data: {
                    check_runs: [
                        { name: 'test', conclusion: 'failure' },
                        { name: 'lint', conclusion: 'failure' },
                        { name: 'build', conclusion: 'action_required' }
                    ]
                }
            });

            try {
                await checkPullRequest(mockContext, mockOctokit, 999, mockLogger);
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).to.include('has 3 failing check(s)');
                expect(error.message).to.include('test (failure)');
                expect(error.message).to.include('lint (failure)');
                expect(error.message).to.include('build (action_required)');
            }
        });
    });
});
