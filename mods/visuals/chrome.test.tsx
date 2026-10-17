import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { AgentInfo, On } from 'claude-code'

// @ts-expect-error the roster is untyped build config (.mjs)
import roster from '../../roster.mjs'
import { agent, slash, spawnInput } from '../lib/testkit'
import { truncate } from '../lib/text'
import { CREW, STRATEGISTS, WORDS } from '../theme'
import { bandLine } from './chrome'
import { CUE_GAP_MS, DEPLOY_MORE, FALL_LINES, LONG_TURN_MS, MODELS, RETURN_TOAST, SOUNDS, TURN_LONG, USAGE_HOT_LINES, VERBS_MORE } from './chrome-art'
import { cellWidth, clip, framesOf, legible, modelLabel, parseSays, planBand, planUsage, rosterLines, themedModes, usageBar, verbAt } from './chrome-lib'
import {
  GALLERY_ORDER,
  RANK_LADDERS,
  RANK_STEPS,
  RANK_UP_LINES,
  RECAP_SIGNOFFS,
  SAYS_SAMPLES,
  USAGE_BARS,
} from './chrome-art'
import {
  addStats,
  agentTokens,
  barGlyphs,
  fmtDuration,
  fmtTokens,
  galleryKey,
  galleryLines,
  mostDeployed,
  rankLine,
  rankOf,
  rankUpText,
  recapLines,
  recapText,
  stepTokens,
  tint,
  wrapWords,
} from './chrome-lib'
import { BANNERS } from './transcript-art'
import { accentFor, colorFor } from '../theme'

const PLUGIN = 'dojo'

const SPINNER = { word: 'Sauteing', message: null, suffix: '…', mode: 'requesting' } as const

