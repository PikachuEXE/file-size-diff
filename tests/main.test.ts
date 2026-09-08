/**
 * Unit tests for the action's main functionality, src/main.js
 */
import { describe, afterEach, beforeEach, jest } from '@jest/globals'
import * as core from 'fixtures/core';
import * as github from 'fixtures/github';

import {
  setupCurrentWorkspaceGitRepo,
  setupTargetAndCurrentWorkspaceGitRepo,
  setupTargetBranchGitRepo,
} from 'setup';

jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('@actions/github', () => github)

// The module being tested should be imported dynamically. This ensures that the
// mocks are used in place of any actual dependencies.
const { run } = await import('src/main');

describe('action', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  const mockedInputs: { [key: string]: unknown } = {};
  beforeEach(() => {
    core.getInput.mockImplementation((name) => mockedInputs[name]);
  });

  describe('when token null', () => {
    it('throws error', async () => {
      await run();

      expect(core.setFailed).toHaveBeenCalledWith(
        `Input 'token' not supplied. Unable to continue.`,
      );
    })
  })

  describe('when target_branch null', () => {
    beforeEach(async () => {
      mockedInputs['token'] = 'testToken';
    });
    it('throws error', async () => {
      await run();

      expect(core.setFailed).toHaveBeenCalledWith(
        `Input 'target_branch' not supplied. Unable to continue.`,
      );
    });
  });

  describe('when required inputs supplied', () => {
    beforeEach(async () => {
      mockedInputs['token'] = 'testToken';
      mockedInputs['target_branch'] = 'master';

      await setupTargetAndCurrentWorkspaceGitRepo('base', 'images_optimized');
    });
    afterEach(() => {
      delete mockedInputs.token;
      delete mockedInputs.target_branch;
    });

    it('sets outputs', async () => {
      await run();

      expect(core.setOutput).toHaveBeenCalledWith(
        'file_size_diff_content_markdown',
        expect.any(String),
      );
    });

    describe('file_size_diff_content_markdown', () => {
      it('sets correct text', async () => {
        await run();

        expect(core.setOutput).toHaveBeenCalledWith(
          'file_size_diff_content_markdown',
          expect.not.stringContaining('undefined'),
        );

        expect(core.setOutput).toHaveBeenCalledWith(
          'file_size_diff_content_markdown',
          expect.stringMatching('| Target Size | Workspace Size | Diff |'),
        );
        expect(core.setOutput).toHaveBeenCalledWith(
          'file_size_diff_content_markdown',
          expect.stringMatching('|:--- |:--- |:--- |'),
        );

        expect(core.setOutput).toHaveBeenCalledWith(
          'file_size_diff_content_markdown',
          expect.stringMatching('<details>'),
        );
        expect(core.setOutput).toHaveBeenCalledWith(
          'file_size_diff_content_markdown',
          expect.stringMatching('</details>'),
        );
        expect(core.setOutput).toHaveBeenCalledWith(
          'file_size_diff_content_markdown',
          expect.stringMatching('<summary>'),
        );
        expect(core.setOutput).toHaveBeenCalledWith(
          'file_size_diff_content_markdown',
          expect.stringMatching('</summary>'),
        );

        expect(core.setOutput).toHaveBeenCalledWith(
          'file_size_diff_content_markdown',
          expect.stringMatching('Test.svg'),
        );
        expect(core.setOutput).toHaveBeenCalledWith(
          'file_size_diff_content_markdown',
          expect.stringMatching('Test2.svg'),
        );
      });

      describe('when file_details_open is true', () => {
        beforeEach(async () => {
          mockedInputs['file_details_open'] = 'true';
        });
        afterEach(() => {
          delete mockedInputs.file_details_open;
        });

        it('sets correct text', async () => {
          await run();

          expect(core.setOutput).toHaveBeenCalledWith(
            'file_size_diff_content_markdown',
            expect.not.stringContaining('undefined'),
          );

          expect(core.setOutput).toHaveBeenCalledWith(
            'file_size_diff_content_markdown',
            expect.stringMatching('| Target Size | Workspace Size | Diff |'),
          );
          expect(core.setOutput).toHaveBeenCalledWith(
            'file_size_diff_content_markdown',
            expect.stringMatching('|:--- |:--- |:--- |'),
          );

          expect(core.setOutput).toHaveBeenCalledWith(
            'file_size_diff_content_markdown',
            expect.stringMatching('<details open>'),
          );
          expect(core.setOutput).toHaveBeenCalledWith(
            'file_size_diff_content_markdown',
            expect.stringMatching('</details>'),
          );
          expect(core.setOutput).toHaveBeenCalledWith(
            'file_size_diff_content_markdown',
            expect.stringMatching('<summary>'),
          );
          expect(core.setOutput).toHaveBeenCalledWith(
            'file_size_diff_content_markdown',
            expect.stringMatching('</summary>'),
          );

          expect(core.setOutput).toHaveBeenCalledWith(
            'file_size_diff_content_markdown',
            expect.stringMatching('Test.svg'),
          );
          expect(core.setOutput).toHaveBeenCalledWith(
            'file_size_diff_content_markdown',
            expect.stringMatching('Test2.svg'),
          );
        });
      });
    });
  });
});
