import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine } from 'claude-code'

import { isOn } from '../lib/options'
import type { Installer, Options } from '../lib/options'
import { strategistKey } from '../lib/persona'
import { toastLine } from '../lib/toast'
import type { DojoBudget } from '../state'

// The module scan reads an atom only from a const of the file that uses it; the {plugin, key} pair is the shared name.
const strategist = atom({ plugin: 'dojo', key: 'strategist' } as const, null)
const turn = atom({ plugin: 'dojo', key: 'turn' } as const, 0)
const budget = atom({ plugin: 'dojo', key: 'budget' } as const, { files: [], lookups: 0 } as DojoBudget)
// The prompt number the budget belongs to: a new prompt is a new turn, and its first metered call starts a fresh budget.
const budgetTurn = atom({ plugin: 'dojo', key: 'budgetTurn' } as const, 0)

export type Budget = DojoBudget
export const EMPTY_BUDGET: Budget = { files: [], lookups: 0 }

const METERED_TOOLS = ['Edit', 'Write', 'NotebookEdit', 'WebSearch', 'WebFetch'] as const

export type RoleLimits = { files: number; lines: number; lookups: number }

const FRONTEND = /\.(tsx|jsx|vue|svelte|css|scss|sass|less|html)$/i
const TEMP_ROOTS = ['/tmp/', '/var/tmp/', '/private/tmp/', '/var/folders/', '/private/var/folders/']

/** `dojo:sanji` for UI files, `dojo:senku` for everything else. */
export function delegateFor(path: string): 'dojo:sanji' | 'dojo:senku' {
  return FRONTEND.test(path) ? 'dojo:sanji' : 'dojo:senku'
}

/** Scratch space is not the project: system temp dirs (and `tmpDirs`) and any `/scratchpad/`. */
export function isExemptPath(path: string, tmpDirs: readonly string[] = []): boolean {
  if (path.includes('/scratchpad/')) return true
  const roots = [...TEMP_ROOTS, ...tmpDirs.filter(d => d !== '').map(d => (d.endsWith('/') ? d : `${d}/`))]
  return roots.some(r => path.startsWith(r))
}

export function countLines(text: string): number {
  if (text === '') return 0
  const n = text.split('\n').length
  return text.endsWith('\n') ? n - 1 : n
}

export type RoleCall =
  | { kind: 'edit'; file: string; lines: number | null }
  | { kind: 'lookup' }

/** What the main thread's tool call spends, or null for a call the role guard does not meter. */
export function roleCall(tool: string, args: Record<string, unknown>): RoleCall | null {
  if (tool === 'WebSearch' || tool === 'WebFetch') return { kind: 'lookup' }
  if (tool === 'Edit' || tool === 'Write' || tool === 'NotebookEdit') {
    const file = tool === 'NotebookEdit' ? args.notebook_path : args.file_path
    if (typeof file !== 'string' || file === '') return null
    const lines = tool === 'Edit' && typeof args.new_string === 'string' ? countLines(args.new_string) : null
    return { kind: 'edit', file, lines }
  }
  return null
}

export type Charge = {
  budget: Budget
  /** True when this call newly spent budget (a file not yet edited this turn, or a lookup). */
  added: boolean
  denied: null | { reason: string; toast: 'backend' | 'frontend' | 'lookups' }
}

/** Pure: spend one call from the turn's budget, or say why it is over. */
export function charge(b: Budget, call: RoleCall, limits: RoleLimits, tmpDirs: readonly string[] = []): Charge {
  if (call.kind === 'lookup') {
    if (b.lookups >= limits.lookups) {
      return {
        budget: b,
        added: false,
        denied: {
          reason: `Inline lookup budget reached: ${b.lookups} WebSearch/WebFetch calls already made this turn (limit ${limits.lookups}). Delegate multi-source research to dojo:jiraiya, or a single-fact lookup to dojo:light, with a delegation brief.`,
          toast: 'lookups',
        },
      }
    }
    return { budget: { ...b, lookups: b.lookups + 1 }, added: true, denied: null }
  }
  if (isExemptPath(call.file, tmpDirs)) return { budget: b, added: false, denied: null }
  const agent = delegateFor(call.file)
  const toast = agent === 'dojo:sanji' ? 'frontend' : 'backend'
  if (call.lines !== null && call.lines > limits.lines) {
    return {
      budget: b,
      added: false,
      denied: {
        reason: `This Edit writes ${call.lines} lines (inline limit ${limits.lines}). Delegate it to ${agent} with a delegation brief instead of editing ${call.file} yourself.`,
        toast,
      },
    }
  }
  if (b.files.includes(call.file)) return { budget: b, added: false, denied: null }
  if (b.files.length >= limits.files) {
    return {
      budget: b,
      added: false,
      denied: {
        reason: `Inline edit budget reached: ${b.files.length} distinct files already edited this turn (limit ${limits.files}). Delegate the change to ${agent} with a delegation brief instead of editing ${call.file} yourself.`,
        toast,
      },
    }
  }
  return { budget: { ...b, files: [...b.files, call.file] }, added: true, denied: null }
}

/** Pure: give back what a charge spent, for a call that core then refused. */
export function refund(b: Budget, call: RoleCall): Budget {
  if (call.kind === 'lookup') return { ...b, lookups: Math.max(0, b.lookups - 1) }
  return { ...b, files: b.files.filter(f => f !== call.file) }
}

function count(options: Options, name: string, fallback: number): number {
  const v = options[name]
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback
}

function limitsOf(options: Options): RoleLimits {
  return {
    files: count(options, 'inlineEditFiles', 2),
    lines: count(options, 'inlineEditLines', 6),
    lookups: count(options, 'inlineLookups', 3),
  }
}

async function tmpDirs($: Engine): Promise<string[]> {
  try {
    const dir = await $.env.get('TMPDIR')
    return typeof dir === 'string' && dir !== '' ? [dir] : []
  } catch {
    return []
  }
}

async function newTurnBudget($: Engine) {
  const n = (await read($, turn)) ?? 0
  if ((await read($, budgetTurn)) === n) return
  await update($, budget, () => EMPTY_BUDGET)
  await update($, budgetTurn, () => n)
}

export const installRoleGuard: Installer = (on, options) => {
  // Role guard on the main thread: caps inline edits and web lookups per turn in a dojo session.
  on('tool.call', { tool: METERED_TOOLS }, async ($, e, next) => {
    let spent: RoleCall | null = null
    try {
      if (e.agentId === undefined && isOn(options, 'roleGuard') && ((await read($, strategist)) ?? strategistKey(await $.env.get('DOJO_STRATEGIST'))) !== null) {
        const call = roleCall(String(e.tool), e as unknown as Record<string, unknown>)
        if (call !== null) {
          await newTurnBudget($)
          const limits = limitsOf(options)
          const tmp = call.kind === 'edit' ? await tmpDirs($) : []
          let result = charge(EMPTY_BUDGET, call, limits, tmp)
          await update($, budget, b => {
            result = charge(b, call, limits, tmp)
            return result.budget
          })
          if (result.denied !== null) {
            try {
              $.ui.toast(toastLine(result.denied.toast))
            } catch {
              // a toast is never worth failing a hook
            }
            return { deny: result.denied.reason }
          }
          if (result.added) spent = call
        }
      }
    } catch {
      // fail open: the call goes through unmetered
    }

    const ran = await next(e)

    try {
      if (ran.deny !== undefined && spent !== null) {
        const call = spent
        await update($, budget, b => refund(b, call))
      }
    } catch {
      // bookkeeping only
    }
    return ran
  })
}