// Beneath the plugins stands the engine: a bottom ui.render hook draws the props it was handed as text.
const SPINNER_PROPS = SPINNER
/** A crew row as the plugin draws it at 80 columns: the left text, then the right column ending one cell short of the edge. */
const band80 = (left: string, right = '0s') => left + ' '.repeat(79 - cellWidth(left) - cellWidth(right)) + right
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
    const rows = (await ui.findAll({ type: 'Text' })).filter(t => t.props.wrap === 'truncate-end')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.text).toMatch(/^\S 🧹 Levi {5}QA the cart {2,}0s$/)
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
    expect(toasts).toEqual(['🧹 Levi deployed — “Chi. Show me the mess.”', '🧪 Senku deployed — “Ten billion percent doable.”'])
    status = 'completed'
    await clock.advance(300)
    expect(toasts.slice(2).sort()).toEqual([`💀 Senku fell — “${FALL_LINES.senku}”`, `🧹 Levi returned — “${RETURN_TOAST.levi?.[0]}”`])
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

  test('one row per character in their own color, no header', async ($, on) => {
    const w = world(on, { env: { DOJO_STRATEGIST: 'shikamaru' } })
    w.setAgents(crew3)
    bottomBand(on)
    await deploy3($)
    const ui = await mountBand($)
    const texts = await ui.findAll({ type: 'Text' })
    const rowsOf = (all: typeof texts) => all.filter(t => t.props.wrap === 'truncate-end').map(t => t.text)
    expect(rowsOf(texts)).toEqual([
      band80('⚔ 🧹 Levi     QA the cart'),
      band80('⚗ 🧪 Senku    build the api'),
      band80('❀ 🌸 Robin    write docs'),
    ])
    // the glyph-and-emoji run and the name run of each row, all in the character's color
    expect(texts.filter(t => t.props.color !== undefined).map(t => t.props.color)).toEqual(['#708090', '#708090', '#8BC34A', '#8BC34A', '#E07AA5', '#E07AA5'])
    expect(texts.find(t => t.text.trim() === 'Levi')?.props.bold).toBe(true)
    // each character animates through its own frames
    await w.clock.advance(250)
    const moved = rowsOf(await ui.findAll({ type: 'Text' }))
    expect(moved).toEqual([band80('⟋ 🧹 Levi     QA the cart'), band80('⚛ 🧪 Senku    build the api'), band80('✿ 🌸 Robin    write docs')])
    await ui.unmount()
  })

  test('the other strategist draws the same rows, no header', async ($, on) => {
    const w = world(on, { env: { DOJO_STRATEGIST: 'lelouch' } })
    w.setAgents(crew3.slice(0, 1))
    bottomBand(on)
    await $.agent.spawn(spawnInput('dojo:levi', undefined, 'QA the cart'))
    const ui = await mountBand($)
    expect((await ui.findAll({ type: 'Text' })).map(t => t.text)[0]).toBe(band80('⚔ 🧹 Levi     QA the cart'))
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
    expect((await ui.findAll({ type: 'Text' }))[0]?.text).toBe(band80('⚔ 🧹 Levi     QA the cart · Bash'))
    await ui.unmount()
  })

  test('narrow: every line inside the columns', async ($, on) => {
    const w = world(on, { env: { DOJO_STRATEGIST: 'shikamaru' } })
    w.setAgents(crew3)
    bottomBand(on)
    await deploy3($)
    for (const columns of [30, 24, 12, 6]) {
      const ui = await mountBand($, { bodyColumns: columns })
      const texts = (await ui.findAll({ type: 'Text' })).filter(t => t.props.wrap === 'truncate-end').map(t => t.text)
      expect(texts.length).toBe(3)
      for (const t of texts) expect(cellWidth(t)).toBeLessThanOrEqual(columns)
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
    const two = await mountBand($, { maxRows: 2 })
    expect((await two.findAll({ type: 'Text' })).filter(t => t.props.wrap === 'truncate-end').map(t => t.text)).toEqual([
      band80('⚔ 🧹 Levi     QA the cart'),
      '+2 more',
    ])
    await two.unmount()
  })

  test('desktop draws the same band', async ($, on) => {
    const w = world(on, { env: { DOJO_STRATEGIST: 'shikamaru' } })
    w.setAgents(crew3.slice(0, 1))
    bottomBand(on)
    await $.agent.spawn(spawnInput('dojo:levi', undefined, 'QA the cart'))
    const ui = await mountBand($, {}, 'desktop')
    expect((await ui.findAll({ type: 'Text' })).filter(t => t.props.wrap === 'truncate-end').map(t => t.text)).toEqual([
      band80('⚔ 🧹 Levi     QA the cart'),
    ])
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
    expect(await textsOf(ui)).toEqual(['🦌 Chakra ≋≋≋≋≋≋∙∙∙∙ 58% · 両 $1.42'])
    expect(await runs(ui)).toContainEqual(['≋≋≋≋≋≋∙∙∙∙', '#5B8C5A'])
    await ui.unmount()
  })

  test('the neutral emoji when no persona is on duty; the most-used window wins', async ($, on) => {
    const ui = await draw($, on, { percent: 10, limits: [['five_hour', 23.4], ['seven_day', 61.6], ['spend_limit', 2]] }, {}, {})
    expect(await textsOf(ui)).toEqual(['🎴 Chakra ▰▱▱▱▱▱▱▱▱▱ 10% · Stamina 62% (7d)'])
    await ui.unmount()
  })

  test('a segment with no data is left out', async ($, on) => {
    const noLimits = await draw($, on, { percent: 58, usd: 1.42 })
    expect(await textsOf(noLimits)).toEqual(['🦌 Chakra ≋≋≋≋≋≋∙∙∙∙ 58% · 両 $1.42'])
    await noLimits.unmount()
  })

  test('no cost: no ryō segment', async ($, on) => {
    const ui = await draw($, on, { percent: 58, limits: [['five_hour', 23]] })
    expect(await textsOf(ui)).toEqual(['🦌 Chakra ≋≋≋≋≋≋∙∙∙∙ 58%'])
    await ui.unmount()
  })

  test('context fill not known yet: Chakra —', async ($, on) => {
    const ui = await draw($, on, { limits: [['five_hour', 23]], usd: 0.5 })
    expect(await textsOf(ui)).toEqual(['🦌 Chakra — · 両 $0.50'])
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
      const bar = (await runs(ui)).find(([t]) => t.startsWith('≋') || t.startsWith('∙'))
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
    expect(await runs(ui)).toContainEqual(['♞♞⋅⋅⋅⋅⋅⋅⋅⋅', legible(STRATEGISTS.lelouch?.color ?? '')])
    expect((await textsOf(ui))[0]).toBe(`♟️ Chakra ♞♞⋅⋅⋅⋅⋅⋅⋅⋅ 20% · Stamina 90% (5h) · ${USAGE_HOT_LINES.lelouch?.stamina}`)
    await ui.unmount()
  })

  test('the neutral persona has its own hot line', async ($, on) => {
    const ui = await draw($, on, { percent: 92 }, {}, {})
    expect((await textsOf(ui))[0]).toBe('🎴 Chakra ▰▰▰▰▰▰▰▰▰▰ 92% · Compact soon')
    await ui.unmount()
  })

  test('narrow: the compact form, inside the columns', async ($, on) => {
    const ui = await draw($, on, { percent: 58, limits: [['five_hour', 23]], usd: 1.42 }, { bodyColumns: 40 })
    expect(await textsOf(ui)).toEqual(['🦌 ≋≋≋∙ 58% · $1.42'])
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
    const ui = await draw($, on, { percent: 90, limits: [['five_hour', 51]], usd: 1.42 }, { bodyColumns: 100 })
    expect(await textsOf(ui)).toEqual(['🦌 Chakra ≋≋≋≋≋≋≋≋≋∙ 90% · Stamina 51% (5h) · 両 $1.42 · Mendokusē… compact soon'])
    await ui.unmount()
    const noHot = await mountBand($, { bodyColumns: 70 })
    expect(await textsOf(noHot)).toEqual(['🦌 Chakra ≋≋≋≋≋≋≋≋≋∙ 90% · Stamina 51% (5h) · 両 $1.42'])
    await noHot.unmount()
    const noCost = await mountBand($, { bodyColumns: 54 })
    expect(await textsOf(noCost)).toEqual(['🦌 Chakra ≋≋≋≋≋≋≋≋≋∙ 90% · Stamina 51% (5h)'])
    await noCost.unmount()
  })

  test('the crew band draws above the usage row, in what room is left', async ($, on) => {
    const w = usageWorld(on, { env: { DOJO_STRATEGIST: 'shikamaru' } })
    w.setAgents([agent('ag-1', 'dojo:levi', 'running', 'QA the cart')])
    bottomBand(on)
    await $.session.measure(measure({ percent: 58, usd: 1.42 }) as never)
    await $.agent.spawn(spawnInput('dojo:levi', undefined, 'QA the cart'))
    const ui = await mountBand($)
    expect(await textsOf(ui)).toEqual([band80('⚔ 🧹 Levi     QA the cart'), '🦌 Chakra ≋≋≋≋≋≋∙∙∙∙ 58% · 両 $1.42'])
    await ui.unmount()
    // one row to spare: the crew keeps it
    const tight = await mountBand($, { maxRows: 1 })
    expect(await textsOf(tight)).toEqual([band80('⚔ 🧹 Levi     QA the cart')])
    await tight.unmount()
  })

  test('two crew out: both band rows first, the usage line last', async ($, on) => {
    const w = usageWorld(on, { env: { DOJO_STRATEGIST: 'shikamaru' } })
    w.setAgents([agent('ag-1', 'dojo:levi', 'running', 'QA the cart'), agent('ag-2', 'dojo:senku', 'running', 'build the api')])
    bottomBand(on)
    await $.session.measure(measure({ percent: 58, usd: 1.42 }) as never)
    await $.agent.spawn(spawnInput('dojo:levi', undefined, 'QA the cart'))
    await $.agent.spawn(spawnInput('dojo:senku', undefined, 'build the api'))
    const ui = await mountBand($)
    const rows = await textsOf(ui)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatch(/Levi {5}QA the cart/)
    expect(rows[1]).toMatch(/Senku {4}build the api/)
    expect(rows[2]).toBe('🦌 Chakra ≋≋≋≋≋≋∙∙∙∙ 58% · 両 $1.42')
    await ui.unmount()
  })

  test('before any measurement the line is seeded from the session usage', async ($, on) => {
    usageWorld(on, { env: { DOJO_STRATEGIST: 'shikamaru' } })
    bottomBand(on)
    on('session.usage', () => ({ value: { startedAt: 0, ...measure({ percent: 30, limits: [['five_hour', 5]], usd: 0.1 }) } }) as never)
    const ui = await mountBand($)
    expect(await textsOf(ui)).toEqual(['🦌 Chakra ≋≋≋∙∙∙∙∙∙∙ 30% · 両 $0.10'])
    await ui.unmount()
  })

  test('desktop draws the same row', async ($, on) => {
    usageWorld(on, { env: { DOJO_STRATEGIST: 'shikamaru' } })
    bottomBand(on)
    await $.session.measure(measure({ percent: 58 }) as never)
    const ui = await mountBand($, {}, 'desktop')
    expect(await textsOf(ui)).toEqual(['🦌 Chakra ≋≋≋≋≋≋∙∙∙∙ 58%'])
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
    expect(await textsOf(ui)).toEqual([band80('⚔ 🧹 Levi     QA the cart')])
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

  test('the hint passes through untouched, whatever the prompt is doing', async ($, on) => {
    world(on, { env: { DOJO_STRATEGIST: 'shikamaru' } })
    bottomHint(on)
    for (const props of [{}, { isDraft: true }, { isWorking: true, hint: 'esc to interrupt' }] as const) {
      const ui = await mountHint($, props)
      const [hint, tail] = ((await ui.find({ type: 'Text' }))?.text ?? '').split('|') as [string, string]
      expect(hint).toBe((props as { hint?: string }).hint ?? '? for shortcuts')
      expect(tail).toBe('')
      await ui.unmount()
    }
  })

  test('no tail on any turn', async ($, on) => {
    world(on, { env: { DOJO_STRATEGIST: 'lelouch' } })
    on('prompt.submit', () => ({ text: 'hi' }) as never)
    bottomHint(on)
    for (let i = 0; i < 4; i++) {
      await $.prompt.submit({ text: 'hi', wait: false, origin: { kind: 'composer' } })
      const ui = await mountHint($)
      expect(((await ui.find({ type: 'Text' }))?.text ?? '').split('|')[1]).toBe('')
      await ui.unmount()
    }
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

  test('session modes keep their names, dim; no themed label, and the strategist tag follows in its color', async ($, on) => {
    world(on, { env: { DOJO_STRATEGIST: 'shikamaru' } })
    bottomModes(on)
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'SessionMode', props: { modes: ['focus', 'memory paused', 'plan'] } })
      const texts = await ui.findAll({ type: 'Text' })
      expect(texts[0]?.text).toBe('focus & memory paused & plan & 🦌 Shikamaru')
      expect(texts.find(t => t.text === 'focus & memory paused & plan & ')?.props.dimColor).toBe(true)
      expect(texts.find(t => t.text === '🦌 Shikamaru')?.props.color).toBe('#5B8C5A')
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
  const lines = async (ui: Awaited<ReturnType<typeof mountPane>>) => textsIn(ui)

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
    expect(out.slice(0, 3)).toEqual(['🦌 Shikamaru on duty', 'voice: medium (roster default) · opus 5.5', 'crew: 0 running · 0 returned · 0 fell · 7 idle'])
    for (const c of Object.values(CREW)) {
      const row = out.find(l => l.includes(c.name) && l.includes(c.role))
      expect(row).toBeDefined()
      expect(row).toContain(c.emoji)
      expect(row).toContain('idle')
      expect(row).toContain(modelLabel(MODELS[c.key] ?? ''))
    }
    expect(out.find(l => l.includes('Senku'))).toContain('haiku 5.5')
    expect(out.find(l => l.includes('Levi'))).toContain('haiku 5.5')
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
    expect(out[2]).toBe('crew: 1 running · 1 returned · 1 fell · 4 idle')
    expect(out.find(l => l.includes('Levi'))).toMatch(/✔ returned/)
    expect(out).toContain('   “Mostly clean. Fix the corner I marked.”')
    expect(out.find(l => l.includes('Senku'))).toMatch(/✖ fell/)
    expect(out).toContain(`   ${FALL_LINES.senku}`)
    expect(out.find(l => l.includes('Robin'))).toMatch(/running\s+docs/)
    expect(out.find(l => l.includes('Sanji'))).toContain('idle')
    expect(w.toasts).toContain('🧹 Levi returned — “Mostly clean. Fix the corner I marked.”')
    expect(w.toasts).toContain(`💀 Senku fell — “${FALL_LINES.senku}”`)
    await ui.unmount()
  })

  test('a second run of one character counts: the figures line says 2 runs, the status word stays plain', async ($, on) => {
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
    const out = await lines(ui)
    expect(out.find(l => l.includes('Levi'))).toMatch(/✔ returned\s*$/)
    expect(out.some(l => l.startsWith('   2 runs'))).toBe(true)
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
    await $.agent.spawn(spawnInput('dojo:jiraiya', undefined, 'd'))
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
      '🧹 Levi deployed — “Chi. Show me the mess.”',
      `🧹 Levi deployed — “${DEPLOY_MORE.levi?.[0]}”`,
      `🧹 Levi deployed — “${DEPLOY_MORE.levi?.[1]}”`,
    ])
  })

  test('a report with no Says line returns with a line from the character return set', async ($, on) => {
    const w = world(on)
    w.setAgents([agent('ag-1', 'dojo:levi')])
    await $.agent.spawn(spawnInput('dojo:levi', undefined, 'a'))
    await w.clock.advance(1000)
    await $.turn.complete(done('ag-1', 'Verdict: PASS'))
    w.setAgents([agent('ag-1', 'dojo:levi', 'completed')])
    await w.clock.advance(300)
    expect(w.toasts.slice(1)).toEqual([`🧹 Levi returned — “${RETURN_TOAST.levi?.[0]}”`])
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

  test('the band row for a dark character color is the lifted one', () => {
    const [row] = planBand({ persona: 'lelouch', rows: [{ key: 'levi', description: 'x' }], frame: 0, columns: 80, maxRows: 5 })
    expect(row?.[0]?.color).toBe(legible(CREW.levi?.color ?? ''))
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

// --- chrome features: palette mode, persona bars, crew stats, mission report, gallery, rank --------------------------

const bottomBandFor = (on: On) => on('ui.render', { component: 'AbovePrompt' }, ($, e) => $.ui.resolve(e).Text({ children: 'ENGINE-BAND' }))
const bottomPaneFor = (on: On) => on('ui.render', { component: 'Pane' }, ($, e) => $.ui.resolve(e).Text({ children: 'ENGINE-PANE' }))
const mountBandFor = ($: Engine, props: Record<string, unknown> = {}) =>
  $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: { ...BAND_PROPS, ...props } as never })
const mountPaneFor = ($: Engine, requestId: string, props: Record<string, unknown> = {}, surface: 'terminal' | 'mobile' = 'terminal') =>
  $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', props: { ...PANE_PROPS, ...props } as never, requestId })
/** A plugin store the test can read back: what the plugin set under a key, as JSON. */
function memStore(on: On, entries: Record<string, unknown> = {}, refuseWrites = false) {
  const mem = new Map<string, unknown>(Object.entries(entries))
  on('store.get', (_$, e) => ({ value: mem.get(e.key) }))
  on('store.set', (_$, e) => {
    if (refuseWrites) throw new Error('disk full')
    mem.set(e.key, JSON.parse(JSON.stringify(e.value)))
    return { value: undefined }
  })
  return mem
}

/** A `/config` row written as the person would: the key and value, the rest the engine's. */
const setConfig = ($: Engine, key: string, value: string) =>
  $.config.set({ key, value, previous: '', provider: { plugin: 'engine', tier: 'core' }, origin: { kind: 'composer' } } as never)

/** The pane's lines as drawn: each line's outer Text (its colored runs left out), or the engine's own text. */
const textsIn = async (ui: Awaited<ReturnType<typeof mountPaneFor>>) =>
  (await ui.findAll({ type: 'Text' })).filter(t => t.props.wrap === 'truncate-end' || t.text === 'ENGINE-PANE').map(t => t.text)

const measureOf = (percent: number, usd?: number) => ({
  context: { window: 200_000, percent, tokens: percent * 2000 },
  rateLimits: [],
  ...(usd === undefined ? {} : { cost: { usd } }),
  changed: ['context' as const],
})

const doneWith = (agentId: string, answer: string, durationMs: number, input = 0, output = 0) =>
  ({
    answer,
    durationMs,
    isAborted: false,
    turnId: 't1',
    agentId,
    reason: 'answer',
    ...(input + output === 0
      ? {}
      : { usage: { input_tokens: input, output_tokens: output, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'm' } }),
  }) as const

/** Deploys one crew member and lets it end; ids walk on from the world's own counter. */
function crewRuns(w: ReturnType<typeof world>, $: Engine) {
  let n = 0
  return async (type: string, status: AgentInfo['status'], run?: { answer: string; ms: number; input?: number; output?: number }) => {
    const id = `ag-${++n}`
    w.setAgents([agent(id, type, 'running', 'work')])
    await $.agent.spawn(spawnInput(type, undefined, 'work'))
    await w.clock.advance(1000)
    if (run !== undefined) await $.turn.complete(doneWith(id, run.answer, run.ms, run.input, run.output))
    w.setAgents([agent(id, type, status, 'work')])
    await w.clock.advance(300)
  }
}

type StepUsage = { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }

/** Deploys one crew member whose model requests report `steps`, and lets it end with the last one as its final turn. */
function stepRuns(on: On, w: ReturnType<typeof world>, $: Engine) {
  let current: StepUsage | undefined
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: current === undefined ? null : { model: 'm', ...current } }
  })
  let n = 100
  return async (type: string, steps: StepUsage[], ms: number) => {
    const id = `ag-${++n}`
    w.setAgents([agent(id, type, 'running', 'work')])
    await $.agent.spawn(spawnInput(type, undefined, 'work'))
    await w.clock.advance(1000)
    for (const u of steps) {
      current = u
      for await (const chunk of $.turn.step({ turnId: 't1', index: 0, model: 'm', messageCount: 3, agentId: id })) void chunk
    }
    const last = steps[steps.length - 1]
    await $.turn.complete({ answer: 'ok', durationMs: ms, isAborted: false, turnId: 't1', agentId: id, reason: 'answer', ...(last === undefined ? {} : { usage: { model: 'm', ...last } }) } as never)
    w.setAgents([agent(id, type, 'completed', 'work')])
    await w.clock.advance(300)
  }
}

