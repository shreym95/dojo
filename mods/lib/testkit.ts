import { mock } from 'claude-code/testing'
import type { AgentInfo, AgentSpawnInput, On } from 'claude-code'

// Shared helpers for the *.test.ts(x) files. Not imported by the module itself.

export const TRAILER = 'Co-Authored-By: Claude'
export const DOJO = { DOJO_STRATEGIST: 'shikamaru' }

export const agent = (id: string, type: string, status: AgentInfo['status'] = 'running', description = 'do the thing'): AgentInfo => ({
  id,
  type,
  status,
  description,
})

export const spawnInput = (subagentType: string, model?: string, description = 'd', prompt = 'build it'): AgentSpawnInput => ({
  tool_use_id: 'tu1',
  prompt,
  description,
  subagentType,
  provider: { plugin: 'dojo', tier: 'user' },
  parentModel: 'claude-opus-5-5',
  background: false,
  fork: false,
  ...(model === undefined ? {} : { model }),
})

export const heredoc = (body: string) => `git commit -m "$(cat <<'EOF'\n${body}\nEOF\n)"`

type Verdict = { decision: 'allow' | 'ask' | 'deny'; reason?: string; rule?: string }
type Stubs = { check?: Verdict; call?: { deny: string } }

/** Beneath the plugin: collect toasts, answer tool.check with `allow` and tool.call with a result. */
export function core(on: On, env: Record<string, string> = {}, stubs: Stubs = {}) {
  mock.env(on, env)
  const toasts: string[] = []
  const ran: string[] = []
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('tool.check', () => stubs.check ?? { decision: 'allow' as const })
  on('tool.call', (_$, e) => {
    ran.push(String(e.tool))
    return stubs.call ?? { result: 'ok' as never }
  })
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  return { toasts, ran }
}

/** Beneath the plugin: let /dojo-duty and /dojo-voice register and run. */
export function commandStubs(on: On) {
  const registered: { name: string; description: string; argumentHint?: string }[] = []
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', (_$, e) => {
    registered.push(e)
    return { value: { command: e.name } } as never
  })
  return registered
}

export const bash = (command: string) => ({ tool: 'Bash', input: { command } }) as const
export const edit = (file_path: string, new_string = 'x') => ({ tool: 'Edit', file_path, old_string: 'a', new_string }) as never
export const slash = (command: string, args = '') => ({
  command,
  args,
  origin: { kind: 'composer' as const },
  presentation: { isFullscreen: false, columns: 80 },
})
export const submit = { text: 'go', wait: false, origin: { kind: 'composer' } } as never
