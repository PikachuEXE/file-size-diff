import * as fs from 'node:fs'
import * as path from 'node:path'
import { inspect } from 'node:util'

import { getInput, setOutput, setFailed, info, debug } from '@actions/core'
import { exec } from '@actions/exec'
import { globby } from 'globby'
import prettyBytes from 'pretty-bytes'

import { GitCommandManager } from './git-command-manager'
import * as utils from './utils'

type BranchStats = {
  totalSize: number
  files: {
    [key: string]: {
      size: number
    }
  }
}

interface Inputs {
  token: string
  targetBranch: string
  dirGlob: string
  fileDetailsOpen: string
}

export async function run(): Promise<void> {
  let git: GitCommandManager
  try {
    info('Starting file-size-diff operation')
    const inputs: Inputs = {
      token: getInput('token'),
      targetBranch: getInput('target_branch'),
      dirGlob: getInput('dir_glob') ?? '',
      fileDetailsOpen: getInput('file_details_open'),
    }
    debug(`Inputs: ${inspect(inputs)}`)
    if (!inputs.token) {
      throw new Error(`Input 'token' not supplied. Unable to continue.`)
    }
    if (!inputs.targetBranch) {
      throw new Error(`Input 'target_branch' not supplied. Unable to continue.`)
    }

    const repoPath = utils.getRepoPath()
    git = await GitCommandManager.create(repoPath)

    const { currentWorkspaceStats, targetBranchStats: targetStats } =
      await getBothBranchStats(inputs.dirGlob, git, inputs.targetBranch)

    debug(`currentWorkspaceStats: ${inspect(currentWorkspaceStats)}`)
    debug(`targetStats: ${inspect(targetStats)}`)

    info('='.repeat(50))
    info('Comparing branches:')
    info(`  Target: ${inputs.targetBranch}`)
    info(`    - Total size: ${prettyBytes(targetStats.totalSize)}`)
    info(`    - Files: ${Object.keys(targetStats.files).length}`)
    info('  Current Workspace')
    info(`    - Total size: ${prettyBytes(currentWorkspaceStats.totalSize)}`)
    info(`    - Files: ${Object.keys(currentWorkspaceStats.files).length}`)
    info('='.repeat(50))

    // Check for file differences and log them
    const allFilePaths = new Set([
      ...Object.keys(currentWorkspaceStats.files),
      ...Object.keys(targetStats.files),
    ])

    const fileChanges = {
      added: [] as string[],
      removed: [] as string[],
      modified: [] as string[],
    }

    allFilePaths.forEach((filePath) => {
      const prFile = currentWorkspaceStats.files[filePath]
      const targetFile = targetStats.files[filePath]

      if (!targetFile) {
        fileChanges.added.push(filePath)
      } else if (!prFile) {
        fileChanges.removed.push(filePath)
      } else if (prFile.size !== targetFile.size) {
        fileChanges.modified.push(filePath)
      }
    })

    info(`File changes detected:`)
    info(`  Added: ${fileChanges.added.length}`)
    info(`  Removed: ${fileChanges.removed.length}`)
    info(`  Modified: ${fileChanges.modified.length}`)

    // Log sample of changes for debugging
    if (fileChanges.added.length > 0) {
      const sample = fileChanges.added.slice(0, 3)
      info(
        `  Sample added files: ${sample.join(', ')}${fileChanges.added.length > 3 ? '...' : ''}`,
      )
    }
    if (fileChanges.removed.length > 0) {
      const sample = fileChanges.removed.slice(0, 3)
      info(
        `  Sample removed files: ${sample.join(', ')}${fileChanges.removed.length > 3 ? '...' : ''}`,
      )
    }
    if (fileChanges.modified.length > 0) {
      const sample = fileChanges.modified.slice(0, 3)
      info(
        `  Sample modified files: ${sample.join(', ')}${fileChanges.modified.length > 3 ? '...' : ''}`,
      )
    }

    // No changes found, exit early
    if (targetStats.totalSize === currentWorkspaceStats.totalSize) {
      info('No changes detected: Total sizes are identical between branches')
      info('Action completed without posting a comment')
      return
    }

    info('Size difference detected, generating comment...')

    const commentBody = getStatComment(
      targetStats,
      currentWorkspaceStats,
      inputs.fileDetailsOpen === 'true',
    )

    // Action outputs
    const outputs = new Map<string, string>()

    outputs.set('file_size_diff_content_markdown', commentBody)

    // Set outputs
    for (const [key, value] of outputs) {
      info(`${key} = ${value}`)
      setOutput(key, value)
    }

    info('Ending file-size-diff operation')
  } catch (error) {
    setFailed(
      error instanceof Error ? error.message : 'An unexpected error occurred',
    )
  }
}

