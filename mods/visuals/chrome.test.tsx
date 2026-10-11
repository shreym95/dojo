import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { AgentInfo, On } from 'claude-code'

// @ts-expect-error the roster is untyped build config (.mjs)
import roster from '../../roster.mjs'
import { agent, slash, spawnInput } from '../lib/testkit'
import { truncate } from '../lib/text'
import { CREW, STRATEGISTS, WORDS } from '../theme'
import { bandLine } from './chrome'
import { BAND_HEADER, CUE_GAP_MS, DEPLOY_MORE, FALL_LINES, HINTS, LONG_TURN_MS, MODELS, SOUNDS, TURN_LONG, USAGE_HOT_LINES, VERBS_MORE } from './chrome-art'
import { cellWidth, clip, framesOf, legible, modelLabel, parseSays, planBand, planUsage, rosterLines, themedModes, usageBar, verbAt } from './chrome-lib'

const PLUGIN = 'dojo'

const SPINNER = { word: 'Sauteing', message: null, suffix: '…', mode: 'requesting' } as const

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
    let status: AgentInfo['status'] = 'running'
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
  test('band line is one line, cut to width', () => {
    const line = bandLine({ key: 'levi', description: 'inspect everything thoroughly', tool: 'Bash: npm test', frame: 1 }, 20)
    expect([...line]).toHaveLength(20)
    expect(line.startsWith('🧹 Levi ⟋ ')).toBe(true)
    expect(truncate('abc', 5)).toBe('abc')
  })
})

// --- the anime makeover ---------------------------------------------------------------------------------------------

const PANE_PROPS = {
  title: 'Dojo roster',
  isFocused: false,
  bodyColumns: 80,
  placement: 'inline',
  scroll: { offset: 0, bodyRows: 20 },
  view: {},
} as const

const HINT_PROPS = { isDraft: false, isWorking: false, hint: '? for shortcuts' } as const

const MODEL_ID = 'claude-sonnet-5-5'

/** Everything beneath the plugin that the chrome touches, recorded. */
function world(on: On, opts: { env?: Record<string, string>; placed?: boolean; noPlayer?: boolean } = {}) {
  const clock = mock.clock(on)
  mock.env(on, opts.env ?? {})
  const rec = { toasts: [] as string[], played: [] as string[], opened: [] as string[], closed: [] as string[], registered: [] as string[] }
  let agents: AgentInfo[] = []
  let n = 0
  on('ui.toast', (_$, e) => {
    rec.toasts.push(e.text)
    return { value: undefined }
  })
  on('audio.play', (_$, e) => {
    if (opts.noPlayer === true) throw new Error('no player')
    rec.played.push(String(e.clip.asset))
    return { value: undefined }
  })
  on('agent.list', () => ({ value: agents }))
  on('agent.spawn', () => ({ model: MODEL_ID, agentId: `ag-${++n}` }))
  on('ui.open', (_$, e) => {
    rec.opened.push(e.id)
    return { value: opts.placed === false ? { isPlaced: false as const, reason: 'narrow' } : { isPlaced: true as const } }
  })
  on('ui.close', (_$, e) => {
    rec.closed.push(e.id)
    return { value: undefined }
  })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', (_$, e) => {
    rec.registered.push(e.name)
    return { value: { command: e.name } } as never
  })
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  return {
    ...rec,
    clock,
    setAgents: (next: AgentInfo[]) => {
      agents = next
    },
  }
}

const done = (agentId: string, answer: string) =>
  ({ answer, durationMs: 1000, isAborted: false, turnId: 't1', agentId, reason: 'answer' }) as const


describe('spinner, themed', () => {
  const mountSpinner = ($: Engine, requestId: string, surface: 'terminal' | 'desktop' = 'terminal') =>
    $.ui.mount({ plugin: PLUGIN, surface, component: 'Spinner', props: SPINNER_PROPS, requestId })

  const bottomSpinner = (on: On) =>
    on('ui.render', { component: 'Spinner' }, ($, e) => {
      const p = e.props as { word: string; suffix: string }
      return $.ui.resolve(e).Text({ children: `${p.word}|${p.suffix}` })
    })

  test('terminal: the crew word keeps its emoji, an animated glyph rides after the ellipsis, the verb moves on', async ($, on) => {
    const w = world(on)
    w.setAgents([agent('ag-levi', 'dojo:levi')])
    bottomSpinner(on)
    const ui = await mountSpinner($, 'ag-levi')
    const first = (await ui.find({ type: 'Text' }))?.text ?? ''
    const [word, suffix] = first.split('|') as [string, string]
    expect(word.startsWith('🧹 ')).toBe(true)
    expect(suffix).toBe('… ⚔')
    await w.clock.advance(400 * 12)
    const later = (await ui.find({ type: 'Text' }))?.text ?? ''
    const [word2, suffix2] = later.split('|') as [string, string]
    expect(word2).not.toBe(word)
    expect([...(WORDS.levi?.verbs ?? []), ...(VERBS_MORE.levi ?? [])].map(v => `🧹 ${v}`)).toContain(word2)
    expect(suffix2).toMatch(/^… \S$/)
    expect(suffix2).not.toBe(suffix)
    await ui.unmount()
  })

  test('the pulse stops by itself once no spinner is drawn', async ($, on) => {
    const w = world(on)
    w.setAgents([])
    bottomSpinner(on)
    const a = await mountSpinner($, 'main')
    const start = (await a.find({ type: 'Text' }))?.text
    await w.clock.advance(400 * 3)
    await a.unmount()
    // a counter that kept running would be 48 pulses (four verbs) further on
    await w.clock.advance(400 * 48)
    const b = await mountSpinner($, 'main')
    expect((await b.find({ type: 'Text' }))?.text.split('|')[0]).toBe(start?.split('|')[0])
    await b.unmount()
  })

  test('desktop: the word is themed, the suffix is left to the engine', async ($, on) => {
    const w = world(on)
    w.setAgents([agent('ag-senku', 'dojo:senku')])
    bottomSpinner(on)
    const ui = await mountSpinner($, 'ag-senku', 'desktop')
    const [word, suffix] = ((await ui.find({ type: 'Text' }))?.text ?? '').split('|') as [string, string]
    expect(word.startsWith('🧪 ')).toBe(true)
    expect(suffix).toBe('…')
    await ui.unmount()
  })

  test('a message in place of the word: the engine line untouched', async ($, on) => {
    const w = world(on)
    w.setAgents([agent('ag-levi', 'dojo:levi')])
    bottomSpinner(on)
    const ui = await $.ui.mount({
      plugin: PLUGIN,
      surface: 'terminal',
      component: 'Spinner',
      props: { ...SPINNER_PROPS, message: 'Compacting conversation' },
      requestId: 'ag-levi',
    })
    expect((await ui.find({ type: 'Text' }))?.text).toBe('Sauteing|…')
    await ui.unmount()
  })

  test('spinners off: untouched', { options: { spinners: false } }, async ($, on) => {
    const w = world(on)
    w.setAgents([agent('ag-levi', 'dojo:levi')])
    bottomSpinner(on)
    const ui = await mountSpinner($, 'ag-levi')
    expect((await ui.find({ type: 'Text' }))?.text).toBe('Sauteing|…')
    await ui.unmount()
  })
})