describe('palette mode', () => {
  type Rows = { key: string; label: string; kind: 'choice'; value: string; provider: { plugin: string; tier: 'core' }; isLocked: boolean }[]
  const themeRows = (value: string): Rows => [{ key: 'theme', label: 'Theme', kind: 'choice', value, provider: { plugin: 'engine', tier: 'core' }, isLocked: false }]
  /** The engine beneath keeps a theme the test can change, lists it, and writes `config.set` through. */
  const engine = (on: On, theme: { value: string }, deny = false) => {
    on('config.list', () => ({ value: themeRows(theme.value) as never }))
    on('config.set', (_$, e) => {
      if (deny) return { deny: 'no' }
      if (e.key === 'theme') theme.value = String(e.value)
      return { value: e.value }
    })
  }
  const start = ($: Engine) => $.session.start({ cwd: '/x', surface: 'terminal', isInteractive: true })
  /** The colors the chrome drew for a running Levi under a Lelouch header. */
  const bandColors = async ($: Engine, on: On) => {
    const w = world(on, { env: { DOJO_STRATEGIST: 'lelouch' } })
    w.setAgents([agent('ag-1', 'dojo:levi', 'running', 'QA')])
    bottomBandFor(on)
    await $.agent.spawn(spawnInput('dojo:levi', undefined, 'QA'))
    return w
  }
  const colorsOf = async ($: Engine) => {
    const ui = await mountBandFor($)
    const texts = await ui.findAll({ type: 'Text' })
    // the name run of the row
    const colors = [texts.find(t => t.text.trim() === 'Levi')?.props.color]
    await ui.unmount()
    return colors
  }
  const DARK = [tint('levi', 'dark')]
  const LIGHT = [colorFor('levi', 'light')]

  test('dark by default: the contrast-lifted colors, as before', async ($, on) => {
    await bandColors($, on)
    expect(await colorsOf($)).toEqual(DARK)
    expect(DARK).toEqual([legible(colorFor('levi', 'dark'))])
  })

  test('session start: a light engine theme gives the light palette', async ($, on) => {
    const theme = { value: 'light' }
    engine(on, theme)
    await bandColors($, on)
    await start($)
    expect(await colorsOf($)).toEqual(LIGHT)
    expect(LIGHT[0]).not.toBe(DARK[0])
  })

  test('session start: any theme whose name has light in it, and a dark one stays dark', async ($, on) => {
    const theme = { value: 'light-daltonized' }
    engine(on, theme)
    await bandColors($, on)
    await start($)
    expect(await colorsOf($)).toEqual(LIGHT)
    theme.value = 'dark-ansi'
    await start($)
    expect(await colorsOf($)).toEqual(DARK)
  })

  test('a theme change re-resolves the palette, both ways', async ($, on) => {
    const theme = { value: 'dark' }
    engine(on, theme)
    await bandColors($, on)
    await start($)
    expect(await colorsOf($)).toEqual(DARK)
    await setConfig($, 'theme', 'light')
    expect(await colorsOf($)).toEqual(LIGHT)
    await setConfig($, 'theme', 'dark')
    expect(await colorsOf($)).toEqual(DARK)
  })

  test('the paletteMode setting wins over the theme', { options: { paletteMode: 'light' } }, async ($, on) => {
    const theme = { value: 'dark' }
    engine(on, theme)
    await bandColors($, on)
    await start($)
    expect(await colorsOf($)).toEqual(LIGHT)
  })

  test('paletteMode dark on a light theme stays dark, and a written setting applies at once', { options: { paletteMode: 'dark' } }, async ($, on) => {
    const theme = { value: 'light' }
    engine(on, theme)
    await bandColors($, on)
    await start($)
    expect(await colorsOf($)).toEqual(DARK)
    await setConfig($, 'dojo.paletteMode', 'light')
    expect(await colorsOf($)).toEqual(LIGHT)
    await setConfig($, 'dojo.paletteMode', 'auto')
    expect(await colorsOf($)).toEqual(LIGHT)
  })

  test('a refused change leaves the palette; no config rows leaves the option and dark', async ($, on) => {
    const theme = { value: 'dark' }
    engine(on, theme, true)
    await bandColors($, on)
    await start($)
    expect((await setConfig($, 'theme', 'light')).deny).toBe('no')
    expect(await colorsOf($)).toEqual(DARK)
  })

  test('the usage bar and the roster follow the mode too', async ($, on) => {
    const theme = { value: 'light' }
    engine(on, theme)
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    const w = world(on, { env: { DOJO_STRATEGIST: 'lelouch' } })
    w.setAgents([])
    bottomBandFor(on)
    bottomPaneFor(on)
    await start($)
    await $.session.measure(measureOf(30) as never)
    const band = await mountBandFor($)
    const runs = (await band.findAll({ type: 'Text' })).filter(t => t.props.wrap !== 'truncate-end')
    expect(runs.find(t => t.text.startsWith('♞'))?.props.color).toBe(colorFor('lelouch', 'light'))
    await band.unmount()
    const pane = await mountPaneFor($, 'dojo-roster')
    const colors = (await pane.findAll({ type: 'Text' })).map(t => t.props.color)
    expect(colors).toContain(colorFor('lelouch', 'light'))
    expect(colors).toContain(colorFor('senku', 'light'))
    await pane.unmount()
  })

  test('light lines: the band and roster helpers take the mode, dark when none is given', () => {
    const rows = [{ key: 'levi', description: 'x' }]
    const dark = planBand({ persona: 'lelouch', rows, frame: 0, columns: 80, maxRows: 5 })
    const light = planBand({ persona: 'lelouch', rows, frame: 0, columns: 80, maxRows: 5, mode: 'light' })
    expect(dark[0]?.[0]?.color).toBe(tint('levi', 'dark'))
    expect(light[0]?.[0]?.color).toBe(colorFor('levi', 'light'))
    const usage = { percent: 10, limit: null, usd: null }
    const bar = (mode?: 'dark' | 'light') => planUsage({ persona: 'shikamaru', usage, columns: 80, ...(mode === undefined ? {} : { mode }) })?.find(seg => seg.text.startsWith('≋'))
    expect(bar()?.color).toBe(tint('shikamaru', 'dark'))
    expect(bar('light')?.color).toBe(colorFor('shikamaru', 'light'))
    expect(tint('levi', 'light')).toBe(colorFor('levi', 'light'))
    expect(accentFor('levi', 'light')).toBeDefined()
  })
})