const getFileStats = async (
  file: string,
  baseDir: string,
  branchStats: BranchStats,
) => {
  const stats = await fs.promises.stat(path.resolve(baseDir, file))

  branchStats.totalSize += stats.size
  branchStats.files[file] = {
    size: stats.size,
  }
}

const getBothBranchStats = async (
  dirGlob: string,
  git: GitCommandManager,
  targetBranch: string,
) => {
  const currentWorkspaceStats = await getBranchStatsV2(dirGlob, git)
  const targetBranchStats = await getBranchStatsV2(
    dirGlob,
    git,
    targetBranch,
    Object.keys(currentWorkspaceStats.files),
  )
  return {
    currentWorkspaceStats,
    targetBranchStats,
  }
}

const getBranchStatsV2 = async (
  dirGlob: string,
  git: GitCommandManager,
  branch = '__currentWorkspace__',
  filteredPaths = undefined as string[] | undefined,
): Promise<BranchStats> => {
  const useCurrentWorkspace = branch === '__currentWorkspace__'
  const label = useCurrentWorkspace ? 'Current Workspace' : `Branch <${branch}>`
  let cwd = '.'
  if (useCurrentWorkspace) {
    info(`[${label}] using current workspace`)
    if (typeof process.env.__TEST_CURRENT_WORKSPACE_DIR === 'string') {
      cwd = process.env.__TEST_CURRENT_WORKSPACE_DIR
    }
  } else {
    info(`[${label}] copy repo and git checkout `)
    if (typeof process.env.__TEST_TARGET_WORKSPACE_DIR === 'string') {
      cwd = process.env.__TEST_TARGET_WORKSPACE_DIR
    } else {
      const tempDir = '.file-size-diff'
      cwd = `../${tempDir}/${branch}`
      debug(`[${label}] cwd for target: ${cwd}`)
      await fs.promises.cp('.', cwd, { recursive: true })
      debug(`[${label}] Copied workspace to ${cwd}`)
      await exec('git', ['fetch', 'origin', branch], { cwd })
      debug(`[${label}] Fetched origin for <${branch}> in ${cwd}`)
      await exec('git', ['checkout', branch], { cwd })
      debug(`[${label}] Checkouted <${branch}> in ${cwd}`)
    }
  }

  debug(`[${label}] cwd: ${cwd}`)
  let finalToBeFilteredPaths: string[] | undefined
  if (useCurrentWorkspace) {
    finalToBeFilteredPaths = await git.getDirtyFilePaths([], { cwd })
  } else if (filteredPaths) {
    finalToBeFilteredPaths = filteredPaths
  }
  const possibleFilePaths = await globby(dirGlob.split(','), {
    cwd,
    absolute: false,
  })
  const possibleFilePathsSet = new Set(possibleFilePaths)
  const files = finalToBeFilteredPaths
    ? finalToBeFilteredPaths.filter((path: string) =>
        possibleFilePathsSet.has(path),
      )
    : possibleFilePaths

  info(`Getting file stats for ${files.length} files`)

  // Log first few file paths for debugging
  if (files.length > 0) {
    const sampleFiles = files.slice(0, 3)
    info(
      `[${label}] Sample files: ${sampleFiles.join(', ')}${files.length > 3 ? '...' : ''}`,
    )
  }

  const branchStats: BranchStats = {
    totalSize: 0,
    files: {},
  }

  await Promise.all(
    files.map((file: string) => getFileStats(file, cwd, branchStats)),
  )

  info(`[${label}] Completed file stats`)
  debug(`[${label}] branchStats: ${inspect(branchStats)}`)

  return branchStats
}