describe('turn flair, themed', () => {
  const mountTurn = ($: Engine, durationMs: number) =>
    $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'TurnDuration', props: { word: 'Baked', durationMs } })
  const bottomTurn = (on: On) =>
    on('ui.render', { component: 'TurnDuration' }, ($, e) => $.ui.resolve(e).Text({ children: String((e.props as { word: string }).word) }))

  test('a turn past a minute and a half draws from the long-turn pool', async ($, on) => {
    world(on, { env: { DOJO_STRATEGIST: 'lelouch' } })
    bottomTurn(on)
    const long = await mountTurn($, LONG_TURN_MS)
    expect(TURN_LONG.lelouch).toContain((await long.find({ type: 'Text' }))?.text)
    const short = await mountTurn($, 3000)
    expect(WORDS.lelouch?.done).toContain((await short.find({ type: 'Text' }))?.text)
    await long.unmount()
    await short.unmount()
  })

  test('turn flair off: the engine word', { options: { turnFlair: false } }, async ($, on) => {
    world(on, { env: { DOJO_STRATEGIST: 'lelouch' } })
    bottomTurn(on)
    const ui = await mountTurn($, 3000)
    expect((await ui.find({ type: 'Text' }))?.text).toBe('Baked')
    await ui.unmount()
  })
})

describe('band, themed', () => {
  const mountBand = ($: Engine, props: Record<string, unknown> = {}, surface: 'terminal' | 'desktop' = 'terminal') =>
    $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props: { ...BAND_PROPS, ...props } as never })
  const bottomBand = (on: On) => on('ui.render', { component: 'AbovePrompt' }, ($, e) => $.ui.resolve(e).Text({ children: 'ENGINE-BAND' }))

  const crew3 = [
    agent('ag-1', 'dojo:levi', 'running', 'QA the cart'),
    agent('ag-2', 'dojo:senku', 'running', 'build the api'),
    agent('ag-3', 'dojo:robin', 'running', 'write docs'),
  ]
  const deploy3 = async ($: Engine) => {
    for (const a of crew3) await $.agent.spawn(spawnInput(a.type, undefined, a.description))
  }

  test('strategist header, then one row per character in their own color', async ($, on) => {
    const w = world(on, { env: { DOJO_STRATEGIST: 'shikamaru' } })
    w.setAgents(crew3)
    bottomBand(on)
    await deploy3($)
    const ui = await mountBand($)
    const texts = await ui.findAll({ type: 'Text' })
    expect(texts.map(t => t.text)).toEqual(['🦌 Shadow formation: 3 deployed ◐', '🧹 Levi ⚔ QA the cart', '🧪 Senku ⚗ build the api', '🌸 Robin ❀ write docs'])
    expect(texts.map(t => t.props.color)).toEqual(['#5B8C5A', '#708090', '#8BC34A', '#E07AA5'])
    expect(texts[0]?.props.bold).toBe(true)
    // each character animates through its own frames
    await w.clock.advance(250)
    const moved = (await ui.findAll({ type: 'Text' })).map(t => t.text)
    expect(moved.slice(1)).toEqual(['🧹 Levi ⟋ QA the cart', '🧪 Senku ⚛ build the api', '🌸 Robin ✿ write docs'])
    await ui.unmount()
  })

  test('the other strategist has its own header', async ($, on) => {
    const w = world(on, { env: { DOJO_STRATEGIST: 'lelouch' } })
    w.setAgents(crew3.slice(0, 1))
    bottomBand(on)
    await $.agent.spawn(spawnInput('dojo:levi', undefined, 'QA the cart'))
    const ui = await mountBand($)
    expect((await ui.findAll({ type: 'Text' }))[0]?.text).toBe('♟️ Black Knights: 1 deployed ♙')
    await ui.unmount()
  })

  test('the latest tool rides on the row', async ($, on) => {
    const w = world(on)
    w.setAgents(crew3.slice(0, 1))
    bottomBand(on)
    on('tool.call', () => ({ result: 'ok' as never }))
    await $.agent.spawn(spawnInput('dojo:levi', undefined, 'QA the cart'))
    await $.tool.call({ tool: 'Bash', input: { command: 'npm test' }, command: 'npm test', agentId: 'ag-1' } as never)
    const ui = await mountBand($)
    expect((await ui.findAll({ type: 'Text' }))[0]?.text).toBe('🧹 Levi ⚔ QA the cart · Bash: npm test')
    await ui.unmount()
  })

  test('narrow: compact header, every line inside the columns', async ($, on) => {
    const w = world(on, { env: { DOJO_STRATEGIST: 'shikamaru' } })
    w.setAgents(crew3)
    bottomBand(on)
    await deploy3($)
    for (const columns of [30, 24, 12, 6]) {
      const ui = await mountBand($, { bodyColumns: columns })
      const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
      expect(texts.length).toBe(4)
      for (const t of texts) expect(cellWidth(t)).toBeLessThanOrEqual(columns)
      if (columns === 24) expect(texts[0]).toBe('🦌 Shadows: 3 out ◐')
      if (columns === 6) expect(texts[0]).toBe('🦌 3 ◐')
      await ui.unmount()
    }
  })

  test('few rows: a summary line, then a +N more line', async ($, on) => {
    const w = world(on, { env: { DOJO_STRATEGIST: 'shikamaru' } })
    w.setAgents(crew3)
    bottomBand(on)
    await deploy3($)
    const one = await mountBand($, { maxRows: 1 })
    expect((await one.findAll({ type: 'Text' })).map(t => t.text)).toEqual(['🦌 3 out 🧹 🧪 🌸'])
    await one.unmount()
    const three = await mountBand($, { maxRows: 3 })
    expect((await three.findAll({ type: 'Text' })).map(t => t.text)).toEqual(['🦌 Shadow formation: 3 deployed ◐', '🧹 Levi ⚔ QA the cart', '+2 more'])
    await three.unmount()
  })

  test('desktop draws the same band', async ($, on) => {
    const w = world(on, { env: { DOJO_STRATEGIST: 'shikamaru' } })
    w.setAgents(crew3.slice(0, 1))
    bottomBand(on)
    await $.agent.spawn(spawnInput('dojo:levi', undefined, 'QA the cart'))
    const ui = await mountBand($, {}, 'desktop')
    expect((await ui.findAll({ type: 'Text' })).map(t => t.text)).toEqual(['🦌 Shadow formation: 1 deployed ◐', '🧹 Levi ⚔ QA the cart'])
    await ui.unmount()
  })

  test('a survey in the band, or the band off: the engine band', { options: { band: false } }, async ($, on) => {
    const w = world(on)
    w.setAgents(crew3.slice(0, 1))
    bottomBand(on)
    await $.agent.spawn(spawnInput('dojo:levi', undefined, 'd'))
    const ui = await mountBand($)
    expect((await ui.findAll({ type: 'Text' })).map(t => t.text)).toEqual(['ENGINE-BAND'])
    await ui.unmount()
  })
})