describe('persona usage bars', () => {
  const PCT = [0, 1, 10, 58, 100]
  test('each persona has its own single-width glyphs; the neutral one is unchanged', () => {
    expect(barGlyphs(null)).toEqual({ full: '▰', empty: '▱' })
    expect(barGlyphs('unknown')).toEqual({ full: '▰', empty: '▱' })
    expect(usageBar(58, 10)).toBe('▰▰▰▰▰▰▱▱▱▱')
    expect(usageBar(58, 10, 'shikamaru')).toBe('≋≋≋≋≋≋∙∙∙∙')
    expect(usageBar(58, 10, 'lelouch')).toBe('♞♞♞♞♞♞⋅⋅⋅⋅')
    expect(new Set(Object.values(USAGE_BARS).map(g => g.full)).size).toBe(3)
    for (const [persona, g] of Object.entries(USAGE_BARS)) {
      for (const glyph of [g.full, g.empty]) {
        expect(cellWidth(glyph), persona).toBe(1)
        expect([...glyph], persona).toHaveLength(1)
        // no emoji-capable code point (the chess pawn is one, and many fonts draw it two cells wide)
        expect(/\p{Emoji}/u.test(glyph), `${persona} ${glyph}`).toBe(false)
      }
    }
  })

  test('same cell counts as today: 10 wide, 4 compact, rounded up to a cell, for every persona', () => {
    for (const persona of [null, 'shikamaru', 'lelouch']) {
      const g = barGlyphs(persona)
      for (const p of PCT) {
        const cells = Math.ceil(p / 10)
        expect(usageBar(p, 10, persona)).toBe(g.full.repeat(cells) + g.empty.repeat(10 - cells))
        expect(cellWidth(usageBar(p, 10, persona))).toBe(10)
        expect(cellWidth(usageBar(p, 4, persona))).toBe(4)
      }
      expect(usageBar(130, 4, persona)).toBe(g.full.repeat(4))
      expect(usageBar(-5, 4, persona)).toBe(g.empty.repeat(4))
    }
  })

  test('the line carries the persona bar with the same thresholds and colors, inside the columns', () => {
    for (const persona of ['shikamaru', 'lelouch'] as const) {
      const g = barGlyphs(persona)
      const base = tint(persona, 'dark')
      for (const [percent, color] of [[59, base], [60, 'warning'], [84, 'warning'], [85, 'error'], [100, 'error']] as const) {
        const line = planUsage({ persona, usage: { percent, limit: null, usd: null }, columns: 80 }) ?? []
        const bar = line.find(seg => seg.text.startsWith(g.full))
        expect(bar?.color, `${persona} ${percent}`).toBe(color)
        expect(bar?.text).toBe(usageBar(percent, 10, persona))
      }
      for (const columns of [80, 54, 49, 40, 20, 12, 6]) {
        const line = planUsage({ persona, usage: { percent: 58, limit: { kind: 'five_hour', percent: 23 }, usd: 1.42 }, columns }) ?? []
        expect(line.reduce((n, seg) => n + cellWidth(seg.text), 0), `${persona} ${columns}`).toBeLessThanOrEqual(Math.max(1, columns - 1))
      }
      const compact = planUsage({ persona, usage: { percent: 58, limit: null, usd: null }, columns: 40 }) ?? []
      expect(compact.map(seg => seg.text).join('')).toBe(`${(persona === 'lelouch' ? '♟️' : '🦌')} ${g.full.repeat(3)}${g.empty} 58%`)
    }
  })

  test('on screen: Shikamaru draws tendrils, Lelouch knights, nobody on duty the parallelograms', async ($, on) => {
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    const w = world(on, { env: { DOJO_STRATEGIST: 'lelouch' } })
    w.setAgents([])
    bottomBandFor(on)
    await $.session.measure(measureOf(58, 1.42) as never)
    const ui = await mountBandFor($)
    const row = (await ui.findAll({ type: 'Text' })).find(t => t.props.wrap === 'truncate-end')?.text
    expect(row).toBe('♟️ Chakra ♞♞♞♞♞♞⋅⋅⋅⋅ 58% · 両 $1.42')
    await ui.unmount()
  })
})

describe('crew stats and rank pure helpers', () => {
  const st = (runs: number, ms = 0, tokens = 0) => ({ runs, returned: runs, fell: 0, ms, tokens })

  test('durations and token counts read short', () => {
    expect(fmtDuration(0)).toBe('0s')
    expect(fmtDuration(42_400)).toBe('42s')
    expect(fmtDuration(192_000)).toBe('3m 12s')
    expect(fmtDuration(3_900_000)).toBe('1h 05m')
    expect(fmtTokens(850)).toBe('850')
    expect(fmtTokens(14_200)).toBe('14.2k')
    expect(fmtTokens(2_000)).toBe('2k')
    expect(fmtTokens(1_250_000)).toBe('1.3M')
  })

  test('most deployed: the highest run count, a tie going to the longer run time, then the crew order', () => {
    expect(mostDeployed({})).toBeNull()
    expect(mostDeployed({ levi: st(1) })).toBeNull()
    expect(mostDeployed({ levi: st(2), senku: st(1) })).toBe('levi')
    expect(mostDeployed({ levi: st(2, 5_000), senku: st(2, 9_000) })).toBe('senku')
    expect(mostDeployed({ senku: st(2, 5_000), levi: st(2, 9_000) })).toBe('levi')
    expect(mostDeployed({ levi: st(3, 5_000), senku: st(2, 90_000) })).toBe('levi')
    // a full tie: the one earlier in the crew order (senku, sanji, l, light, levi, robin)
    expect(mostDeployed({ robin: st(2, 4_000), levi: st(2, 4_000), sanji: st(2, 4_000) })).toBe('sanji')
    expect(mostDeployed({ nobody: st(9) })).toBeNull()
  })

  test('addStats adds into a new table, and token counts count input plus output only', () => {
    const base = { levi: st(1, 1000, 10) }
    const next = addStats(base, 'levi', { runs: 1, ms: 500, tokens: 5 })
    expect(next.levi).toEqual({ runs: 2, returned: 1, fell: 0, ms: 1500, tokens: 15 })
    expect(base.levi.runs).toBe(1)
    expect(addStats({}, 'senku', { fell: 1 }).senku).toEqual({ runs: 0, returned: 0, fell: 1, ms: 0, tokens: 0 })
  })

  test('stepTokens replaces the input (both cache fields included) and sums the output; agentTokens adds them', () => {
    const zero = { latestInput: 0, cumOutput: 0 }
    const usage = (input_tokens: number, output_tokens: number, cache_read_input_tokens?: number, cache_creation_input_tokens?: number) => ({
      input_tokens,
      output_tokens,
      ...(cache_read_input_tokens === undefined ? {} : { cache_read_input_tokens }),
      ...(cache_creation_input_tokens === undefined ? {} : { cache_creation_input_tokens }),
    })
    const one = stepTokens(zero, usage(10, 500, 70_000, 200))
    expect(one).toEqual({ latestInput: 70_210, cumOutput: 500 })
    const two = stepTokens(one, usage(20, 400, 78_000, 0))
    expect(two).toEqual({ latestInput: 78_020, cumOutput: 900 })
    const three = stepTokens(two, usage(30, 100))
    expect(three).toEqual({ latestInput: 30, cumOutput: 1000 })
    expect(agentTokens(two)).toBe(78_920)
    expect(fmtTokens(agentTokens(two))).toBe('78.9k')
    expect(zero).toEqual({ latestInput: 0, cumOutput: 0 })
    // no usage, or something unreadable: the state stands
    expect(stepTokens(two, undefined)).toBe(two)
    expect(stepTokens(two, null)).toBe(two)
    expect(stepTokens(zero, { input_tokens: 'x', output_tokens: -4 })).toEqual(zero)
  })

  test('rank thresholds: 0, 25, 100 and 300, with progress to the next rung', () => {
    const at = (points: number, persona: string | null = 'shikamaru') => rankOf(points, persona)
    expect([0, 24, 25, 99, 100, 299, 300, 5000].map(p => at(p).name)).toEqual(['Genin', 'Genin', 'Chūnin', 'Chūnin', 'Jōnin', 'Jōnin', 'Kage', 'Kage'])
    expect([0, 24, 25, 99, 100, 299, 300].map(p => at(p).index)).toEqual([0, 0, 1, 1, 2, 2, 3])
    expect(RANK_STEPS).toEqual([0, 25, 100, 300])
    expect(at(0).next).toEqual({ name: 'Chūnin', at: 25 })
    expect(at(0).percent).toBe(0)
    expect(Math.round(at(60).percent)).toBe(Math.round(((60 - 25) / 75) * 100))
    expect(at(300).next).toBeUndefined()
    expect(at(300).percent).toBe(100)
    expect(at(-3).points).toBe(0)
    expect(at(Number.NaN).points).toBe(0)
  })

  test('each persona has its own ladder; no persona and Shikamaru share one', () => {
    expect([0, 25, 100, 300].map(p => rankOf(p, 'lelouch').name)).toEqual(['Pawn', 'Knight', 'Rook', 'King'])
    expect([0, 25, 100, 300].map(p => rankOf(p, null).name)).toEqual(['Genin', 'Chūnin', 'Jōnin', 'Kage'])
    expect(rankOf(25, 'nobody').name).toBe('Chūnin')
    for (const ladder of Object.values(RANK_LADDERS)) expect(ladder).toHaveLength(RANK_STEPS.length)
    for (const lines of Object.values(RANK_UP_LINES)) {
      expect(lines).toHaveLength(RANK_STEPS.length)
      for (const line of lines.slice(1)) expect(line.length).toBeGreaterThan(0)
    }
  })

  test('rank-up text is in the strategist voice', () => {
    expect(rankUpText(rankOf(25, 'shikamaru'), 'shikamaru')).toBe(`🦌 Rank up: Chūnin — “${RANK_UP_LINES.shikamaru?.[1]}”`)
    expect(rankUpText(rankOf(100, 'lelouch'), 'lelouch')).toBe(`♟️ Rank up: Rook — “${RANK_UP_LINES.lelouch?.[2]}”`)
    expect(rankUpText(rankOf(300, null), null)).toBe(`🎴 Rank up: Kage — “${RANK_UP_LINES.strategist?.[3]}”`)
  })

  test('the rank line narrows, keeps the unsaved label, and stays inside the columns', () => {
    const text = (l: ReturnType<typeof rankLine>) => l.map(seg => seg.text).join('')
    const info = rankOf(31, 'shikamaru')
    expect(text(rankLine(info, 'shikamaru', 80))).toBe(`Rank: Chūnin ${usageBar(info.percent, 8, 'shikamaru')} 31/100 → Jōnin`)
    expect(text(rankLine(info, 'shikamaru', 30))).toBe('Rank: Chūnin 31/100 → Jōnin')
    expect(text(rankLine(info, 'shikamaru', 16))).toBe('Chūnin 31/100')
    expect(text(rankLine(rankOf(31, 'lelouch', false), 'lelouch', 80))).toContain('(this session)')
    expect(text(rankLine(rankOf(400, 'lelouch'), 'lelouch', 80))).toContain('King')
    expect(text(rankLine(rankOf(400, 'lelouch'), 'lelouch', 80))).toContain('top rank')
    for (const columns of [80, 50, 30, 20, 12, 6]) {
      for (const saved of [true, false]) {
        const line = rankLine(rankOf(31, 'lelouch', saved), 'lelouch', columns)
        expect(cellWidth(text(line)), `${columns}`).toBeLessThanOrEqual(columns)
      }
    }
  })
})

