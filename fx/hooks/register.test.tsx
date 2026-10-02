import { describe, expect, mock, test } from 'claude-code/testing'
import type { AgentInfo, AgentSpawnInput } from 'claude-code'
import { bandLine, parseOnDuty, summarizeTool, truncate } from './lib'

const PLUGIN = 'dojo-fx'

const agent = (id: string, type: string, status = 'running', description = 'do the thing'): AgentInfo => ({
  id,
  type,
  status,
  description,
})

const spawnInput = (subagentType: string, model?: string, description = 'd'): AgentSpawnInput => ({
  tool_use_id: 'tu1',
  prompt: 'p',
  description,
  subagentType,
  provider: { plugin: 'dojo', tier: 'user' },
  parentModel: 'claude-opus-5-5',
  background: false,
  fork: false,
  ...(model === undefined ? {} : { model }),
})

const SPINNER = { word: 'Sauteing', message: null, suffix: '…', mode: 'requesting' } as const

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

// Beneath the plugins stands the engine: a bottom ui.render hook draws the props it was handed as text.
const SPINNER_PROPS = SPINNER
const BAND_PROPS = {
  hasSurvey: false,
  isWorking: true,
  maxRows: 10,
  bodyColumns: 80,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
} as const

describe('spinner', () => {
  test('dojo subagent word comes from its own pool', async ($, on) => {
    on('agent.list', () => ({ value: [agent('ag-levi', 'dojo:levi'), agent('ag-robin', 'dojo:robin')] }))
    on('ui.render', { component: 'Spinner' }, ($, e) => {
      const { Text } = $.ui.resolve(e)
      return Text({ children: String((e.props as { word: string }).word) })
    })
    for (const [id, emoji, pool] of [
      ['ag-levi', '🧹', /(Inspecting|Scrubbing|Wiping it down|Checking the corners|Tch-ing)$/],
      ['ag-robin', '🌸', /(Deciphering|Blooming arms|Reading the Poneglyph|Cien-Fleur-ing|Pinning a stale claim)$/],
    ] as const) {
      const ui = await $.ui.mount({
        plugin: PLUGIN,
        surface: 'terminal',
        component: 'Spinner',
        props: SPINNER_PROPS,
        requestId: id,
      })
      const shown = (await ui.find({ type: 'Text' }))?.text ?? ''
      expect(shown.startsWith(emoji)).toBe(true)
      expect(shown).toMatch(pool)
      await ui.unmount()
    }
  })

  test('main thread uses the detected strategist pool (env fallback)', async ($, on) => {
    mock.env(on, { DOJO_STRATEGIST: 'lelouch' })
    on('agent.list', () => ({ value: [] }))
    on('ui.render', { component: 'Spinner' }, ($, e) => {
      const { Text } = $.ui.resolve(e)
      return Text({ children: String((e.props as { word: string }).word) })
    })
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Spinner', props: SPINNER_PROPS, requestId: 'main' })
    expect((await ui.find({ type: 'Text' }))?.text).toMatch(/^♟️ (Commanding|Geass-ing|Plotting checkmate|Moving the pieces|Dispatching the Black Knights|Staging the Requiem)$/)
    await ui.unmount()
  })
})

describe('band', () => {
  test('renders nothing when no crew is running', async ($, on) => {
    mock.clock(on)
    on('agent.list', () => ({ value: [agent('ag-x', 'dojo:levi', 'completed'), agent('ag-y', 'general-purpose')] }))
    on('ui.render', { component: 'AbovePrompt' }, ($, e) => $.ui.resolve(e).Text({ children: 'ENGINE-BAND' }))
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS })
    // the plugin passed: only the engine's own tree is there, no crew row
    expect((await ui.findAll({ type: 'Text' })).map(t => t.text)).toEqual(['ENGINE-BAND'])
    await ui.unmount()
  })

  test('one row per running crew member after a deploy', async ($, on) => {
    mock.clock(on)
    on('agent.list', () => ({ value: [agent('ag-levi', 'dojo:levi', 'running', 'QA the cart')] }))
    on('agent.spawn', () => ({ model: 'x', agentId: 'ag-levi' }))
    on('ui.toast', () => ({ value: undefined }))
    on('ui.render', { component: 'AbovePrompt' }, ($, e) => $.ui.resolve(e).Text({ children: 'ENGINE-BAND' }))
    await $.agent.spawn(spawnInput('dojo:levi', undefined, 'QA the cart'))
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS })
    const rows = await ui.findAll({ type: 'Text' })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.text).toMatch(/^🧹 Levi [⚔⟋⟍✕] QA the cart$/)
    await ui.unmount()
  })
})