describe('usage line', () => {
  type Figures = { percent?: number; limits?: [string, number][]; usd?: number }
  const measure = (f: Figures) => ({
    context: { window: 200_000, ...(f.percent === undefined ? {} : { percent: f.percent, tokens: f.percent * 2000 }) },
    rateLimits: (f.limits ?? []).map(([kind, percentUsed]) => ({ kind, percentUsed })),
    ...(f.usd === undefined ? {} : { cost: { usd: f.usd } }),
    changed: ['context' as const],
  })
  // the engine beneath answers a measurement by echoing which units moved
  const usageWorld = (on: On, opts: Parameters<typeof world>[1] = {}) => {
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    return world(on, opts)
  }
  const mountBand = ($: Engine, props: Record<string, unknown> = {}, surface: 'terminal' | 'desktop' = 'terminal') =>
    $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props: { ...BAND_PROPS, ...props } as never })
  const bottomBand = (on: On) => on('ui.render', { component: 'AbovePrompt' }, ($, e) => $.ui.resolve(e).Text({ children: 'ENGINE-BAND' }))
  /** The row as the plugin drew it: the outer Text's text and each colored run. */
  const rowOf = async (ui: Awaited<ReturnType<typeof mountBand>>, i = 0) => {
    const outer = (await ui.findAll({ type: 'Text' })).filter(t => t.props.wrap === 'truncate-end')[i]
    return outer
  }
  const runs = async (ui: Awaited<ReturnType<typeof mountBand>>) =>
    (await ui.findAll({ type: 'Text' })).filter(t => t.props.wrap !== 'truncate-end').map(t => [t.text, t.props.color] as const)
  const textsOf = async (ui: Awaited<ReturnType<typeof mountBand>>) =>
    (await ui.findAll({ type: 'Text' })).filter(t => t.props.wrap === 'truncate-end' || t.text === 'ENGINE-BAND').map(t => t.text)

  const draw = async ($: Engine, on: On, f: Figures, props: Record<string, unknown> = {}, env: Record<string, string> = { DOJO_STRATEGIST: 'shikamaru' }) => {
    usageWorld(on, { env })
    bottomBand(on)
    await $.session.measure(measure(f) as never)
    return mountBand($, props)
  }

  test('the full line: persona emoji, Chakra bar, Stamina with its window, cost', async ($, on) => {
    const ui = await draw($, on, { percent: 58, limits: [['five_hour', 23]], usd: 1.42 })
    expect(await textsOf(ui)).toEqual(['🦌 Chakra ▰▰▰▰▰▰▱▱▱▱ 58% · Stamina 23% (5h) · 両 $1.42'])
    expect(await runs(ui)).toContainEqual(['▰▰▰▰▰▰▱▱▱▱', '#5B8C5A'])
    await ui.unmount()
  })

  test('the neutral emoji when no persona is on duty; the most-used window wins', async ($, on) => {
    const ui = await draw($, on, { percent: 10, limits: [['five_hour', 23.4], ['seven_day', 61.6], ['spend_limit', 2]] }, {}, {})
    expect(await textsOf(ui)).toEqual(['🎴 Chakra ▰▱▱▱▱▱▱▱▱▱ 10% · Stamina 62% (7d)'])
    await ui.unmount()
  })

  test('a segment with no data is left out', async ($, on) => {
    const noLimits = await draw($, on, { percent: 58, usd: 1.42 })
    expect(await textsOf(noLimits)).toEqual(['🦌 Chakra ▰▰▰▰▰▰▱▱▱▱ 58% · 両 $1.42'])
    await noLimits.unmount()
  })

  test('no cost: no ryō segment', async ($, on) => {
    const ui = await draw($, on, { percent: 58, limits: [['five_hour', 23]] })
    expect(await textsOf(ui)).toEqual(['🦌 Chakra ▰▰▰▰▰▰▱▱▱▱ 58% · Stamina 23% (5h)'])
    await ui.unmount()
  })

  test('context fill not known yet: Chakra —', async ($, on) => {
    const ui = await draw($, on, { limits: [['five_hour', 23]], usd: 0.5 })
    expect(await textsOf(ui)).toEqual(['🦌 Chakra — · Stamina 23% (5h) · 両 $0.50'])
    await ui.unmount()
  })

  test('nothing known: no row, the engine band stays', async ($, on) => {
    const ui = await draw($, on, {})
    expect(await textsOf(ui)).toEqual(['ENGINE-BAND'])
    await ui.unmount()
  })

  test('colors: strategist below 60, warning to 84, error from 85, with the persona line at 85', async ($, on) => {
    usageWorld(on, { env: { DOJO_STRATEGIST: 'shikamaru' } })
    bottomBand(on)
    const cases: [number, string, string | undefined][] = [
      [59, '#5B8C5A', undefined],
      [60, 'warning', undefined],
      [84, 'warning', undefined],
      [85, 'error', USAGE_HOT_LINES.shikamaru?.context],
      [100, 'error', USAGE_HOT_LINES.shikamaru?.context],
    ]
    for (const [percent, color, line] of cases) {
      await $.session.measure(measure({ percent }) as never)
      const ui = await mountBand($)
      const bar = (await runs(ui)).find(([t]) => t.startsWith('▰') || t.startsWith('▱'))
      expect(bar?.[1], `${percent}%`).toBe(color)
      const text = (await textsOf(ui))[0] ?? ''
      if (line === undefined) expect(text).not.toContain('Mendokus')
      else expect(text.endsWith(` · ${line}`), text).toBe(true)
      await ui.unmount()
    }
  })

  test('Stamina has the same thresholds, and its own line', async ($, on) => {
    usageWorld(on, { env: { DOJO_STRATEGIST: 'lelouch' } })
    bottomBand(on)
    await $.session.measure(measure({ percent: 20, limits: [['five_hour', 90]] }) as never)
    const ui = await mountBand($)
    expect(await runs(ui)).toContainEqual(['90%', 'error'])
    expect(await runs(ui)).toContainEqual(['▰▰▱▱▱▱▱▱▱▱', legible(STRATEGISTS.lelouch?.color ?? '')])
    expect((await textsOf(ui))[0]).toBe(`♟️ Chakra ▰▰▱▱▱▱▱▱▱▱ 20% · Stamina 90% (5h) · ${USAGE_HOT_LINES.lelouch?.stamina}`)
    await ui.unmount()
  })

  test('the neutral persona has its own hot line', async ($, on) => {
    const ui = await draw($, on, { percent: 92 }, {}, {})
    expect((await textsOf(ui))[0]).toBe('🎴 Chakra ▰▰▰▰▰▰▰▰▰▰ 92% · Compact soon')
    await ui.unmount()
  })

  test('narrow: the compact form, inside the columns', async ($, on) => {
    const ui = await draw($, on, { percent: 58, limits: [['five_hour', 23]], usd: 1.42 }, { bodyColumns: 40 })
    expect(await textsOf(ui)).toEqual(['🦌 ▰▰▰▱ 58% · 23%'])
    await ui.unmount()
    for (const columns of [49, 30, 12, 6, 2]) {
      const again = await mountBand($, { bodyColumns: columns })
      const rows = await textsOf(again)
      expect(rows.length).toBe(1)
      for (const r of rows) expect(cellWidth(r), `${columns}`).toBeLessThanOrEqual(columns)
      await again.unmount()
    }
  })

  test('mid width drops the warning, then the cost, before the compact form', async ($, on) => {
    const ui = await draw($, on, { percent: 90, limits: [['five_hour', 23]], usd: 1.42 }, { bodyColumns: 100 })
    expect(await textsOf(ui)).toEqual(['🦌 Chakra ▰▰▰▰▰▰▰▰▰▱ 90% · Stamina 23% (5h) · 両 $1.42 · Mendokusē… compact soon'])
    await ui.unmount()
    const noHot = await mountBand($, { bodyColumns: 70 })
    expect(await textsOf(noHot)).toEqual(['🦌 Chakra ▰▰▰▰▰▰▰▰▰▱ 90% · Stamina 23% (5h) · 両 $1.42'])
    await noHot.unmount()
    const noCost = await mountBand($, { bodyColumns: 54 })
    expect(await textsOf(noCost)).toEqual(['🦌 Chakra ▰▰▰▰▰▰▰▰▰▱ 90% · Stamina 23% (5h)'])
    await noCost.unmount()
  })

  test('the crew band still draws below the usage row, in what room is left', async ($, on) => {
    const w = usageWorld(on, { env: { DOJO_STRATEGIST: 'shikamaru' } })
    w.setAgents([agent('ag-1', 'dojo:levi', 'running', 'QA the cart')])
    bottomBand(on)
    await $.session.measure(measure({ percent: 58, usd: 1.42 }) as never)
    await $.agent.spawn(spawnInput('dojo:levi', undefined, 'QA the cart'))
    const ui = await mountBand($)
    expect(await textsOf(ui)).toEqual(['🦌 Chakra ▰▰▰▰▰▰▱▱▱▱ 58% · 両 $1.42', '🦌 Shadow formation: 1 deployed ◐', '🧹 Levi ⚔ QA the cart'])
    await ui.unmount()
    // one row to spare: the crew keeps it
    const tight = await mountBand($, { maxRows: 1 })
    expect(await textsOf(tight)).toEqual(['🦌 1 out 🧹'])
    await tight.unmount()
  })

  test('before any measurement the line is seeded from the session usage', async ($, on) => {
    usageWorld(on, { env: { DOJO_STRATEGIST: 'shikamaru' } })
    bottomBand(on)
    on('session.usage', () => ({ value: { startedAt: 0, ...measure({ percent: 30, limits: [['five_hour', 5]], usd: 0.1 }) } }) as never)
    const ui = await mountBand($)
    expect(await textsOf(ui)).toEqual(['🦌 Chakra ▰▰▰▱▱▱▱▱▱▱ 30% · Stamina 5% (5h) · 両 $0.10'])
    await ui.unmount()
  })

  test('desktop draws the same row', async ($, on) => {
    usageWorld(on, { env: { DOJO_STRATEGIST: 'shikamaru' } })
    bottomBand(on)
    await $.session.measure(measure({ percent: 58 }) as never)
    const ui = await mountBand($, {}, 'desktop')
    expect(await textsOf(ui)).toEqual(['🦌 Chakra ▰▰▰▰▰▰▱▱▱▱ 58%'])
    await ui.unmount()
  })

  test('a survey in the band: the engine band', async ($, on) => {
    const ui = await draw($, on, { percent: 58 }, { hasSurvey: true })
    expect(await textsOf(ui)).toEqual(['ENGINE-BAND'])
    await ui.unmount()
  })

  test('a usage lookup that throws leaves the engine band', async ($, on) => {
    usageWorld(on)
    bottomBand(on)
    on('session.usage', () => {
      throw new Error('no ledger')
    })
    const ui = await mountBand($)
    expect(await textsOf(ui)).toEqual(['ENGINE-BAND'])
    await ui.unmount()
  })

  test('usageLine off: unchanged, with or without crew', { options: { usageLine: false } }, async ($, on) => {
    const w = usageWorld(on, { env: { DOJO_STRATEGIST: 'shikamaru' } })
    w.setAgents([agent('ag-1', 'dojo:levi', 'running', 'QA the cart')])
    bottomBand(on)
    await $.session.measure(measure({ percent: 58, usd: 1.42 }) as never)
    const plain = await mountBand($)
    expect(await textsOf(plain)).toEqual(['ENGINE-BAND'])
    await plain.unmount()
    await $.agent.spawn(spawnInput('dojo:levi', undefined, 'QA the cart'))
    const ui = await mountBand($)
    expect(await textsOf(ui)).toEqual(['🦌 Shadow formation: 1 deployed ◐', '🧹 Levi ⚔ QA the cart'])
    await ui.unmount()
  })

  test('helpers: the bar rounds up to a cell, clamps, and the plan is empty when nothing is known', () => {
    expect(usageBar(0, 10)).toBe('▱▱▱▱▱▱▱▱▱▱')
    expect(usageBar(1, 10)).toBe('▰▱▱▱▱▱▱▱▱▱')
    expect(usageBar(130, 4)).toBe('▰▰▰▰')
    expect(usageBar(-5, 4)).toBe('▱▱▱▱')
    expect(planUsage({ persona: null, usage: { percent: null, limit: null, usd: null }, columns: 80 })).toBeUndefined()
  })
})