describe('/dojo crew stats and rank header', () => {
  const lines = async (ui: Awaited<ReturnType<typeof mountPaneFor>>) => textsIn(ui)

  test("the figure under a member is Claude Code's own: the latest prompt plus all output, summed over its runs", async ($, on) => {
    const w = world(on, { env: { DOJO_STRATEGIST: 'shikamaru' } })
    bottomPaneFor(on)
    const run = stepRuns(on, w, $)
    const u = (input_tokens: number, output_tokens: number, cache_read_input_tokens: number): StepUsage => ({ input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens: 0 })
    // 78,020 + 900 = 78,920 for the first run, 1,000 + 200 = 1,200 for the second
    await run('dojo:senku', [u(10, 500, 70_000), u(20, 400, 78_000)], 60_000)
    await run('dojo:senku', [u(1000, 200, 0)], 30_000)
    const ui = await mountPaneFor($, 'dojo-roster')
    const out = await lines(ui)
    const at = out.findIndex(l => l.includes('Senku'))
    expect(out[at + 1]).toContain('2 runs · 1m 30s · 80.1k tokens')
    await ui.unmount()
  })

  test('runs, run time, tokens and the most-deployed badge under each member that ran', async ($, on) => {
    const w = world(on, { env: { DOJO_STRATEGIST: 'shikamaru' } })
    bottomPaneFor(on)
    const run = crewRuns(w, $)
    await run('dojo:levi', 'completed', { answer: 'Says: "One."', ms: 100_000, input: 8000, output: 1000 })
    await run('dojo:levi', 'completed', { answer: 'Says: "Two."', ms: 92_000, input: 4000, output: 1200 })
    await run('dojo:senku', 'completed', { answer: 'ok', ms: 5_000 })
    const ui = await mountPaneFor($, 'dojo-roster')
    const out = await lines(ui)
    const at = out.findIndex(l => l.includes('Levi'))
    expect(out[at + 1]).toBe('   2 runs · 3m 12s · 14.2k tokens · ★ most deployed')
    const senku = out.findIndex(l => l.includes('Senku'))
    expect(out[senku + 1]).toBe('   1 run · 5s')
    // members that never ran gain no line
    const sanji = out.findIndex(l => l.includes('Sanji'))
    expect(out[sanji + 1]).toContain('Kurisu')
    expect(out.filter(l => l.includes('most deployed'))).toHaveLength(1)
    await ui.unmount()
  })

  test('a tie on runs goes to the longer run time and the badge shows once', async ($, on) => {
    const w = world(on)
    bottomPaneFor(on)
    const run = crewRuns(w, $)
    await run('dojo:senku', 'completed', { answer: 'ok', ms: 3_000 })
    await run('dojo:levi', 'completed', { answer: 'ok', ms: 9_000 })
    await run('dojo:senku', 'completed', { answer: 'ok', ms: 3_000 })
    await run('dojo:levi', 'completed', { answer: 'ok', ms: 9_000 })
    const ui = await mountPaneFor($, 'dojo-roster')
    const out = await lines(ui)
    expect(out.find((_, i) => out[i - 1]?.includes('Levi'))).toContain('most deployed')
    expect(out.find((_, i) => out[i - 1]?.includes('Senku'))).not.toContain('most deployed')
    await ui.unmount()
  })

  test('nobody ran twice: no badge', async ($, on) => {
    const w = world(on)
    bottomPaneFor(on)
    const run = crewRuns(w, $)
    await run('dojo:levi', 'completed', { answer: 'ok', ms: 3_000 })
    await run('dojo:senku', 'completed', { answer: 'ok', ms: 9_000 })
    const ui = await mountPaneFor($, 'dojo-roster')
    expect((await lines(ui)).some(l => l.includes('most deployed'))).toBe(false)
    await ui.unmount()
  })

  test('narrow widths: figures shrink, the badge shrinks to a star, every line stays inside', async ($, on) => {
    const w = world(on, { env: { DOJO_STRATEGIST: 'lelouch' } })
    bottomPaneFor(on)
    const run = crewRuns(w, $)
    await run('dojo:levi', 'completed', { answer: 'ok', ms: 100_000, input: 8000, output: 1000 })
    await run('dojo:levi', 'completed', { answer: 'ok', ms: 92_000, input: 4000, output: 1200 })
    for (const columns of [100, 64, 50, 40, 36, 30, 24, 20, 12]) {
      const ui = await mountPaneFor($, 'dojo-roster', { bodyColumns: columns })
      const out = await lines(ui)
      for (const l of out) expect(cellWidth(l), `${columns}: ${l}`).toBeLessThanOrEqual(columns)
      const figures = out.find(l => /^ {3}\d/.test(l))
      expect(figures, `${columns}`).toBeDefined()
      if (columns >= 64) expect(figures).toBe('   2 runs · 3m 12s · 14.2k tokens · ★ most deployed')
      if (columns === 50 || columns === 36) expect(figures).toBe('   2 runs · 3m 12s · 14.2k tokens ★')
      if (columns === 30) expect(figures).toBe('   2× · 3m 12s · 14.2k tok ★')
      if (columns === 24 || columns === 20) expect(figures).toBe('   2× 3m 12s 14.2k ★')
      await ui.unmount()
    }
  })

  test('the header shows the rank and the progress, under the tally and above the rule', async ($, on) => {
    memStore(on)
    world(on, { env: { DOJO_STRATEGIST: 'shikamaru' } })
    bottomPaneFor(on)
    const ui = await mountPaneFor($, 'dojo-roster')
    const out = await lines(ui)
    expect(out[3]).toBe(`Rank: Genin ${usageBar(0, 8, 'shikamaru')} 0/25 → Chūnin`)
    expect(out[4]).toMatch(/^─+$/)
    await ui.unmount()
  })

  test('the text fallback carries the rank and the stats too', async ($, on) => {
    const w = world(on, { placed: false, env: { DOJO_STRATEGIST: 'lelouch' } })
    const run = crewRuns(w, $)
    await run('dojo:levi', 'completed', { answer: 'ok', ms: 3_000 })
    const ran = await $.command.run(slash('dojo'))
    expect(ran.text).toContain('Rank: Pawn')
    expect(ran.text).toContain('1 run · 3s')
  })
})