const getCommonStringStart = (strings: string[]): string => {
  if (strings.length < 2) return ''

  const sortedStrings = strings.slice().sort()

  // The first and last strings are the most different
  const first = sortedStrings[0]!
  const last = sortedStrings[sortedStrings.length - 1]!

  for (let i = 0; i < first.length; i++) {
    if (first[i] !== last[i]) return first.slice(0, i)
  }

  return first
}

export const getStatComment = (
  targetStats: BranchStats,
  currentWorkspaceStats: BranchStats,
  fileDetailsOpen: Boolean,
): string => {
  const fileTotals = {
    changed: 0,
    removed: 0,
    added: 0,
  }

  const getDiff = (a: number, b: number) => prettyBytes(a - b, { signed: true })
  const totalDiff = {
    size: getDiff(currentWorkspaceStats.totalSize, targetStats.totalSize),
    percentage:
      ((currentWorkspaceStats.totalSize - targetStats.totalSize) /
        targetStats.totalSize) *
      100,
  }

  const allFilePaths = new Set([
    ...Object.keys(currentWorkspaceStats.files),
    ...Object.keys(targetStats.files),
  ])

  const commonStart = getCommonStringStart([...allFilePaths])
  const commonFilePath = commonStart.slice(0, commonStart.lastIndexOf('/') + 1)

  let fileColumns: string[] = []
  Object.entries(currentWorkspaceStats.files).forEach(
    ([filePath, { size }]) => {
      const targetFile = targetStats.files[filePath]

      if (!targetFile) {
        // File in PR is not in target branch (added)
        fileTotals.added = fileTotals.added + 1
        fileColumns.push(
          `| \`${filePath.slice(commonFilePath.length)}\` | &nbsp; | ${prettyBytes(size)} | ${prettyBytes(size, { signed: true })} (100%) |`,
        )
      } else if (size !== targetFile.size) {
        // File in PR is in target branch
        fileTotals.changed = fileTotals.changed + 1
        const sizeDiff = size - targetFile.size
        fileColumns.push(
          `| \`${filePath.slice(commonFilePath.length)}\` | ${prettyBytes(targetFile.size)} | ${prettyBytes(size)} | ${prettyBytes(sizeDiff, { signed: true })} (${((sizeDiff / targetFile.size) * 100).toFixed(1)}%) |`,
        )
      }
    },
  )

  Object.entries(targetStats.files).forEach(([filePath, { size }]) => {
    const prFile = currentWorkspaceStats.files[filePath]
    if (prFile === undefined) {
      fileTotals.removed = fileTotals.removed + 1
      fileColumns.push(
        `| \`${filePath.slice(commonFilePath.length)}\` | ${prettyBytes(size)} | &nbsp; | ${prettyBytes(-1 * size, { signed: true })} (-100%) |`,
      )
    }
  })

  const pluralize = (count: number, single: string, plural: string) =>
    count === 1 ? single : plural

  const detailsSummaryText: string[] = []
  if (fileTotals.changed !== 0)
    detailsSummaryText.push(
      `${fileTotals.changed} ${pluralize(
        fileTotals.changed,
        'file changed',
        'files changed',
      )}`,
    )
  if (fileTotals.added !== 0)
    detailsSummaryText.push(
      `${fileTotals.added} ${pluralize(fileTotals.added, 'file added', 'files added')}`,
    )
  if (fileTotals.removed !== 0)
    detailsSummaryText.push(
      `${fileTotals.removed} ${pluralize(
        fileTotals.removed,
        'file removed',
        'files removed',
      )}`,
    )

  return `
| Target Size | Workspace Size | Diff |
|:--- |:--- |:--- |
| ${prettyBytes(targetStats.totalSize)} | ${prettyBytes(currentWorkspaceStats.totalSize)}| ${totalDiff.size} (${totalDiff.percentage.toFixed(1)}%) |


  <details${fileDetailsOpen ? ' open' : ''}>
    <summary>${detailsSummaryText.join(', ')}</summary>

${commonFilePath ? `<sub>All changed files are in ${commonFilePath}</sub>` : ''}

| Filename | Target Size | Workspace Size | Diff |
|:--- | ---:| ---:| ---:|
${fileColumns.join('\n')}
  </details>
  `
}