describe('prompt chrome', () => {
  const mountHint = ($: Engine, props: Record<string, unknown> = {}, surface: 'terminal' | 'desktop' = 'terminal') =>
    $.ui.mount({ plugin: PLUGIN, surface, component: 'PromptHint', props: { ...HINT_PROPS, ...props } as never })
  const bottomHint = (on: On) =>
    on('ui.render', { component: 'PromptHint' }, ($, e) => {
      const p = e.props as { hint: string; tail?: string }
      return $.ui.resolve(e).Text({ children: `${p.hint}|${p.tail ?? ''}` })
    })
  const bottomModes = (on: On) =>
    on('ui.render', { component: 'SessionMode' }, ($, e) => $.ui.resolve(e).Text({ children: (e.props as { modes: string[] }).modes.join('|') }))

  test('the hint keeps the engine line and gains the strategist tail, by what the prompt is doing', async ($, on) => {
    world(on, { env: { DOJO_STRATEGIST: 'shikamaru' } })
    bottomHint(on)
    for (const [props, pool] of [
      [{}, HINTS.shikamaru?.idle],
      [{ isDraft: true }, HINTS.shikamaru?.draft],
      [{ isWorking: true, hint: 'esc to interrupt' }, HINTS.shikamaru?.working],
    ] as const) {
      const ui = await mountHint($, props)
      const [hint, tail] = ((await ui.find({ type: 'Text' }))?.text ?? '').split('|') as [string, string]
      expect(hint).toBe((props as { hint?: string }).hint ?? '? for shortcuts')
      expect(tail.startsWith('· 🦌 ')).toBe(true)
      expect(pool).toContain(tail.slice('· 🦌 '.length))
      await ui.unmount()
    }
  })

  test('the tail rotates with the turn', async ($, on) => {
    world(on, { env: { DOJO_STRATEGIST: 'lelouch' } })
    on('prompt.submit', () => ({ text: 'hi' }) as never)
    bottomHint(on)
    const seenTails = new Set<string>()
    for (let i = 0; i < 4; i++) {
      await $.prompt.submit({ text: 'hi', wait: false, origin: { kind: 'composer' } })
      const ui = await mountHint($)
      seenTails.add(((await ui.find({ type: 'Text' }))?.text ?? '').split('|')[1] ?? '')
      await ui.unmount()
    }
    expect(seenTails.size).toBeGreaterThan(1)
  })

  test('desktop draws no tail, so the hint passes through', async ($, on) => {
    world(on, { env: { DOJO_STRATEGIST: 'shikamaru' } })
    bottomHint(on)
    const ui = await mountHint($, {}, 'desktop')
    expect((await ui.find({ type: 'Text' }))?.text).toBe('? for shortcuts|')
    await ui.unmount()
  })

  test('no persona: no tail', async ($, on) => {
    world(on)
    bottomHint(on)
    const ui = await mountHint($)
    expect((await ui.find({ type: 'Text' }))?.text).toBe('? for shortcuts|')
    await ui.unmount()
  })

  test('promptChrome off: hint and modes untouched', { options: { promptChrome: false } }, async ($, on) => {
    world(on, { env: { DOJO_STRATEGIST: 'shikamaru' } })
    bottomHint(on)
    bottomModes(on)
    const hint = await mountHint($)
    expect((await hint.find({ type: 'Text' }))?.text).toBe('? for shortcuts|')
    const modes = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'SessionMode', props: { modes: ['focus'] } })
    expect((await modes.find({ type: 'Text' }))?.text).toBe('focus')
    await hint.unmount()
    await modes.unmount()
  })

  test('session modes keep their names; the themed label sits beside, the badge follows', async ($, on) => {
    world(on, { env: { DOJO_STRATEGIST: 'shikamaru' } })
    bottomModes(on)
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'SessionMode', props: { modes: ['focus', 'memory paused', 'plan'] } })
      expect((await ui.find({ type: 'Text' }))?.text).toBe('focus · 🦌 shadow stance|memory paused · 🦌 clouds drifting|plan|🦌 Shikamaru')
      await ui.unmount()
    }
  })

  test('session modes with none set show the badge alone; with no persona nothing changes', async ($, on) => {
    world(on, { env: { DOJO_STRATEGIST: 'lelouch' } })
    bottomModes(on)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'SessionMode', props: { modes: [] } })
    expect((await ui.find({ type: 'Text' }))?.text).toBe('♟️ Lelouch')
    await ui.unmount()
    expect(themedModes(null, ['focus'])).toEqual(['focus'])
  })
})