describe('rank points', () => {
  const ret = (w: ReturnType<typeof world>, $: Engine) => crewRuns(w, $)

  test('every crew member that returns is a point, kept in the plugin store', async ($, on) => {
    const mem = memStore(on)
    const w = world(on, { env: { DOJO_STRATEGIST: 'shikamaru' } })
    const run = ret(w, $)
    expect(mem.get('rank')).toBeUndefined()
    await run('dojo:levi', 'completed')
    expect(mem.get('rank')).toEqual({ points: 1 })
    await run('dojo:senku', 'completed')
    expect(mem.get('rank')).toEqual({ points: 2 })
  })

  test('a crew member that fell earns nothing, and neither does an agent that is no dojo crew', async ($, on) => {
    const mem = memStore(on)
    const w = world(on)
    const run = ret(w, $)
    await run('dojo:levi', 'failed')
    await run('dojo:senku', 'killed')
    await run('general-purpose', 'completed')
    expect(mem.get('rank')).toBeUndefined()
  })

  test('round trip: points saved earlier are read back from the store at the next start and carry on from there', async ($, on) => {
    mock.store(on, { rank: { points: 23 } })
    const w = world(on, { env: { DOJO_STRATEGIST: 'shikamaru' } })
    bottomPaneFor(on)
    const before = await mountPaneFor($, 'dojo-roster')
    expect((await textsIn(before))[3]).toContain('23/25 → Chūnin')
    await before.unmount()
    const run = ret(w, $)
    await run('dojo:levi', 'completed')
    const after = await mountPaneFor($, 'dojo-roster')
    expect((await textsOf(after))[3]).toContain('24/25 → Chūnin')
    await after.unmount()
  })

  test('the rank-up toast comes in the strategist voice, once, on the point that crosses the line', async ($, on) => {
    const mem = memStore(on, { rank: { points: 23 } })
    const w = world(on, { env: { DOJO_STRATEGIST: 'shikamaru' } })
    const run = ret(w, $)
    await run('dojo:levi', 'completed')
    expect(w.toasts.some(t => t.includes('Rank up'))).toBe(false)
    await run('dojo:senku', 'completed')
    const up = w.toasts.filter(t => t.includes('Rank up'))
    expect(up).toEqual([`🦌 Rank up: Chūnin — “${RANK_UP_LINES.shikamaru?.[1]}”`])
    await run('dojo:robin', 'completed')
    expect(w.toasts.filter(t => t.includes('Rank up'))).toHaveLength(1)
    expect(mem.get('rank')).toEqual({ points: 26 })
  })

  test('the other ladder: Lelouch is promoted to Rook with his own line, and the pane names it', async ($, on) => {
    const mem = memStore(on, { rank: { points: 99 } })
    const w = world(on, { env: { DOJO_STRATEGIST: 'lelouch' } })
    bottomPaneFor(on)
    const run = ret(w, $)
    await run('dojo:levi', 'completed')
    expect(w.toasts).toContain(`♟️ Rank up: Rook — “${RANK_UP_LINES.lelouch?.[2]}”`)
    const ui = await mountPaneFor($, 'dojo-roster')
    expect((await textsIn(ui))[3]).toContain('Rank: Rook')
    expect((await textsIn(ui))[3]).toContain('100/300 → King')
    await ui.unmount()
  })

  test('the top of the ladder reads as such', async ($, on) => {
    const mem = memStore(on, { rank: { points: 299 } })
    const w = world(on, { env: { DOJO_STRATEGIST: 'shikamaru' } })
    bottomPaneFor(on)
    await ret(w, $)('dojo:levi', 'completed')
    expect(w.toasts).toContain(`🦌 Rank up: Kage — “${RANK_UP_LINES.shikamaru?.[3]}”`)
    const ui = await mountPaneFor($, 'dojo-roster')
    expect((await textsIn(ui))[3]).toContain('Rank: Kage')
    expect((await textsIn(ui))[3]).toContain('top rank')
    await ui.unmount()
  })

  test('no store: the rank lives in the session and is labelled so, with nothing written', async ($, on) => {
    const writes: unknown[] = []
    on('store.get', () => {
      throw new Error('no store')
    })
    on('store.set', (_$, e) => {
      writes.push(e)
      return { value: undefined }
    })
    const w = world(on, { env: { DOJO_STRATEGIST: 'shikamaru' } })
    bottomPaneFor(on)
    await ret(w, $)('dojo:levi', 'completed')
    const ui = await mountPaneFor($, 'dojo-roster')
    expect((await textsIn(ui))[3]).toContain('1/25 → Chūnin (this session)')
    await ui.unmount()
    expect(writes).toEqual([])
  })

  test('a store that refuses the write: the label turns to this session', async ($, on) => {
    const mem = memStore(on, { rank: { points: 3 } }, true)
    const w = world(on)
    bottomPaneFor(on)
    await ret(w, $)('dojo:levi', 'completed')
    const ui = await mountPaneFor($, 'dojo-roster')
    expect((await textsIn(ui))[3]).toContain('4/25 → Chūnin (this session)')
    expect(mem.get('rank')).toEqual({ points: 3 })
    await ui.unmount()
  })

  test('garbage in the store counts as zero', async ($, on) => {
    const mem = memStore(on, { rank: { points: 'lots' } })
    const w = world(on)
    bottomPaneFor(on)
    await ret(w, $)('dojo:levi', 'completed')
    expect(mem.get('rank')).toEqual({ points: 1 })
  })

  test('rank off: no points, no line, no toast, no write', { options: { rank: false } }, async ($, on) => {
    const mem = memStore(on, { rank: { points: 24 } })
    const w = world(on, { env: { DOJO_STRATEGIST: 'shikamaru' } })
    bottomPaneFor(on)
    await ret(w, $)('dojo:levi', 'completed')
    expect(mem.get('rank')).toEqual({ points: 24 })
    expect(w.toasts.some(t => t.includes('Rank'))).toBe(false)
    const ui = await mountPaneFor($, 'dojo-roster')
    const out = await textsIn(ui)
    expect(out.some(l => l.startsWith('Rank'))).toBe(false)
    expect(out[3]).toMatch(/^─+$/)
    await ui.unmount()
  })

  test('toasts off: the point is kept, the rank-up is silent', { options: { toasts: false } }, async ($, on) => {
    const mem = memStore(on, { rank: { points: 24 } })
    const w = world(on)
    await ret(w, $)('dojo:levi', 'completed')
    expect(mem.get('rank')).toEqual({ points: 25 })
    expect(w.toasts).toEqual([])
  })
})

const textsOf = textsIn

