import { isOn } from '../lib/options'
import type { Installer, Options } from '../lib/options'
import { base, head, parseShell } from '../lib/shell'
import type { Word } from '../lib/shell'
import { toastLine } from '../lib/toast'

export const DEFAULT_TRAILER = 'Co-Authored-By: Claude'

export type CommitCall = { messages: string[]; trailers: string[] }

const GIT_VALUE_OPTIONS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--super-prefix'])
const UNSUPPORTED_LONG = new Set(['--file', '--reuse-message', '--reedit-message', '--fixup', '--squash', '--template'])
const SKIP_VALUE_LONG = new Set(['--author', '--date', '--cleanup', '--pathspec-from-file'])

/**
 * Every `git commit` in `command` that carries its message inline (-m / --message, repeated or not).
 * Commits whose message cannot be read statically (-F, -C, --fixup, editor, expansions) are left out.
 */
export function extractCommits(command: string): CommitCall[] {
  const calls: CommitCall[] = []
  for (const cmd of parseShell(command)) {
    const h = head(cmd)
    if (base(h[0]?.text) !== 'git') continue
    let k = 1
    while (h[k] !== undefined && h[k]?.text.startsWith('-')) k += GIT_VALUE_OPTIONS.has(h[k]?.text ?? '') ? 2 : 1
    if (h[k]?.text !== 'commit') continue

    const args = h.slice(k + 1)
    const messages: string[] = []
    const trailers: string[] = []
    let unreadable = false
    let a = 0
    const value = (): string | undefined => {
      const w = args[++a]
      if (w === undefined) {
        unreadable = true
        return undefined
      }
      if (w.dynamic) unreadable = true
      return w.text
    }
    for (; a < args.length; a++) {
      const w = args[a] as Word
      if (w.text === '--') break
      if (w.dynamic) unreadable = true
      if (w.text.startsWith('--')) {
        const eq = w.text.indexOf('=')
        const name = eq < 0 ? w.text : w.text.slice(0, eq)
        const inline = eq < 0 ? undefined : w.text.slice(eq + 1)
        if (name === '--message') {
          const v = inline ?? value()
          if (v !== undefined) messages.push(v)
        } else if (name === '--trailer') {
          const v = inline ?? value()
          if (v !== undefined) trailers.push(v)
        } else if (UNSUPPORTED_LONG.has(name)) {
          unreadable = true
        } else if (SKIP_VALUE_LONG.has(name) && inline === undefined) {
          a++
        }
      } else if (w.text.startsWith('-') && w.text.length > 1) {
        for (let p = 1; p < w.text.length; p++) {
          const ch = w.text[p] as string
          if (ch === 'm') {
            const rest = w.text.slice(p + 1)
            const v = rest === '' ? value() : rest
            if (v !== undefined) messages.push(v)
            break
          }
          if ('FCct'.includes(ch)) {
            unreadable = true
            break
          }
          if (ch === 'S' || ch === 'u') break
        }
      }
    }
    if (!unreadable && messages.length > 0) calls.push({ messages, trailers })
  }
  return calls
}