describe('/dojo roster', () => {
  const mountPane = ($: Engine, props: Record<string, unknown> = {}, surface: 'terminal' | 'mobile' = 'terminal') =>
    $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', props: { ...PANE_PROPS, ...props } as never, requestId: 'dojo-roster' })
  const bottomPane = (on: On) => on('ui.render', { component: 'Pane' }, ($, e) => $.ui.resolve(e).Text({ children: 'ENGINE-PANE' }))
  const lines = async (ui: Awaited<ReturnType<typeof mountPane>>) => (await ui.findAll({ type: 'Text' })).map(t => t.text)

  test('registers in an interactive session and opens the pane; headless it is not registered', async ($, on) => {
    const w = world(on)
    await $.session.start({ cwd: '/x', surface: null, isInteractive: false })
    expect(w.registered).not.toContain('dojo')
    await $.session.start({ cwd: '/x', surface: 'terminal', isInteractive: true })
    expect(w.registered).toContain('dojo')
    const ran = await $.command.run(slash('dojo'))
    expect(w.opened).toEqual(['dojo-roster'])
    expect(ran.text).toBeUndefined()
  })

  test('a pane that cannot be placed falls back to the roster as text', async ($, on) => {
    world(on, { placed: false, env: { DOJO_STRATEGIST: 'lelouch' } })
    const ran = await $.command.run(slash('dojo'))
    expect(ran.text).toContain('♟️ Lelouch on duty')
    expect(ran.text).toContain('Senku')
    expect(ran.text).toContain('idle')
  })

  test('rosterPane off: no command, no pane', { options: { rosterPane: false } }, async ($, on) => {
    const w = world(on)
    bottomPane(on)
    on('command.run', (_$, e) => ({ text: `engine ${e.command}` }))
    await $.session.start({ cwd: '/x', surface: 'terminal', isInteractive: true })
    expect(w.registered).not.toContain('dojo')
    expect((await $.command.run(slash('dojo'))).text).toBe('engine dojo')
    expect(w.opened).toEqual([])
    const ui = await mountPane($)
    expect(await lines(ui)).toEqual(['ENGINE-PANE'])
    await ui.unmount()
  })

  test('strategist, voice level and every crew member idle at the start', async ($, on) => {
    world(on, { env: { DOJO_STRATEGIST: 'shikamaru' } })
    bottomPane(on)
    const ui = await mountPane($)
    const out = await lines(ui)
    expect(out.slice(0, 3)).toEqual(['🦌 Shikamaru on duty', 'voice: medium (roster default) · opus 5.5', 'crew: 0 running · 0 returned · 0 fell · 6 idle'])
    for (const c of Object.values(CREW)) {
      const row = out.find(l => l.includes(c.name) && l.includes(c.role))
      expect(row).toBeDefined()
      expect(row).toContain(c.emoji)
      expect(row).toContain('idle')
      expect(row).toContain(modelLabel(MODELS[c.key] ?? ''))
    }
    expect(out.find(l => l.includes('Senku'))).toContain('sonnet 5.5')
    expect(out.find(l => l.includes('Levi'))).toContain('haiku 4.5')
    expect((await ui.find({ type: 'Button' }))?.props.label).toBe('close')
    await ui.unmount()
  })

  test('a voice override shows, and no strategist on duty says so', async ($, on) => {
    world(on)
    bottomPane(on)
    on('command.run', (_$, e) => ({ text: e.command }))
    await $.command.run(slash('dojo-voice', 'full'))
    const ui = await mountPane($)
    expect((await lines(ui)).slice(0, 2)).toEqual(['No strategist on duty', 'voice: full (override)'])
    await ui.unmount()
  })

  test('running, returned and fell, with the last Says line and the toast that carries it', async ($, on) => {
    const w = world(on, { env: { DOJO_STRATEGIST: 'shikamaru' } })
    bottomPane(on)
    const running = [agent('ag-1', 'dojo:levi', 'running', 'QA the cart'), agent('ag-2', 'dojo:senku', 'running', 'build the api'), agent('ag-3', 'dojo:robin', 'running', 'docs')]
    w.setAgents(running)
    for (const t of ['dojo:levi', 'dojo:senku', 'dojo:robin']) await $.agent.spawn(spawnInput(t, undefined, 'd'))
    await w.clock.advance(1000)
    await $.turn.complete(done('ag-1', 'Verdict: PASS\nSays: "Mostly clean. Fix the corner I marked."'))
    w.setAgents([agent('ag-1', 'dojo:levi', 'completed', 'QA the cart'), agent('ag-2', 'dojo:senku', 'failed', 'build the api'), running[2] as AgentInfo])
    await w.clock.advance(1000)

    const ui = await mountPane($)
    const out = await lines(ui)
    expect(out[2]).toBe('crew: 1 running · 1 returned · 1 fell · 3 idle')
    expect(out.find(l => l.includes('Levi'))).toMatch(/✔ returned/)
    expect(out).toContain('   “Mostly clean. Fix the corner I marked.”')
    expect(out.find(l => l.includes('Senku'))).toMatch(/✖ fell/)
    expect(out).toContain(`   ${FALL_LINES.senku}`)
    expect(out.find(l => l.includes('Robin'))).toMatch(/running\s+docs/)
    expect(out.find(l => l.includes('Sanji'))).toContain('idle')
    expect(w.toasts).toContain('🧹 Levi returned — "Mostly clean. Fix the corner I marked."')
    expect(w.toasts).toContain('💀 Senku fell')
    await ui.unmount()
  })

  test('a second run of one character counts and shows ×2', async ($, on) => {
    const w = world(on)
    bottomPane(on)
    for (const id of ['ag-1', 'ag-2']) {
      w.setAgents([agent(id, 'dojo:levi', 'running')])
      await $.agent.spawn(spawnInput('dojo:levi', undefined, 'd'))
      await w.clock.advance(1000)
      w.setAgents([agent(id, 'dojo:levi', 'completed')])
      await w.clock.advance(1000)
    }
    const ui = await mountPane($)
    expect((await lines(ui)).find(l => l.includes('Levi'))).toContain('returned ×2')
    await ui.unmount()
  })

  test('dismiss: the close button closes the pane', async ($, on) => {
    const w = world(on)
    bottomPane(on)
    const ui = await mountPane($)
    await ui.press({ key: 'close' })
    expect(w.closed).toEqual(['dojo-roster'])
    await ui.unmount()
  })

  test('narrow widths: every line inside the pane, the crew still all there', async ($, on) => {
    world(on, { env: { DOJO_STRATEGIST: 'lelouch' } })
    bottomPane(on)
    for (const columns of [100, 64, 50, 36, 30, 20, 12]) {
      const ui = await mountPane($, { bodyColumns: columns })
      const out = await lines(ui)
      for (const l of out) expect(cellWidth(l)).toBeLessThanOrEqual(columns)
      if (columns >= 30) expect(out[2]).toContain('idle')
      for (const c of Object.values(CREW)) expect(out.some(l => l.includes(c.emoji) && l.includes(c.name.slice(0, 1)))).toBe(true)
      await ui.unmount()
    }
  })

  test('mobile draws the pane too', async ($, on) => {
    world(on, { env: { DOJO_STRATEGIST: 'shikamaru' } })
    bottomPane(on)
    const ui = await mountPane($, {}, 'mobile')
    expect((await lines(ui))[0]).toBe('🦌 Shikamaru on duty')
    expect((await ui.find({ type: 'Button' }))?.props.label).toBe('close')
    await ui.unmount()
  })
})