describe('/dojo-recap', () => {
  const state = async ($: Engine, on: On, env: Record<string, string> = { DOJO_STRATEGIST: 'shikamaru' }) => {
    const mem = memStore(on)
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    const w = world(on, { env })
    bottomPaneFor(on)
    return { w, run: crewRuns(w, $) }
  }

  test('registers beside /dojo, opens its own pane, and falls back to text where no pane is placed', async ($, on) => {
    const w = world(on, { env: { DOJO_STRATEGIST: 'lelouch' } })
    await $.session.start({ cwd: '/x', surface: 'terminal', isInteractive: true })
    expect(w.registered).toEqual(expect.arrayContaining(['dojo', 'dojo-recap', 'dojo-gallery']))
    await $.command.run(slash('dojo-recap'))
    expect(w.opened).toEqual(['dojo-recap'])
  })

  test('a pane that cannot be placed gets the report as text', async ($, on) => {
    world(on, { placed: false, env: { DOJO_STRATEGIST: 'lelouch' } })
    const ran = await $.command.run(slash('dojo-recap'))
    expect(ran.text).toContain('Mission report')
    expect(ran.text).toContain('No crew deployed this session.')
    expect(ran.text).toContain(`“${RECAP_SIGNOFFS.lelouch?.empty}”`)
  })

  test("the member line sums each run's final figure by Claude Code's formula", async ($, on) => {
    const { w } = await state($, on)
    const run = stepRuns(on, w, $)
    const u = (input_tokens: number, output_tokens: number, cache_read_input_tokens: number): StepUsage => ({ input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens: 0 })
    await run('dojo:senku', [u(10, 500, 70_000), u(20, 400, 78_000)], 60_000)
    const ui = await mountPaneFor($, 'dojo-recap')
    expect(await textsIn(ui)).toContain('🧪 Senku   1 run · 1m 00s · 78.9k tokens')
    await ui.unmount()
  })

  test('who was deployed, their time and last Says, the fall on its member line, the final figures, the rank and the sign-off', async ($, on) => {
    const { run } = await state($, on)
    await $.session.measure(measureOf(58, 1.42) as never)
    await run('dojo:levi', 'completed', { answer: 'Verdict: PASS\nSays: "Mostly clean. Fix the corner I marked."', ms: 100_000, input: 8000, output: 1000 })
    await run('dojo:levi', 'completed', { answer: 'ok', ms: 92_000, input: 4000, output: 1200 })
    await run('dojo:senku', 'failed')
    const ui = await mountPaneFor($, 'dojo-recap')
    const out = await textsIn(ui)
    expect(out[0]).toMatch(/^◖═ 📜 Mission report ═+◗$/)
    expect(out).toContain('🦌 Shikamaru on duty')
    expect(out).toContain('Deployed: 2 of 7 crew · 3 runs')
    expect(out).toContain('🧹 Levi    2 runs · 3m 12s · 14.2k tokens')
    expect(out).toContain('   “Mostly clean. Fix the corner I marked.”')
    expect(out).toContain('🧪 Senku   1 run ✖ fell ×1')
    expect(out.some(l => l.startsWith('Fallen'))).toBe(false)
    expect(out).toContain('Final context 58% · cost $1.42')
    expect(out.find(l => l.startsWith('Rank:'))).toContain('Genin')
    expect(out).toContain(`🦌 “${RECAP_SIGNOFFS.shikamaru?.rough}”`)
    // the sign-off closes the report, between the last roll and the hint under the pane
    expect(out.at(-3)).toBe(`🦌 “${RECAP_SIGNOFFS.shikamaru?.rough}”`)
    expect(out.at(-2)).toMatch(/^◖═+◗$/)
    expect((await ui.find({ type: 'Button' }))?.props.label).toBe('close')
    await ui.unmount()
  })

  test('everyone back: the clean sign-off, no fall anywhere; the other strategist speaks for himself', async ($, on) => {
    const { run } = await state($, on, { DOJO_STRATEGIST: 'lelouch' })
    await run('dojo:robin', 'completed', { answer: 'ok', ms: 7_000 })
    const ui = await mountPaneFor($, 'dojo-recap')
    const out = await textsIn(ui)
    expect(out.some(l => l.includes('fell') || l.startsWith('Fallen'))).toBe(false)
    expect(out).toContain(`♟️ “${RECAP_SIGNOFFS.lelouch?.clean}”`)
    expect(out).toContain('🌸 Robin   1 run · 7s')
    expect(out.find(l => l.startsWith('Rank:'))).toContain('Pawn')
    await ui.unmount()
  })

  test('an empty session: nothing deployed, the sign-off for that, and the figures not yet measured', async ($, on) => {
    await state($, on)
    const ui = await mountPaneFor($, 'dojo-recap')
    const out = await textsIn(ui)
    expect(out).toContain('No crew deployed this session.')
    expect(out.some(l => l.startsWith('Deployed'))).toBe(false)
    expect(out.some(l => l.startsWith('Fallen'))).toBe(false)
    expect(out.some(l => l.startsWith('Final context and cost: not measured yet'))).toBe(true)
    expect(out).toContain(`🦌 “${RECAP_SIGNOFFS.shikamaru?.empty}”`)
    await ui.unmount()
  })

  test('no persona on duty: the neutral sign-off', async ($, on) => {
    await state($, on, {})
    const ui = await mountPaneFor($, 'dojo-recap')
    const out = await textsIn(ui)
    expect(out).toContain('No strategist on duty')
    expect(out).toContain(`🎴 “${RECAP_SIGNOFFS.strategist?.empty}”`)
    await ui.unmount()
  })

  test('narrow widths: every line inside the pane', async ($, on) => {
    const { run } = await state($, on, { DOJO_STRATEGIST: 'lelouch' })
    await $.session.measure(measureOf(91, 12.5) as never)
    await run('dojo:levi', 'completed', { answer: 'Says: "A very long closing line that cannot possibly fit in a narrow pane at all."', ms: 100_000, input: 8000, output: 1000 })
    await run('dojo:senku', 'failed')
    for (const columns of [100, 56, 40, 30, 20, 12]) {
      const ui = await mountPaneFor($, 'dojo-recap', { bodyColumns: columns })
      for (const l of await textsIn(ui)) expect(cellWidth(l), `${columns}: ${l}`).toBeLessThanOrEqual(columns)
      await ui.unmount()
    }
  })

  test('the plain helper: lines and text agree, and the rank is left out when not given', () => {
    const input = { persona: 'shikamaru', stats: {}, usage: null, columns: 60 }
    expect(recapLines(input).some(l => l.some(seg => seg.text.startsWith('Rank')))).toBe(false)
    expect(recapText(input)).toContain('No crew deployed this session.')
    expect(recapText({ ...input, rank: { points: 30, saved: true } })).toContain('Rank: Chūnin')
  })

  test('rosterPane off: no command, no pane', { options: { rosterPane: false } }, async ($, on) => {
    const w = world(on)
    bottomPaneFor(on)
    on('command.run', (_$, e) => ({ text: `engine ${e.command}` }))
    await $.session.start({ cwd: '/x', surface: 'terminal', isInteractive: true })
    expect(w.registered).not.toEqual(expect.arrayContaining(['dojo']))
    expect(w.registered).not.toContain('dojo-recap')
    expect(w.registered).not.toContain('dojo-gallery')
    expect((await $.command.run(slash('dojo-recap'))).text).toBe('engine dojo-recap')
    expect(w.opened).toEqual([])
    const ui = await mountPaneFor($, 'dojo-recap')
    expect(await textsIn(ui)).toEqual(['ENGINE-PANE'])
    await ui.unmount()
  })

  test('dismiss: close closes the recap pane', async ($, on) => {
    const { w } = await state($, on)
    const ui = await mountPaneFor($, 'dojo-recap')
    await ui.press({ key: 'close' })
    expect(w.closed).toEqual(['dojo-recap'])
    await ui.unmount()
  })
})

describe('/dojo-gallery', () => {
  const pageOf = async (ui: Awaited<ReturnType<typeof mountPaneFor>>) => (await textsIn(ui)).filter(l => l.trim() !== '')

  test('opens its pane at the first character, with the banner, both palettes, words, lines and a bubble', async ($, on) => {
    const w = world(on, { env: { DOJO_STRATEGIST: 'shikamaru' } })
    bottomPaneFor(on)
    await $.session.start({ cwd: '/x', surface: 'terminal', isInteractive: true })
    await $.command.run(slash('dojo-gallery'))
    expect(w.opened).toEqual(['dojo-gallery'])
    const ui = await mountPaneFor($, 'dojo-gallery')
    const page = await pageOf(ui)
    expect(page[0]).toBe('🦌 Shikamaru · strategist  1/10')
    for (const row of BANNERS.shikamaru ?? []) expect(page).toContain(row)
    expect(page.find(l => l.startsWith('Colors'))).toContain(tint('shikamaru', 'dark'))
    expect(page.find(l => l.startsWith('Colors'))).toContain(accentFor('shikamaru', 'dark'))
    expect(page.find(l => l.includes('light'))).toContain(colorFor('shikamaru', 'light'))
    expect(page.find(l => l.startsWith('Frames'))).toContain(framesOf('shikamaru').join(' '))
    expect(page.find(l => l.startsWith('Verbs'))).toContain(WORDS.shikamaru?.verbs[0])
    expect(page.find(l => l.startsWith('Turn end'))).toContain('Outmaneuvered')
    expect(page.find(l => l.startsWith('Usage'))).toContain(usageBar(58, 10, 'shikamaru'))
    expect(page.find(l => l.startsWith('Ranks'))).toContain('Genin 0 · Chūnin 25 · Jōnin 100 · Kage 300')
    expect(page.some(l => l.includes(SAYS_SAMPLES.shikamaru ?? '?'))).toBe(true)
    await ui.unmount()
  })

  test('a crew page shows deploy, return and fallen lines, and its own bubble shape', async ($, on) => {
    world(on)
    bottomPaneFor(on)
    const ui = await mountPaneFor($, 'dojo-gallery')
    // sanji is the fifth page
    for (let i = 0; i < 4; i++) await ui.press({ key: 'next' })
    const page = await pageOf(ui)
    expect(page[0]).toBe('🍳 Sanji · frontend  5/10')
    expect(page.find(l => l.startsWith('Deploy'))).toContain('“Allow me.”')
    expect(page.find(l => l.startsWith('Return'))).toContain('“Served.”')
    expect(page.find(l => l.startsWith('Fallen'))).toContain(`“${FALL_LINES.sanji}”`)
    expect(page.some(l => l.includes('╭') && l.startsWith('Says'))).toBe(true)
    expect(page.some(l => l.includes('~<│ Served. Merorin~ (swooning)'))).toBe(true)
    expect(page.some(l => l.startsWith('Turn end'))).toBe(false)
    await ui.unmount()
  })

  test('next and prev walk the characters and wrap around', async ($, on) => {
    world(on)
    bottomPaneFor(on)
    const ui = await mountPaneFor($, 'dojo-gallery')
    const head = async () => (await pageOf(ui))[0]
    expect(await head()).toContain('1/10')
    await ui.press({ key: 'prev' })
    expect(await head()).toBe('🌸 Robin · docs  10/10')
    await ui.press({ key: 'next' })
    expect(await head()).toBe('🦌 Shikamaru · strategist  1/10')
    await ui.press({ key: 'next' })
    expect(await head()).toBe('♟️ Lelouch · strategist  2/10')
    await ui.press({ key: 'next' })
    expect(await head()).toBe('🎴 Strategist · strategist  3/10')
    await ui.unmount()
  })

  test('every page fits every width', async ($, on) => {
    world(on)
    bottomPaneFor(on)
    for (const columns of [100, 64, 48, 40, 30, 20, 12]) {
      const ui = await mountPaneFor($, 'dojo-gallery', { bodyColumns: columns })
      for (let i = 0; i < GALLERY_ORDER.length; i++) {
        const page = await textsIn(ui)
        for (const l of page) expect(cellWidth(l), `${columns} p${i}: ${l}`).toBeLessThanOrEqual(columns)
        await ui.press({ key: 'next' })
      }
      await ui.unmount()
    }
  })

  test('the banner is dropped where it does not fit, and the page keeps the rest', () => {
    const wide = galleryLines({ index: 0, columns: 80 }).map(l => l.map(seg => seg.text).join(''))
    const narrow = galleryLines({ index: 0, columns: 20 }).map(l => l.map(seg => seg.text).join(''))
    expect(wide).toContain(BANNERS.shikamaru?.[0])
    expect(narrow).not.toContain(BANNERS.shikamaru?.[0])
    expect(narrow.some(l => l.startsWith('Colors'))).toBe(true)
    expect(galleryKey(-1)).toBe('robin')
    expect(galleryKey(10)).toBe('shikamaru')
    expect(galleryKey(Number.NaN)).toBe('shikamaru')
  })

  test('the active palette is marked, and the colors are those of each mode', () => {
    const dark = galleryLines({ index: 4, columns: 80, mode: 'dark' }).map(l => l.map(seg => seg.text).join(''))
    const light = galleryLines({ index: 4, columns: 80, mode: 'light' }).map(l => l.map(seg => seg.text).join(''))
    expect(dark.find(l => l.includes('dark'))).toMatch(/◂$/)
    expect(dark.find(l => l.includes('light'))).not.toMatch(/◂$/)
    expect(light.find(l => l.includes('light'))).toMatch(/◂$/)
    const swatches = galleryLines({ index: 4, columns: 80 }).flat().filter(seg => seg.text === '██').map(seg => seg.color)
    expect(swatches).toEqual([tint('sanji', 'dark'), accentFor('sanji', 'dark'), tint('sanji', 'light'), accentFor('sanji', 'light')])
  })

  test('a speech bubble wraps its words inside the width', () => {
    expect(wrapWords('one two three four', 9)).toEqual(['one two', 'three', 'four'])
    expect(wrapWords('', 9)).toEqual([])
    expect(wrapWords('supercalifragilistic', 8)).toEqual(['superca…'])
  })

  test('the plain-text fallback is the current page', async ($, on) => {
    world(on, { placed: false })
    const ran = await $.command.run(slash('dojo-gallery'))
    expect(ran.text).toContain('Shikamaru · strategist  1/10')
    expect(ran.text).toContain(SAYS_SAMPLES.shikamaru)
  })

  test('dismiss: close closes the gallery', async ($, on) => {
    const w = world(on)
    bottomPaneFor(on)
    const ui = await mountPaneFor($, 'dojo-gallery')
    await ui.press({ key: 'close' })
    expect(w.closed).toEqual(['dojo-gallery'])
    await ui.unmount()
  })

  test('rosterPane off: no gallery either', { options: { rosterPane: false } }, async ($, on) => {
    const w = world(on)
    bottomPaneFor(on)
    on('command.run', (_$, e) => ({ text: `engine ${e.command}` }))
    expect((await $.command.run(slash('dojo-gallery'))).text).toBe('engine dojo-gallery')
    expect(w.opened).toEqual([])
    const ui = await mountPaneFor($, 'dojo-gallery')
    expect(await textsIn(ui)).toEqual(['ENGINE-PANE'])
    await ui.unmount()
  })

  test('a throw while drawing falls back to the engine pane', async ($, on) => {
    world(on)
    bottomPaneFor(on)
    const ui = await mountPaneFor($, 'dojo-gallery', { bodyColumns: Number.NaN })
    expect((await textsIn(ui)).length).toBeGreaterThan(0)
    await ui.unmount()
  })
})

