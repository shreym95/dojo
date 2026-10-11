import { describe, expect, test } from 'claude-code/testing'

import { spawnInput } from '../lib/testkit'

describe('model guard', () => {
  test('strips model for dojo types', async ($, on) => {
    const seen: (string | undefined)[] = []
    on('agent.spawn', (_$, e) => {
      seen.push(e.model)
      return { model: 'frontmatter', agentId: 'a1' }
    })
    await $.agent.spawn(spawnInput('dojo:levi', 'sonnet'))
    await $.agent.spawn(spawnInput('dojo:strategist', 'opus'))
    expect(seen).toEqual([undefined, undefined])
  })

  test('leaves other types alone', async ($, on) => {
    const seen: (string | undefined)[] = []
    on('agent.spawn', (_$, e) => {
      seen.push(e.model)
      return { model: 'x', agentId: 'a1' }
    })
    await $.agent.spawn(spawnInput('Explore', 'haiku'))
    await $.agent.spawn(spawnInput('other:dojo:levi', 'sonnet'))
    expect(seen).toEqual(['haiku', 'sonnet'])
  })

  test('guard stays on when every visual is off', async ($, on) => {
    // handled below via options; this body only registers the bottom hook
    const seen: (string | undefined)[] = []
    on('agent.spawn', (_$, e) => {
      seen.push(e.model)
      return { model: 'x', agentId: 'a1' }
    })
    await $.agent.spawn(spawnInput('dojo:senku', 'sonnet'))
    expect(seen).toEqual([undefined])
  })
})

describe('guard with visuals off', () => {
  test(
    'still strips model',
    { options: { spinners: false, turnFlair: false, band: false, toasts: false } },
    async ($, on) => {
      const seen: (string | undefined)[] = []
      on('agent.spawn', (_$, e) => {
        seen.push(e.model)
        return { model: 'x', agentId: 'a1' }
      })
      await $.agent.spawn(spawnInput('dojo:robin', 'sonnet'))
      expect(seen).toEqual([undefined])
    },
  )
})
