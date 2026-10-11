import { describe, expect, test } from 'claude-code/testing'

import { commandStubs, core, slash, submit } from './testkit'
import { crewKey, isDojoType, parseOnDuty, reassertOnDuty, strategistKey } from './persona'

const NONE = 'No strategist on duty. Valid names: shikamaru, lelouch.'

describe('helpers', () => {
  test('parseOnDuty and strategistKey', () => {
    expect(parseOnDuty('dojo: on duty: Lelouch')).toBe('lelouch')
    expect(parseOnDuty('dojo: on duty: Shikamaru\n...\ndojo: on duty: Lelouch')).toBe('lelouch')
    expect(parseOnDuty('dojo: on duty: Naruto')).toBeNull()
    expect(parseOnDuty('hello')).toBeNull()
    expect(parseOnDuty('`dojo: on duty: <Name>`')).toBeNull()
    expect(strategistKey(' Shikamaru ')).toBe('shikamaru')
    expect(strategistKey('naruto')).toBeNull()
    expect(strategistKey(undefined)).toBeNull()
  })

  test('crewKey and isDojoType', () => {
    expect(crewKey('dojo:levi')).toBe('levi')
    expect(crewKey('dojo:strategist')).toBeNull()
    expect(crewKey('other:dojo:levi')).toBeNull()
    expect(crewKey('dojo:toString')).toBeNull()
    expect(isDojoType('dojo:strategist')).toBe(true)
    expect(isDojoType('Explore')).toBe(false)
  })

  test('reassertOnDuty renames known lines only', () => {
    expect(reassertOnDuty('a\ndojo: on duty: Shikamaru\nb', 'lelouch')).toBe('a\ndojo: on duty: Lelouch\nb')
    expect(reassertOnDuty('dojo: on duty: Naruto', 'lelouch')).toBe('dojo: on duty: Naruto')
    expect(reassertOnDuty('dojo: on duty: Shikamaru', 'naruto')).toBe('dojo: on duty: Shikamaru')
  })
})

// The persona is observed through /dojo-duty (what is on duty now).
describe('strategist detection', () => {
  const appendDuty = (text: string, door = 'hook-context') =>
    ({
      message: { type: 'user', role: 'user', isMeta: true, content: [{ type: 'text', text }] },
      door,
      origin: { kind: 'engine' },
      uuid: `u-${text}`,
    }) as never
  const shown = ($: { command: { run: (c: never) => Promise<{ text?: string }> } }) => $.command.run(slash('dojo-duty') as never)

  test('the on-duty line makes a dojo session, and the latest line wins', async ($, on) => {
    core(on, {})
    commandStubs(on)
    expect((await shown($)).text).toBe(NONE)
    await $.session.append(appendDuty('dojo: on duty: Shikamaru'))
    expect((await shown($)).text).toBe('On duty: Shikamaru')
    await $.session.append(appendDuty('dojo: on duty: Lelouch'))
    expect((await shown($)).text).toBe('On duty: Lelouch')
  })

  test('a typed prompt that quotes the line is not a persona', async ($, on) => {
    core(on, {})
    commandStubs(on)
    await $.session.append(appendDuty('dojo: on duty: Lelouch', 'prompt'))
    expect((await shown($)).text).toBe(NONE)
  })

  test('the transcript scan finds the latest user line on the first prompt', async ($, on) => {
    core(on, {})
    commandStubs(on)
    on('session.messages', () => ({
      value: [
        { role: 'user', text: 'dojo: on duty: Shikamaru', toolUses: [] },
        { role: 'user', text: 'compacted\ndojo: on duty: Lelouch', toolUses: [] },
        { role: 'assistant', text: 'dojo: on duty: Shikamaru', toolUses: [] },
      ],
    }))
    await $.prompt.submit(submit)
    expect((await shown($)).text).toBe('On duty: Lelouch')
  })

  test('the transcript scan gives up after the first prompts', async ($, on) => {
    core(on, {})
    commandStubs(on)
    let rows: { role: 'user'; text: string; toolUses: never[] }[] = []
    on('session.messages', () => ({ value: rows }))
    for (let n = 0; n < 4; n++) await $.prompt.submit(submit)
    rows = [{ role: 'user', text: 'dojo: on duty: Lelouch', toolUses: [] }]
    await $.prompt.submit(submit)
    expect((await shown($)).text).toBe(NONE)
  })

  test('the env var is the fallback', async ($, on) => {
    core(on, { DOJO_STRATEGIST: 'lelouch' })
    commandStubs(on)
    expect((await shown($)).text).toBe('On duty: Lelouch')
  })
})

// SessionStart fires again on resume and compact and announces the original persona over a /dojo-duty switch.
describe('a /dojo-duty choice survives a SessionStart re-fire', () => {
  const hookLine = (name: string) =>
    ({
      message: { type: 'user', role: 'user', isMeta: true, content: [{ type: 'text', text: `dojo: on duty: ${name}` }] },
      door: 'hook-context',
      origin: { kind: 'engine' },
      uuid: `u-${name}`,
    }) as never

  /** What the engine's bottom stores for each appended row. */
  const stored = (on: Parameters<typeof core>[0]) => {
    const texts: string[] = []
    on('session.append', (_$, e, next) => {
      for (const b of e.message.content) if (b.type === 'text') texts.push(String(b.text))
      return next(e)
    })
    return texts
  }

  test('the re-announced line is rewritten to the chosen persona and the duty stays', async ($, on) => {
    core(on, {})
    commandStubs(on)
    const texts = stored(on)
    await $.session.append(hookLine('Shikamaru'))
    await $.command.run(slash('dojo-duty', 'Lelouch') as never)
    await $.session.append(hookLine('Shikamaru'))
    expect(texts).toEqual(['dojo: on duty: Shikamaru', 'dojo: on duty: Lelouch'])
    expect((await $.command.run(slash('dojo-duty') as never)).text).toBe('On duty: Lelouch')
  })

  test('without a choice the hook line stands untouched', async ($, on) => {
    core(on, {})
    commandStubs(on)
    const texts = stored(on)
    await $.session.append(hookLine('Shikamaru'))
    await $.session.append(hookLine('Lelouch'))
    expect(texts).toEqual(['dojo: on duty: Shikamaru', 'dojo: on duty: Lelouch'])
  })

  test('a later /dojo-duty replaces the earlier choice', async ($, on) => {
    core(on, {})
    commandStubs(on)
    const texts = stored(on)
    await $.command.run(slash('dojo-duty', 'Lelouch') as never)
    await $.command.run(slash('dojo-duty', 'Shikamaru') as never)
    await $.session.append(hookLine('Lelouch'))
    expect(texts).toEqual(['dojo: on duty: Shikamaru'])
    expect((await $.command.run(slash('dojo-duty') as never)).text).toBe('On duty: Shikamaru')
  })

  test('text around the line is kept and a typed prompt is not touched', async ($, on) => {
    core(on, {})
    commandStubs(on)
    const texts = stored(on)
    await $.command.run(slash('dojo-duty', 'Lelouch') as never)
    const row = hookLine('Shikamaru') as unknown as { message: { content: { text: string }[] } }
    row.message.content[0]!.text = 'resumed\ndojo: on duty: Shikamaru\nmore'
    await $.session.append(row as never)
    await $.session.append({ ...(hookLine('Shikamaru') as object), door: 'prompt' } as never)
    expect(texts).toEqual(['resumed\ndojo: on duty: Lelouch\nmore', 'dojo: on duty: Shikamaru'])
  })
})
