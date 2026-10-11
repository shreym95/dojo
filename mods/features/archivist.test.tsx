import { describe, expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { DOJO, agent, core, slash } from '../lib/testkit'
import { compactDirective } from './archivist'

describe('helpers', () => {
  test('compaction directive', () => {
    const d = compactDirective({ strategist: 'lelouch', voice: 'full', agents: [{ id: 'ag-1', type: 'dojo:senku', description: 'build the API' }] })
    expect(d).toContain('"dojo: on duty: Lelouch"')
    expect(d).toContain('"dojo: voice level: full"')
    expect(d).toContain('dojo:senku (ag-1): build the API')
    expect(d).toContain('every decision the user made')
    expect(compactDirective({ strategist: 'lelouch', voice: null, agents: [] })).toContain('roster default')
  })
})

describe('archivist', () => {
  // a compaction runs over a transcript; the test engine only has one if the call brings it
  const transcript = [{ role: 'user' as const, text: 'hello', toolUses: [] }]
  const compactSeen = (on: On) => {
    const seen: (string | undefined)[] = []
    on('session.compact', (_$, e) => {
      seen.push(e.instructions)
      return { messages: [{ role: 'user' as const, text: 'summary', toolUses: [] }] }
    })
    return seen
  }

  test('appends the directive after existing instructions; toast in Robin voice', async ($, on) => {
    const { toasts } = core(on, DOJO)
    on('agent.list', () => ({
      value: [agent('ag-1', 'dojo:senku', 'running', 'build the API'), agent('ag-2', 'dojo:levi', 'completed'), agent('ag-3', 'general-purpose')],
    }))
    const seen = compactSeen(on)
    await $.session.compact({ instructions: 'keep the plan', messages: transcript } as never)
    const text = seen[0] ?? ''
    expect(text.startsWith('keep the plan\n\nWhen summarizing, preserve verbatim:')).toBe(true)
    expect(text).toContain('"dojo: on duty: Shikamaru"')
    expect(text).toContain('roster default')
    expect(text).toContain('dojo:senku (ag-1): build the API')
    expect(text).not.toContain('ag-2')
    expect(text).not.toContain('ag-3')
    expect(text).toContain('every decision the user made')
    expect(toasts).toEqual(['🌸 Robin: "Fufu. I will keep the thread safe."'])
  })

  test('works without prior instructions and includes the voice override', async ($, on) => {
    core(on, DOJO)
    on('agent.list', () => ({ value: [] }))
    on('session.start', (_$, e) => ({ cwd: e.cwd }))
    on('command.register', (_$, e) => ({ value: { command: e.name } }) as never)
    const seen = compactSeen(on)
    await $.command.run(slash('dojo-voice', 'full'))
    await $.session.compact({ messages: transcript } as never)
    expect(seen[0]?.startsWith('When summarizing, preserve verbatim:')).toBe(true)
    expect(seen[0]).toContain('"dojo: voice level: full"')
    expect(seen[0]).toContain('none are running now')
  })

  test('a subagent compaction is left alone', async ($, on) => {
    const { toasts } = core(on, DOJO)
    on('agent.list', () => ({ value: [] }))
    const seen = compactSeen(on)
    await $.session.compact({ instructions: 'mine', agentId: 'ag-1', messages: transcript } as never)
    expect(seen).toEqual(['mine'])
    expect(toasts).toEqual([])
  })

  test('outside a dojo session nothing is appended', async ($, on) => {
    core(on, {})
    on('agent.list', () => ({ value: [] }))
    const seen = compactSeen(on)
    await $.session.compact({ instructions: 'mine', messages: transcript } as never)
    await $.session.compact({ messages: transcript } as never)
    expect(seen).toEqual(['mine', undefined])
  })

  test('archivist off', { options: { archivist: false } }, async ($, on) => {
    core(on, DOJO)
    on('agent.list', () => ({ value: [] }))
    const seen = compactSeen(on)
    await $.session.compact({ instructions: 'mine', messages: transcript } as never)
    expect(seen).toEqual(['mine'])
  })
})