export const COMMIT_TYPES = ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert'] as const
const SUBJECT = new RegExp(`^(${COMMIT_TYPES.join('|')})(\\([^()\\r\\n]+\\))?!?: \\S`)
const SUBJECT_MAX = 72
const TRAILER_LINE = /^[A-Za-z][A-Za-z0-9-]*\s*:\s*\S/
const GENERATED_WITH = /generated with \[?claude code/i

function clip(text: string, max = 60): string {
  const chars = [...text]
  return chars.length <= max ? text : chars.slice(0, max - 1).join('') + '…'
}

/** Rule violations of one commit message, empty when it is clean. `trailer` '' skips the trailer check. */
export function checkCommitMessage(call: CommitCall, trailer: string): string[] {
  const full = [...call.messages, ...(call.trailers.length > 0 ? [call.trailers.join('\n')] : [])]
    .join('\n\n')
    .replace(/\r\n?/g, '\n')
  const lines = full.split('\n')
  while (lines.length > 0 && (lines[0] ?? '').trim() === '') lines.shift()
  const subject = (lines.shift() ?? '').trim()
  const out: string[] = []

  if (!SUBJECT.test(subject)) {
    out.push(
      `the subject is not Conventional Commits (type(scope)!: subject; types: ${COMMIT_TYPES.join(', ')}): "${clip(subject)}"`,
    )
  }
  const length = [...subject].length
  if (length > SUBJECT_MAX) out.push(`the subject is ${length} characters; the limit is ${SUBJECT_MAX}`)

  let body: string | undefined
  for (const raw of lines) {
    const line = raw.trim()
    if (line === '' || GENERATED_WITH.test(line) || TRAILER_LINE.test(line)) continue
    body ??= line
  }
  if (body !== undefined) {
    out.push(`the message has a body ("${clip(body)}"); keep only the subject line and trailer lines`)
  }

  if (trailer !== '') {
    for (const raw of lines) {
      const line = raw.trim()
      if (/^co-authored-by\s*:/i.test(line) && /claude/i.test(line) && line !== trailer) {
        out.push(`the Co-Authored-By line "${clip(line, 80)}" must be exactly "${trailer}"`)
      }
    }
  }
  if (lines.some(l => /^claude-session\s*:/i.test(l.trim()))) out.push('a "Claude-Session:" line is not allowed')
  if (GENERATED_WITH.test(full)) out.push('"Generated with Claude Code" text is not allowed')
  return out
}

/** All violations over every inline `git commit` in `command` (empty: nothing to object to). */
export function checkCommitCommand(command: string, trailer: string): string[] {
  const out: string[] = []
  for (const call of extractCommits(command)) {
    for (const v of checkCommitMessage(call, trailer)) if (!out.includes(v)) out.push(v)
  }
  return out
}

/** The deny text the model reads: each violation, then the corrected form. */
export function commitDenyReason(violations: readonly string[], trailer: string): string {
  const fix =
    trailer === ''
      ? 'Retry git commit with a single Conventional Commits subject line (at most 72 characters), no body, and no Claude-Session or "Generated with Claude Code" lines.'
      : `Retry git commit with a single Conventional Commits subject line (at most 72 characters), no body, and, if you add a trailer, exactly this line:\n${trailer}`
  return ['Commit message rejected by the dojo commit gate:', ...violations.map(v => `- ${v}`), fix].join('\n')
}

function trailerOf(options: Options): string {
  const v = options.commitTrailer
  return typeof v === 'string' ? v.trim() : DEFAULT_TRAILER
}

function commandOf(input: unknown): string | null {
  const c = typeof input === 'object' && input !== null ? (input as { command?: unknown }).command : undefined
  return typeof c === 'string' ? c : null
}

export const installCommitGate: Installer = (on, options) => {
  // The model reads the configured trailer wherever core would have written its own.
  on('attribution.text', { kind: 'commit' }, async ($, e, next) => {
    try {
      const trailer = trailerOf(options)
      if (isOn(options, 'commitGate') && trailer !== '') return { text: trailer }
    } catch {
      // fall through to core's text
    }
    return next(e)
  })

  // Core answers first; a deny is never weakened.
  on('tool.check', { tool: 'Bash' }, async ($, e, next) => {
    const core = await next(e)
    try {
      if (core.decision === 'deny') return core
      const command = commandOf(e.input)
      if (command === null || !isOn(options, 'commitGate')) return core

      const trailer = trailerOf(options)
      const violations = checkCommitCommand(command, trailer)
      if (violations.length > 0) {
        try {
          $.ui.toast(toastLine('commit'))
        } catch {
          // a toast is never worth failing a hook
        }
        return { decision: 'deny' as const, reason: commitDenyReason(violations, trailer) }
      }
    } catch {
      // fail open: core's verdict stands
    }
    return core
  })
}
