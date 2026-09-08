import os from 'os'
import fs from 'fs'
import path from 'path'
import { afterEach, jest } from '@jest/globals';
import { simpleGit, SimpleGit, SimpleGitOptions } from 'simple-git';

const gitRepoDir = path.resolve(import.meta.dirname, './fixtures/git-repos');

// tests/setup.ts - global test setup
// Increase timeout for async tests
jest.setTimeout(10000);

let tempDir: string;
const tempGitRepoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jest-test-git-repo-'));

export async function setupTargetAndCurrentWorkspaceGitRepo(targetTestRepoName: string, currentWorkspaceTestRepoName: string) {
  const targetDir = fs.mkdtempSync(path.join(tempGitRepoDir, 'target-'));
  await fs.promises.cp(
    path.resolve(gitRepoDir, targetTestRepoName),
    targetDir,
    {
      recursive: true,
    },
  );
  const git1 = simpleGit({ baseDir: targetDir });
  // No function for "add all"
  await git1
    .init()
    .addConfig('user.name', 'Some One')
    .addConfig('user.email', 'some@one.com')
    .add(['Test.svg', 'Test2.svg'])
    .commit('whatever')
  process.env.__TEST_TARGET_WORKSPACE_DIR = targetDir;

  const currentWorkspaceDir = fs.mkdtempSync(
    path.join(tempGitRepoDir, 'current-'),
  );
  await fs.promises.cp(
    path.resolve(gitRepoDir, targetTestRepoName),
    currentWorkspaceDir,
    {
      recursive: true,
    },
  );
  const git2 = simpleGit({ baseDir: currentWorkspaceDir });
  // No function for "add all"
  await git2
    .init()
    .addConfig('user.name', 'Some One')
    .addConfig('user.email', 'some@one.com')
    .add(['Test.svg', 'Test2.svg'])
    .commit('whatever')
  // Copy but don't add or commit anything
  await fs.promises.cp(
    path.resolve(gitRepoDir, currentWorkspaceTestRepoName),
    currentWorkspaceDir,
    {
      recursive: true,
    },
  );
  process.env.__TEST_CURRENT_WORKSPACE_DIR = currentWorkspaceDir;

  return { currentWorkspaceDir, targetDir };
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jest-test-'));
  process.env.GITHUB_WORKSPACE = tempDir;
});

afterEach(() => {
  delete process.env.__TEST_CURRENT_WORKSPACE_DIR;
  delete process.env.__TEST_TARGET_WORKSPACE_DIR;
  fs.rmSync(tempDir, { recursive: true, force: true });
  delete process.env.GITHUB_WORKSPACE;
})

afterAll(() => {
  fs.rmSync(tempGitRepoDir, { recursive: true, force: true });
})

// Add custom matchers if needed
// expect.extend({
//   toBeWithinRange(received: number, floor: number, ceiling: number) {
//     const pass = received >= floor && received <= ceiling;
//     return {
//       pass,
//       message: () =>
//         `expected ${received} to be within range ${floor} - ${ceiling}`,
//     };
//   },
// });