describe('kurisu and jiraiya', () => {
  const pair = [
    { key: 'kurisu', emoji: '🔬', name: 'Kurisu', role: 'architect', model: 'sonnet 5.5' },
    { key: 'jiraiya', emoji: '🐸', name: 'Jiraiya', role: 'web research', model: 'haiku 5.5' },
  ] as const

  test('toasts: deploy with the original line, a return with and without Says, a fall', async ($, on) => {
    const w = world(on)
    for (const [i, c] of pair.entries()) {
      const id = `ag-${i + 1}`
      w.setAgents([agent(id, `dojo:${c.key}`, 'running')])
      await $.agent.spawn(spawnInput(`dojo:${c.key}`, undefined, 'a'))
    }
    expect(w.toasts).toEqual([`🔬 Kurisu deployed — “${WORDS.kurisu?.deploy}”`, `🐸 Jiraiya deployed — “${WORDS.jiraiya?.deploy}”`])
    w.setAgents([agent('ag-1', 'dojo:kurisu', 'running'), agent('ag-2', 'dojo:jiraiya', 'running')])
    await w.clock.advance(1000)
    await $.turn.complete(done('ag-1', 'Done: options laid out\nSays: "Hypothesis stated."'))
    w.setAgents([agent('ag-1', 'dojo:kurisu', 'completed'), agent('ag-2', 'dojo:jiraiya', 'failed')])
    await w.clock.advance(300)
    expect(w.toasts.slice(2).sort()).toEqual([`💀 Jiraiya fell — “${FALL_LINES.jiraiya}”`, '🔬 Kurisu returned — “Hypothesis stated.”'].sort())
  })

  test('a report with no Says line returns with a line from their own set', async ($, on) => {
    const w = world(on)
    for (const [i, c] of pair.entries()) {
      w.setAgents([agent(`ag-${i + 1}`, `dojo:${c.key}`, 'running')])
      await $.agent.spawn(spawnInput(`dojo:${c.key}`, undefined, 'a'))
    }
    w.setAgents([agent('ag-1', 'dojo:kurisu', 'completed'), agent('ag-2', 'dojo:jiraiya', 'completed')])
    await w.clock.advance(300)
    expect(w.toasts.slice(2).sort()).toEqual([`🐸 Jiraiya returned — “${RETURN_TOAST.jiraiya?.[0]}”`, `🔬 Kurisu returned — “${RETURN_TOAST.kurisu?.[0]}”`].sort())
  })

  test('every toast line is within the cell budget, whichever line is picked', async ($, on) => {
    const w = world(on)
    w.setAgents([])
    for (const c of pair) for (let i = 0; i < 8; i++) await $.agent.spawn(spawnInput(`dojo:${c.key}`, undefined, 'a'))
    expect(w.toasts).toHaveLength(16)
    for (const t of w.toasts) expect(cellWidth(t), t).toBeLessThanOrEqual(60)
    for (const key of ['kurisu', 'jiraiya']) {
      expect(DEPLOY_MORE[key]?.length).toBeGreaterThanOrEqual(3)
      for (const line of [...(DEPLOY_MORE[key] ?? []), ...(RETURN_TOAST[key] ?? []), ...(FALL_LINES[key] === undefined ? [] : [FALL_LINES[key]])]) {
        expect(`${CREW[key]?.emoji} ${CREW[key]?.name} returned — “${line}”`.length, line).toBeLessThanOrEqual(60)
      }
    }
  })

  test('the /dojo pane lists both with role and model, and every crew member carries the roster model label', async ($, on) => {
    world(on, { env: { DOJO_STRATEGIST: 'shikamaru' } })
    bottomPaneFor(on)
    const ui = await mountPaneFor($, 'dojo-roster')
    const out = await textsIn(ui)
    for (const c of pair) {
      const row = out.find(l => l.includes(c.name))
      expect(row, c.name).toBeDefined()
      expect(row).toContain(c.emoji)
      expect(row).toContain(c.role)
      expect(row).toContain(c.model)
      expect(row).toContain('idle')
    }
    const labels = Object.fromEntries(Object.keys(CREW).map(k => [k, modelLabel(MODELS[k] ?? '')]))
    expect(labels).toEqual({ senku: 'haiku 5.5', sanji: 'haiku 5.5', kurisu: 'sonnet 5.5', jiraiya: 'haiku 5.5', light: 'haiku 5.5', levi: 'haiku 5.5', robin: 'haiku 5.5' })
    expect(modelLabel(MODELS.strategist ?? '')).toBe('opus 5.5')
    expect(out[2]).toContain('7 idle')
    await ui.unmount()
  })

  test('the pane rows line up at every width: names, roles and models are plain ASCII beside the emoji', () => {
    for (const columns of [100, 80, 60, 40, 30]) {
      const text = rosterLines({ persona: 'shikamaru', voice: null, entries: {}, frame: 0, columns }).map(l => l.map(s => s.text).join(''))
      for (const c of pair) expect(text.some(l => l.includes(c.name)), `${columns}: ${c.name}`).toBe(true)
      for (const l of text) expect(cellWidth(l), `${columns}: ${l}`).toBeLessThanOrEqual(Math.max(columns, 30))
    }
  })

  test('the gallery has a page for each, after Sanji and before Light, and nothing is left of the old key', async ($, on) => {
    expect(GALLERY_ORDER.slice(3, 8)).toEqual(['senku', 'sanji', 'kurisu', 'jiraiya', 'light'])
    expect(GALLERY_ORDER).not.toContain('l')
    expect(Object.keys(SAYS_SAMPLES)).not.toContain('l')
    world(on)
    bottomPaneFor(on)
    const ui = await mountPaneFor($, 'dojo-gallery')
    for (let i = 0; i < 5; i++) await ui.press({ key: 'next' })
    const k = (await textsIn(ui)).filter(l => l.trim() !== '')
    expect(k[0]).toBe('🔬 Kurisu · architect  6/10')
    for (const row of BANNERS.kurisu ?? []) expect(k).toContain(row)
    expect(k.find(l => l.startsWith('Deploy'))).toContain(`“${WORDS.kurisu?.deploy}”`)
    expect(k.find(l => l.startsWith('Colors'))).toContain(tint('kurisu', 'dark'))
    expect(k.some(l => l.includes('.<│'))).toBe(true)
    await ui.press({ key: 'next' })
    const j = (await textsIn(ui)).filter(l => l.trim() !== '')
    expect(j[0]).toBe('🐸 Jiraiya · web research  7/10')
    for (const row of BANNERS.jiraiya ?? []) expect(j).toContain(row)
    expect(j.find(l => l.startsWith('Fallen'))).toContain(`“${FALL_LINES.jiraiya}”`)
    expect(j.some(l => l.includes('o<│'))).toBe(true)
    await ui.unmount()
  })

  test('the band row of each: its glyphs, emoji and name in their color, in both palettes', () => {
    for (const c of pair) {
      for (const mode of ['dark', 'light'] as const) {
        const [row] = planBand({ persona: 'shikamaru', rows: [{ key: c.key, description: 'x', elapsedMs: 5000 }], frame: 0, columns: 80, maxRows: 3, mode })
        expect(row?.[0]?.text).toBe(`${framesOf(c.key)[0]} ${c.emoji} `)
        expect(row?.[0]?.color).toBe(colorFor(c.key, mode))
        expect(row?.[1]?.text.trim()).toBe(c.name)
      }
    }
  })
})