describe('toasts', () => {
  test('deploy, return and fell', async ($, on) => {
    const clock = mock.clock(on)
    const toasts: string[] = []
    let status = 'running'
    let n = 0
    on('ui.toast', (_$, e) => {
      toasts.push(e.text)
      return { value: undefined }
    })
    on('agent.spawn', () => ({ model: 'x', agentId: `ag-${++n}` }))
    on('agent.list', () => ({
      value: [agent('ag-1', 'dojo:levi', status), agent('ag-2', 'dojo:senku', status === 'completed' ? 'failed' : 'running')],
    }))
    await $.agent.spawn(spawnInput('dojo:levi', undefined, 'qa'))
    await $.agent.spawn(spawnInput('dojo:senku', undefined, 'build'))
    expect(toasts).toEqual(['🧹 Levi deployed — "Chi. Show me the mess."', '🧪 Senku deployed — "Ten billion percent doable."'])
    status = 'completed'
    await clock.advance(300)
    expect(toasts.slice(2).sort()).toEqual(['💀 Senku fell', '🧹 Levi returned'])
  })

  test('toasts off: no toast', { options: { toasts: false } }, async ($, on) => {
    mock.clock(on)
    const toasts: string[] = []
    on('ui.toast', (_$, e) => {
      toasts.push(e.text)
      return { value: undefined }
    })
    on('agent.spawn', () => ({ model: 'x', agentId: 'ag-1' }))
    await $.agent.spawn(spawnInput('dojo:levi', undefined))
    expect(toasts).toEqual([])
  })
})

describe('strategist detection', () => {
  test('on-duty line in the transcript picks the persona for the turn flair', async ($, on) => {
    on('agent.list', () => ({ value: [] }))
    on('session.messages', () => ({ value: [{ role: 'user', text: 'dojo: on duty: Shikamaru', toolUses: [] }] }))
    on('prompt.submit', () => ({ text: 'hi' }) as never)
    on('ui.render', { component: 'TurnDuration' }, ($, e) =>
      $.ui.resolve(e).Text({ children: String((e.props as { word: string }).word) }),
    )
    await $.prompt.submit({ text: 'hi', wait: false, origin: { kind: 'composer' } })
    const ui = await $.ui.mount({
      plugin: PLUGIN,
      surface: 'terminal',
      component: 'TurnDuration',
      props: { word: 'Baked', durationMs: 3000 },
    })
    expect((await ui.find({ type: 'Text' }))?.text).toMatch(/^(Outmaneuvered|Shadow-bound|Sighed through)$/)
    await ui.unmount()
  })
})

describe('helpers', () => {
  test('parseOnDuty', () => {
    expect(parseOnDuty('dojo: on duty: Lelouch')).toBe('lelouch')
    expect(parseOnDuty('dojo: on duty: Naruto')).toBeNull()
    expect(parseOnDuty('hello')).toBeNull()
  })
  test('summarizeTool', () => {
    expect(summarizeTool('Bash', { command: 'npm  test\n' })).toBe('Bash: npm test')
    expect(summarizeTool('Read', { file_path: '/a/b.ts' })).toBe('Read: /a/b.ts')
    expect(summarizeTool('Weird', {})).toBe('Weird')
  })
  test('band line is one line, cut to width', () => {
    const line = bandLine({ key: 'levi', description: 'inspect everything thoroughly', tool: 'Bash: npm test', frame: 1 }, 20)
    expect([...line]).toHaveLength(20)
    expect(line.startsWith('🧹 Levi ⟋ ')).toBe(true)
    expect(truncate('abc', 5)).toBe('abc')
  })
})
