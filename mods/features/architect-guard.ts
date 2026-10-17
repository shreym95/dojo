import type { EngineInterface as Engine } from 'claude-code'

import { isOn } from '../lib/options'
import type { Installer } from '../lib/options'
import { toastLine } from '../lib/toast'
import { isExemptPath } from './role-guard'

const ARCHITECT = 'dojo:kurisu'
const WRITE_TOOLS = ['Edit', 'Write', 'NotebookEdit'] as const

// Where Claude Code puts the worktree of an Agent call with `isolation: "worktree"`: <project>/.claude/worktrees/<name>.
const WORKTREE = /\/\.claude\/worktrees\/[^/]+\//

/** The target of a file-writing tool call, or null when the call names none. */
export function writeTarget(tool: string, args: Record<string, unknown>): string | null {
  const file = tool === 'NotebookEdit' ? args.notebook_path : args.file_path
  return typeof file === 'string' && file !== '' ? file : null
}

/** Collapse `.`, `..` and repeated slashes, so `/tmp/../home/x` is not taken for a temp path. Relative paths keep their `..`. */
export function normalizePath(path: string): string {
  const absolute = path.startsWith('/')
  const out: string[] = []
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      if (out.length > 0 && out[out.length - 1] !== '..') out.pop()
      else if (!absolute) out.push('..')
    } else out.push(part)
  }
  return (absolute ? '/' : '') + out.join('/')
}

/** True when the architect may write here: scratch space (system temp dirs, `$TMPDIR`, any `/scratchpad/`) or an isolated worktree. */
export function isArchitectPath(path: string, tmpDirs: readonly string[] = []): boolean {
  const p = normalizePath(path)
  return isExemptPath(p, tmpDirs) || WORKTREE.test(p)
}

export function architectDenyReason(path: string): string {
  return `Writes to the main working tree are not the architect's job (${path}). Put POCs in the scratchpad or system temp dir, or run in an isolated worktree; implementation goes to dojo:senku or dojo:sanji via the strategist.`
}

async function tmpDirs($: Engine): Promise<string[]> {
  try {
    const dir = await $.env.get('TMPDIR')
    return typeof dir === 'string' && dir !== '' ? [dir] : []
  } catch {
    return []
  }
}

async function isArchitect($: Engine, agentId: string): Promise<boolean> {
  return (await $.agent.list()).some(a => a.id === agentId && a.type === ARCHITECT)
}

export const installArchitectGuard: Installer = (on, options) => {
  // Architect guard: dojo:kurisu may write only to scratch space or an isolated worktree, never the main working tree.
  // Bash is not parsed: a shell redirect or `sed -i` is not caught here.
  on('tool.call', { tool: WRITE_TOOLS }, async ($, e, next) => {
    try {
      if (e.agentId !== undefined && isOn(options, 'architectGuard') && (await isArchitect($, e.agentId))) {
        const file = writeTarget(String(e.tool), e as unknown as Record<string, unknown>)
        if (file !== null && !isArchitectPath(file, await tmpDirs($))) {
          try {
            $.ui.toast(toastLine('architect'))
          } catch {
            // a toast is never worth failing a hook
          }
          return { deny: architectDenyReason(file) }
        }
      }
    } catch {
      // fail open: the call goes through
    }
    return next(e)
  })
}
