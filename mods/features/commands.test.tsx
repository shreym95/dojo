import { describe, expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { DOJO, bash, core, edit, slash, spawnInput } from '../lib/testkit'
import { VOICE_RULES } from '../voice.generated'
import { voiceOverrideBlock } from '../lib/voice'

describe('helpers', () => {
  test('voice rules are the shared voice files', () => {
    expect(Object.keys(VOICE_RULES)).toEqual(['subtle', 'medium', 'full'])
    for (const level of ['subtle', 'medium', 'full'] as const) expect(VOICE_RULES[level].startsWith(`## Voice level: ${level}`)).toBe(true)
    expect(voiceOverrideBlock('full')).toContain(VOICE_RULES.full)
  })
})

describe('commands', () => {
  const setup = (on: On, env: Record<string, string> = {}) => {
    const c = core(on, env)
    const registered: { name: string; description: string; argumentHint?: string }[] = []
    on('session.start', (_$, e) => ({ cwd: e.cwd }))
    on('command.register', (_$, e) => {
      registered.push(e)
      return { value: { command: e.name } } as never
    })
    return { ...c, registered }
  }

  test('the two commands register at session.start', async ($, on) => {
    const { registered } = setup(on)
    await $.session.start({ cwd: '/x', surface: null, isInteractive: false })
    expect(registered.map(r => r.name)).toEqual(['dojo-duty', 'dojo-voice'])
    expect(registered[0]?.argumentHint).toBe('[shikamaru|lelouch]')
  })

  test('/dojo-duty shows, switches and rejects', async ($, on) => {
    setup(on)
    expect((await $.command.run(slash('dojo-duty'))).text).toBe('No strategist on duty. Valid names: shikamaru, lelouch.')
    const set = await $.command.run(slash('dojo-duty', 'Lelouch'))
    expect(set).toEqual({ text: 'On duty: Lelouch', context: ['dojo: on duty: Lelouch'] })
    expect((await $.command.run(slash('dojo-duty'))).text).toBe('On duty: Lelouch')
    // the switch makes a dojo session: the role guard now meters the main thread
    for (const f of ['/app/a.ts', '/app/b.ts']) expect((await $.tool.call(edit(f))).deny).toBeUndefined()
    expect((await $.tool.call(edit('/app/c.ts'))).deny).toMatch(/Inline edit budget reached/)
    const bad = await $.command.run(slash('dojo-duty', 'naruto'))
    expect(bad.text).toBe('Unknown strategist "naruto". Valid names: shikamaru, lelouch.')
    expect(bad.context).toBeUndefined()
    expect((await $.command.run(slash('dojo-duty'))).text).toBe('On duty: Lelouch')
  })

  test('a bare command with no args field reads as "show"', async ($, on) => {
    setup(on)
    expect((await $.command.run({ command: 'dojo-duty' } as never)).text).toBe('No strategist on duty. Valid names: shikamaru, lelouch.')
    expect((await $.command.run({ command: 'dojo-voice' } as never)).text).toBe('Voice level override: none (roster default)')
  })

  test('/dojo-voice shows, sets, clears and rejects', async ($, on) => {
    setup(on)
    expect((await $.command.run(slash('dojo-voice'))).text).toBe('Voice level override: none (roster default)')
    const set = await $.command.run(slash('dojo-voice', 'full'))
    expect(set.text).toMatch(/^Voice level override: full/)
    expect(set.context).toEqual([`dojo: voice level: full\n${VOICE_RULES.full}`])
    expect((await $.command.run(slash('dojo-voice'))).text).toBe('Voice level override: full')
    const bad = await $.command.run(slash('dojo-voice', 'loud'))
    expect(bad.text).toBe('Unknown voice level "loud". Valid levels: subtle, medium, full, or default to clear.')
    expect(bad.context).toBeUndefined()
    const cleared = await $.command.run(slash('dojo-voice', 'default'))
    expect(cleared.context).toEqual(['dojo: voice level: default'])
    expect((await $.command.run(slash('dojo-voice'))).text).toBe('Voice level override: none (roster default)')
  })
})

describe('voice override on spawn', () => {
  const spawnSeen = (on: On) => {
    const seen: { type: string; prompt: string; model?: string }[] = []
    on('agent.spawn', (_$, e) => {
      seen.push({ type: e.subagentType, prompt: e.prompt, ...(e.model === undefined ? {} : { model: e.model }) })
      return { model: 'frontmatter', agentId: 'ag-1' }
    })
    return seen
  }
  const commands = (on: On) => {
    on('session.start', (_$, e) => ({ cwd: e.cwd }))
    on('command.register', (_$, e) => ({ value: { command: e.name } }) as never)
  }

  test('with an override set, dojo crew get the level rules', async ($, on) => {
    core(on, DOJO)
    commands(on)
    const seen = spawnSeen(on)
    await $.command.run(slash('dojo-voice', 'subtle'))
    await $.agent.spawn(spawnInput('dojo:senku', 'sonnet'))
    await $.agent.spawn(spawnInput('dojo:l'))
    const first = seen[0]
    expect(first?.prompt.startsWith('build it\n\n## Voice level override\n')).toBe(true)
    expect(first?.prompt).toContain('"subtle"')
    expect(first?.prompt.endsWith(VOICE_RULES.subtle)).toBe(true)
    // the model guard runs beside it: a dojo agent decides its own model
    expect(first?.model).toBeUndefined()
    expect(seen[1]?.model).toBeUndefined()
    expect(seen[1]?.prompt).toContain(VOICE_RULES.subtle)
  })

  test('the strategist and non-dojo agents are left alone', async ($, on) => {
    core(on, DOJO)
    commands(on)
    const seen = spawnSeen(on)
    await $.command.run(slash('dojo-voice', 'full'))
    await $.agent.spawn(spawnInput('dojo:strategist'))
    await $.agent.spawn(spawnInput('Explore'))
    await $.agent.spawn(spawnInput('other:dojo:levi'))
    expect(seen.map(s => s.prompt)).toEqual(['build it', 'build it', 'build it'])
  })

  test('without an override, or after clearing it, prompts are untouched', async ($, on) => {
    core(on, DOJO)
    commands(on)
    const seen = spawnSeen(on)
    await $.agent.spawn(spawnInput('dojo:levi'))
    await $.command.run(slash('dojo-voice', 'medium'))
    await $.command.run(slash('dojo-voice', 'default'))
    await $.agent.spawn(spawnInput('dojo:levi'))
    expect(seen.map(s => s.prompt)).toEqual(['build it', 'build it'])
  })
})