describe('sounds', () => {
  test('deploy, return and fall each play their own file', async ($, on) => {
    const w = world(on)
    w.setAgents([agent('ag-1', 'dojo:levi'), agent('ag-2', 'dojo:senku')])
    await $.agent.spawn(spawnInput('dojo:levi', undefined, 'd'))
    expect(w.played).toEqual([SOUNDS.deploy])
    await w.clock.advance(1000)
    w.setAgents([agent('ag-1', 'dojo:levi', 'completed'), agent('ag-2', 'dojo:senku')])
    await w.clock.advance(300)
    expect(w.played).toEqual([SOUNDS.deploy, SOUNDS.return])
    await w.clock.advance(1000)
    await $.agent.spawn(spawnInput('dojo:senku', undefined, 'd'))
    await w.clock.advance(1000)
    w.setAgents([agent('ag-1', 'dojo:levi', 'completed'), agent('ag-2', 'dojo:senku', 'failed')])
    await w.clock.advance(300)
    expect(w.played.slice(-1)).toEqual([SOUNDS.fall])
  })

  test('never more than one cue per 500 ms', async ($, on) => {
    const w = world(on)
    w.setAgents([])
    await Promise.all([
      $.agent.spawn(spawnInput('dojo:levi', undefined, 'a')),
      $.agent.spawn(spawnInput('dojo:senku', undefined, 'b')),
      $.agent.spawn(spawnInput('dojo:robin', undefined, 'c')),
    ])
    expect(w.played).toEqual([SOUNDS.deploy])
    await w.clock.advance(CUE_GAP_MS - 1)
    await $.agent.spawn(spawnInput('dojo:l', undefined, 'd'))
    expect(w.played).toHaveLength(1)
    await w.clock.advance(1)
    await $.agent.spawn(spawnInput('dojo:light', undefined, 'e'))
    expect(w.played).toHaveLength(2)
  })

  test('sounds off: silence, toasts still show', { options: { sounds: false } }, async ($, on) => {
    const w = world(on)
    w.setAgents([])
    await $.agent.spawn(spawnInput('dojo:levi', undefined, 'a'))
    expect(w.played).toEqual([])
    expect(w.toasts).toHaveLength(1)
  })

  test('a clip that cannot play does not disturb the deploy', async ($, on) => {
    const w = world(on, { noPlayer: true })
    w.setAgents([])
    const ran = await $.agent.spawn(spawnInput('dojo:levi', undefined, 'a'))
    expect(ran.agentId).toBeDefined()
    expect(w.toasts).toHaveLength(1)
  })
})

describe('toast lines', () => {
  test('the deploy line rotates through the character set, the first being the original', async ($, on) => {
    const w = world(on)
    w.setAgents([])
    for (let i = 0; i < 3; i++) await $.agent.spawn(spawnInput('dojo:levi', undefined, 'a'))
    expect(w.toasts).toEqual([
      '🧹 Levi deployed — "Chi. Show me the mess."',
      `🧹 Levi deployed — "${DEPLOY_MORE.levi?.[0]}"`,
      `🧹 Levi deployed — "${DEPLOY_MORE.levi?.[1]}"`,
    ])
  })

  test('a report with no Says line adds nothing to the return toast', async ($, on) => {
    const w = world(on)
    w.setAgents([agent('ag-1', 'dojo:levi')])
    await $.agent.spawn(spawnInput('dojo:levi', undefined, 'a'))
    await w.clock.advance(1000)
    await $.turn.complete(done('ag-1', 'Verdict: PASS'))
    w.setAgents([agent('ag-1', 'dojo:levi', 'completed')])
    await w.clock.advance(300)
    expect(w.toasts.slice(1)).toEqual(['🧹 Levi returned'])
  })
})

describe('chrome helpers and art', () => {
  test('cell width: emoji and CJK take two, selectors none', () => {
    expect(cellWidth('abc')).toBe(3)
    expect(cellWidth('🧹')).toBe(2)
    expect(cellWidth('♟️')).toBe(2)
    expect(cellWidth('ア')).toBe(2)
    expect(cellWidth('é')).toBe(1)
    expect(clip('🧹 Levi wipes the counter', 10)).toBe('🧹 Levi w…')
    expect(cellWidth(clip('🧹 Levi wipes the counter', 10))).toBeLessThanOrEqual(10)
    expect(clip('short', 10)).toBe('short')
    expect(clip('x', 0)).toBe('')
  })

  test('legible lifts dark colors to a readable luminance and leaves light ones', () => {
    expect(legible('#8BC34A')).toBe('#8BC34A')
    expect(legible('#E0E0E0')).toBe('#E0E0E0')
    for (const dark of ['#6A0DAD', '#1E3A8A', '#2F4F4F', '#4B3B6B']) {
      const out = legible(dark)
      expect(out).not.toBe(dark)
      expect(out).toMatch(/^#[0-9A-F]{6}$/)
    }
    expect(legible('red')).toBe('red')
  })

  test('the strategist header for a dark persona color is lifted', () => {
    const [header] = planBand({ persona: 'lelouch', rows: [{ key: 'levi', description: 'x' }], frame: 0, columns: 80, maxRows: 5 })
    expect(header?.[0]?.color).toBe(legible(STRATEGISTS.lelouch?.color ?? ''))
    expect(header?.[0]?.color).not.toBe(STRATEGISTS.lelouch?.color)
  })

  test('parseSays takes the last Says line without its quotes', () => {
    expect(parseSays('Done: x\nSays: "Served. Merorin~ (swooning)"')).toBe('Served. Merorin~ (swooning)')
    expect(parseSays('Says: “first”\nSays: second')).toBe('second')
    expect(parseSays('- Says: "listed"')).toBe('listed')
    expect(parseSays('no line here')).toBeUndefined()
    expect(parseSays('Says: ""')).toBeUndefined()
    expect(parseSays(`Says: ${'x'.repeat(300)}`)?.length).toBe(120)
  })

  test('model labels', () => {
    expect(modelLabel('claude-opus-5-5')).toBe('opus 5.5')
    expect(modelLabel('claude-haiku-4-5-20251001')).toBe('haiku 4.5')
    expect(modelLabel('custom')).toBe('custom')
  })

  test('the first verb of a turn is the original pool pick; later steps walk the longer pool', () => {
    const base = WORDS.sanji?.verbs ?? []
    const first = verbAt('sanji', 0, 'ag-x', 0)
    expect(base).toContain(first)
    const walked = new Set(Array.from({ length: base.length + (VERBS_MORE.sanji?.length ?? 0) }, (_, i) => verbAt('sanji', 0, 'ag-x', i)))
    expect(walked.size).toBe(base.length + (VERBS_MORE.sanji?.length ?? 0))
  })

  test('art covers every character with single-width frames and short lines', () => {
    for (const key of [...Object.keys(CREW), ...Object.keys(STRATEGISTS), 'strategist']) {
      const frames = framesOf(key)
      expect(frames.length).toBeGreaterThanOrEqual(8)
      expect(frames.slice(0, 4)).toEqual(WORDS[key]?.frames)
      for (const f of frames) expect(cellWidth(f)).toBe(1)
      expect((VERBS_MORE[key] ?? []).length).toBeGreaterThanOrEqual(3)
      for (const v of [...(WORDS[key]?.verbs ?? []), ...(VERBS_MORE[key] ?? [])]) expect(v.length).toBeLessThanOrEqual(34)
    }
    for (const key of Object.keys(CREW)) {
      expect((DEPLOY_MORE[key] ?? []).length).toBeGreaterThanOrEqual(3)
      for (const line of DEPLOY_MORE[key] ?? []) expect(line.length).toBeLessThanOrEqual(40)
      expect(FALL_LINES[key]).toBeDefined()
      expect(MODELS[key]).toMatch(/^claude-/)
    }
    for (const key of Object.keys(STRATEGISTS)) {
      expect(BAND_HEADER[key]?.full).toContain('{n}')
      expect(BAND_HEADER[key]?.compact).toContain('{n}')
      for (const pool of Object.values(HINTS[key] ?? {})) for (const line of pool) expect(line.length).toBeLessThanOrEqual(36)
      expect((TURN_LONG[key] ?? []).length).toBeGreaterThan(0)
    }
    expect(MODELS.strategist).toBe('claude-opus-5-5')
    // pad glyph rows to be safe about the roster layout: names and roles stay plain ASCII
    for (const c of Object.values(CREW)) expect(`${c.name}${c.role}`).toMatch(/^[\x20-\x7e]+$/)
  })

  test('sound cues are small wav files in assets/sounds', () => {
    for (const file of Object.values(SOUNDS)) expect(file).toMatch(/^assets\/sounds\/[a-z]+\.wav$/)
    expect(new Set(Object.values(SOUNDS)).size).toBe(3)
  })

  test('the roster copy matches roster.mjs', () => {
    const agents = (roster as { agents: Record<string, { model: string }> }).agents
    for (const [key, a] of Object.entries(agents)) expect(MODELS[key]).toBe(a.model)
    expect(Object.keys(agents).sort()).toEqual(Object.keys(MODELS).sort())
  })

  test('the roster plan is plain lines even for a lone character', () => {
    const out = rosterLines({ persona: null, voice: null, entries: {}, frame: 0, columns: 80 })
    expect(out.length).toBeGreaterThan(Object.keys(CREW).length)
  })
})
