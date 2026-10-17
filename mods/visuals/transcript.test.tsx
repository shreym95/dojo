import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { AgentInfo, EngineInterface, On, RenderComponent, RenderPropsOf, RenderSurface } from 'claude-code'

import { CREW, NEUTRAL, STRATEGISTS } from '../theme'
import { agent, core } from '../lib/testkit'
import { ASKS, BANNERS, BANNER_COLUMNS, BANNER_ROWS, BUBBLES, DEPLOY_LINES, ERROR_MARKS, FALLEN_LINES, MOTIFS, NEUTRAL_BANNER, RETURN_LINES } from './transcript-art'
import { bannerRows, cells, clip, dojoCommand, dutyNameOf, extractSays, fitLine, line, modeOf, paint, remember, tinyMark, agentFacts, LANE_CAP } from './transcript-lib'

const PLUGIN = 'dojo'

type Node = string | { type: string; props?: Record<string, unknown>; children?: Node[] }

const TERMINAL = { columns: 80, rows: 24 } as const

/** The text a Text element shows, nested inline Texts included. */
const flat = (n: Node): string => (typeof n === 'string' ? n : (n.children ?? []).map(flat).join(''))
/** One entry per Text (or loose string) in the tree, in order. */
function lines(n: Node): string[] {
  if (typeof n === 'string') return [n]
  if (n.type === 'Text') return [flat(n)]
  return (n.children ?? []).flatMap(lines)
}
function elements(n: Node, pred: (e: Exclude<Node, string>) => boolean): Exclude<Node, string>[] {
  if (typeof n === 'string') return []
  return [...(pred(n) ? [n] : []), ...(n.children ?? []).flatMap(c => elements(c, pred))]
}
const withProp = (n: Node, key: string, value?: unknown) =>
  elements(n, e => e.props !== undefined && key in e.props && (value === undefined || e.props[key] === value))

const ENGINE = 'ENGINE-DRAWING'

type Spec<C extends RenderComponent> = {
  component: C
  props: RenderPropsOf[C]
  surface?: RenderSurface
  viewport?: { columns: number; rows: number }
  requestId?: string
}

const OWNED: RenderComponent[] = ['AssistantMessage', 'UserMessage', 'ToolUse', 'ToolResult', 'ToolGroup', 'ToolProgress', 'CommandOutput', 'AskUserQuestion', 'InfoNotice']

/** Beneath the plugin: the engine draws `ENGINE` for every owned component (the dialog as one engine node); no crew running. */
function setup(on: On, env: Record<string, string> = {}, agents: AgentInfo[] = []) {
  core(on, env)
  mock.clock(on)
  on('agent.list', () => ({ value: agents }))
  for (const component of OWNED) {
    on('ui.render', { component } as never, (($: EngineInterface, e: { surface: 'terminal'; component: RenderComponent }) =>
      component === 'AskUserQuestion' ? { type: 'engine', ref: 0 } : $.ui.resolve(e).Text({ children: ENGINE })) as never)
  }
}

/** Nothing added: the engine's drawing alone (the dialog is one engine node, the rest a Text). */
const bare = (tree: Node) => (typeof tree !== 'string' && tree.type === 'engine') || (typeof tree !== 'string' && tree.type === 'Text' && flat(tree) === ENGINE)
const carriesEngine = (tree: Node) => lines(tree).includes(ENGINE) || elements(tree, e => e.type === 'engine').length === 1

const has = (rows: string[], part: string) => rows.some(r => r.includes(part))

async function draw<C extends RenderComponent>($: Engine, _on: On, spec: Spec<C>) {
  const ui = await $.ui.mount({
    plugin: PLUGIN,
    surface: spec.surface ?? 'terminal',
    component: spec.component,
    props: spec.props,
    viewport: spec.viewport ?? TERMINAL,
    ...(spec.requestId === undefined ? {} : { requestId: spec.requestId }),
  })
  const tree = (await ui.drawn()) as Node
  await ui.unmount()
  return tree
}

const SHIKAMARU = { DOJO_STRATEGIST: 'shikamaru' }
const LELOUCH = { DOJO_STRATEGIST: 'lelouch' }

const msg = { text: 'hello there', isFirstOfReply: true } as const
const user = { text: 'build it', origin: { kind: 'composer' }, isExpanded: false } as const
const toolUse = (over: Record<string, unknown> = {}) =>
  ({ tool_use_id: 'tu-1', tool: 'Bash', input: { command: 'ls' }, isRunning: false, isErrored: false, isInterrupted: false, ...over }) as never
const toolResult = (over: Record<string, unknown> = {}) => ({ tool_use_id: 'tu-1', tool: 'Bash', output: { stdout: 'x' }, isErrored: false, ...over }) as never
const agentUse = (type: string, over: Record<string, unknown> = {}) =>
  toolUse({ tool_use_id: 'tu-a', tool: 'Agent', input: { description: 'QA the cart', prompt: 'p', subagent_type: type }, ...over })
const agentOut = (text: string, over: Record<string, unknown> = {}) =>
  ({
    agentId: 'ag-levi',
    status: 'completed',
    content: [{ type: 'text', text }],
    totalToolUseCount: 7,
    totalDurationMs: 12300,
    ...over,
  }) as never

describe('strategist frame', () => {
  test('shikamaru: green stripe, deer header with cloud motif, text untouched', async ($, on) => {
    setup(on, SHIKAMARU)
    const tree = await draw($, on, { component: 'AssistantMessage', props: msg })
    const rows = lines(tree)
    expect(rows).toEqual([ENGINE])
    expect(withProp(tree, 'backgroundColor', '#5B8C5A')).toHaveLength(1)
  })

  test('lelouch: purple stripe, gold rule, chess motif', async ($, on) => {
    setup(on, LELOUCH)
    const tree = await draw($, on, { component: 'AssistantMessage', props: msg })
    expect(lines(tree)).toEqual([ENGINE])
    expect(withProp(tree, 'backgroundColor', '#9E62CA')).toHaveLength(1)
  })

  test('no persona: neutral theme', async ($, on) => {
    setup(on)
    const tree = await draw($, on, { component: 'AssistantMessage', props: msg })
    expect(lines(tree)).toEqual([ENGINE])
    expect(withProp(tree, 'backgroundColor', '#94A3B8')).toHaveLength(1)
  })

  test('later blocks of a reply carry the stripe without the header', async ($, on) => {
    setup(on, SHIKAMARU)
    const tree = await draw($, on, { component: 'AssistantMessage', props: { text: 'more', isFirstOfReply: false } })
    expect(lines(tree)).toEqual([ENGINE])
    expect(withProp(tree, 'backgroundColor', '#5B8C5A')).toHaveLength(1)
  })

  test('narrow: compact header, no rule, still striped', async ($, on) => {
    setup(on, SHIKAMARU)
    const tree = await draw($, on, { component: 'AssistantMessage', props: msg, viewport: { columns: 40, rows: 24 } })
    expect(lines(tree)).toEqual([ENGINE])
  })
})

describe('user message', () => {
  test('composer prompt gets a restrained seal in the accent', async ($, on) => {
    setup(on, LELOUCH)
    const tree = await draw($, on, { component: 'UserMessage', props: user })
    expect(lines(tree)).toEqual([ENGINE])
  })

  test('a notification row is left alone', async ($, on) => {
    setup(on, LELOUCH)
    const tree = await draw($, on, { component: 'UserMessage', props: { ...user, origin: { kind: 'task-notification' } } as never })
    expect(tree).toMatchObject({ type: 'Text' })
    expect(lines(tree)).toEqual([ENGINE])
  })
})

describe('tool rows', () => {
  test('the strategist badges its own call', async ($, on) => {
    setup(on, SHIKAMARU)
    const tree = await draw($, on, { component: 'ToolUse', props: toolUse() })
    expect(lines(tree)).toEqual([ENGINE])
  })

  test('an errored call is marked on the badge', async ($, on) => {
    setup(on, SHIKAMARU)
    const tree = await draw($, on, { component: 'ToolUse', props: toolUse({ isErrored: true }) })
    expect(lines(tree)).toEqual([ENGINE])
  })

  test('a dojo subagent badges its own call, found through tool.call', async ($, on) => {
    setup(on, SHIKAMARU, [agent('ag-levi', 'dojo:levi'), agent('ag-x', 'general-purpose')])
    await $.tool.call({ tool: 'Bash', command: 'ls', tool_use_id: 'tu-9', agentId: 'ag-levi' } as never)
    await $.tool.call({ tool: 'Bash', command: 'ls', tool_use_id: 'tu-8', agentId: 'ag-x' } as never)
    const crew = await draw($, on, { component: 'ToolUse', props: toolUse({ tool_use_id: 'tu-9' }) })
    expect(lines(crew)).toEqual(['🧹', ENGINE])
    expect(withProp(crew, 'color', '#708090')).toHaveLength(1)
    // some other subagent: no badge at all
    const other = await draw($, on, { component: 'ToolUse', props: toolUse({ tool_use_id: 'tu-8' }) })
    expect(lines(other)).toEqual([ENGINE])
  })

  test('narrow: emoji-only badge', async ($, on) => {
    setup(on, SHIKAMARU)
    const tree = await draw($, on, { component: 'ToolUse', props: toolUse(), viewport: { columns: 40, rows: 24 } })
    expect(lines(tree)).toEqual([ENGINE])
  })

  test('errored result: character mark above the engine drawing, error text untouched', async ($, on) => {
    setup(on, SHIKAMARU, [agent('ag-levi', 'dojo:levi')])
    await $.tool.call({ tool: 'Bash', command: 'ls', tool_use_id: 'tu-9', agentId: 'ag-levi' } as never)
    const crew = await draw($, on, { component: 'ToolResult', props: toolResult({ tool_use_id: 'tu-9', isErrored: true }) })
    expect(lines(crew)).toEqual(['🧹 ✗ Filthy.', ENGINE])
    expect(withProp(crew, 'color', 'error')).toHaveLength(1)
    const main = await draw($, on, { component: 'ToolResult', props: toolResult({ isErrored: true }) })
    expect(lines(main)).toEqual([ENGINE])
  })

  test('a clean result is left alone', async ($, on) => {
    setup(on, SHIKAMARU)
    const tree = await draw($, on, { component: 'ToolResult', props: toolResult() })
    expect(tree).toMatchObject({ type: 'Text' })
    expect(lines(tree)).toEqual([ENGINE])
  })

  test('group: badge by the callers, a mix shows each', async ($, on) => {
    setup(on, SHIKAMARU, [agent('ag-levi', 'dojo:levi')])
    await $.tool.call({ tool: 'Read', file_path: '/a', tool_use_id: 'tu-9', agentId: 'ag-levi' } as never)
    const calls = (ids: (string | undefined)[], errored = false) =>
      ids.map(tool_use_id => ({ tool_use_id, tool: 'Read', input: {}, isRunning: false, isErrored: errored, isInterrupted: false }))
    const main = await draw($, on, { component: 'ToolGroup', props: { calls: calls(['tu-1', undefined]), isActive: false, isExpanded: false } })
    expect(lines(main)).toEqual([ENGINE])
    const mixed = await draw($, on, { component: 'ToolGroup', props: { calls: calls(['tu-1', 'tu-9']), isActive: false, isExpanded: false } })
    expect(lines(mixed)).toEqual(['🧹', ENGINE])
    const bad = await draw($, on, { component: 'ToolGroup', props: { calls: calls(['tu-1'], true), isActive: false, isExpanded: false } })
    expect(lines(bad)).toEqual([ENGINE])
  })

  test('progress row: badge of the caller', async ($, on) => {
    setup(on, SHIKAMARU)
    const tree = await draw($, on, {
      component: 'ToolProgress',
      props: { tool_use_id: 'tu-1', kind: 'background_hint', hint: '(ctrl+b to run in background)' },
    })
    expect(lines(tree)).toEqual([ENGINE])
  })
})

describe('crew cards', () => {
  test('a dojo spawn is drawn as a card: banner, emoji, name, role, border, task, signature', { options: { banners: true } }, async ($, on) => {
    setup(on, SHIKAMARU)
    const tree = await draw($, on, { component: 'ToolUse', props: agentUse('dojo:levi') })
    const rows = lines(tree)
    expect(has(rows, 'L E V I')).toBe(true)
    expect(has(rows, 'spotless')).toBe(true)
    expect(rows).toContain('🧹 Levi · QA · ▸ deployed')
    expect(rows).toContain('task  QA the cart')
    expect(rows.some(r => DEPLOY_LINES.levi?.some(l => r === `“${l}”`))).toBe(true)
    expect(rows[rows.length - 1]).toBe(ENGINE)
    const border = withProp(tree, 'borderStyle', 'round')
    expect(border).toHaveLength(1)
    expect(border[0]?.props).toMatchObject({ borderColor: '#708090', width: 46 })
  })

  test('every crew member has a card', { options: { banners: true } }, async ($, on) => {
    setup(on, SHIKAMARU)
    for (const [key, c] of Object.entries(CREW)) {
      const tree = await draw($, on, { component: 'ToolUse', props: agentUse(`dojo:${key}`) })
      expect(lines(tree).some(r => r.startsWith(`${c.emoji} ${c.name} · ${c.role}`))).toBe(true)
      expect(withProp(tree, 'borderColor', paint(c, 'dark').color)).toHaveLength(1)
    }
  })

  test('banners off: no card, no art, one line', { options: { banners: false } }, async ($, on) => {
    setup(on, SHIKAMARU)
    const tree = await draw($, on, { component: 'ToolUse', props: agentUse('dojo:levi') })
    expect(has(lines(tree), 'L E V I')).toBe(false)
    expect(lines(tree)).toContain(`🧹 Levi ▸ QA the cart  “${line(DEPLOY_LINES.levi, 'tu-a')}”`)
  })

  test('narrow: one compact line, no border, no banner', { options: { banners: true } }, async ($, on) => {
    setup(on, SHIKAMARU)
    const tree = await draw($, on, { component: 'ToolUse', props: agentUse('dojo:levi'), viewport: { columns: 40, rows: 24 } })
    expect(lines(tree)).toEqual(['🧹 Levi · ▸ deployed · QA the cart', ENGINE])
    expect(withProp(tree, 'borderStyle')).toHaveLength(0)
  })

  test('a non-dojo Agent call and the strategist agent type get no card', async ($, on) => {
    setup(on, SHIKAMARU)
    for (const type of ['general-purpose', 'dojo:strategist', 'dojo:nobody']) {
      const tree = await draw($, on, { component: 'ToolUse', props: agentUse(type) })
      expect(lines(tree)).toEqual([ENGINE])
      expect(withProp(tree, 'borderStyle')).toHaveLength(0)
    }
  })

  test('a failed spawn is a fallen card', { options: { banners: true } }, async ($, on) => {
    setup(on, SHIKAMARU)
    const tree = await draw($, on, { component: 'ToolUse', props: agentUse('dojo:levi', { isErrored: true }) })
    expect(lines(tree)).toContain('💀 Levi · QA · ✗ fell')
    expect(withProp(tree, 'borderColor', 'error')).toHaveLength(1)
  })
})

describe('return cards', () => {
  const SAYS = 'Mostly clean. Fix the corner I marked.'
  const REPORT = `Verdict: PASS WITH ISSUES\nDefects: none\nSays: "${SAYS}"`

  test('the Says line becomes a speech bubble in the character colour; the result is untouched', { options: { banners: true } }, async ($, on) => {
    setup(on, SHIKAMARU)
    await $.tool.call({ tool: 'Agent', subagent_type: 'dojo:levi', description: 'QA', prompt: 'p', tool_use_id: 'tu-a' } as never)
    const tree = await draw($, on, { component: 'ToolResult', props: toolResult({ tool_use_id: 'tu-a', tool: 'Agent', output: agentOut(REPORT) }) })
    const rows = lines(tree)
    expect(rows).toContain('🧹 Levi · QA · ✓ returned')
    expect(rows).toContain('7 tools · 12.3s')
    expect(rows).toContain(SAYS)
    expect(rows.some(r => RETURN_LINES.levi?.some(l => r === `“${l}”`))).toBe(true)
    expect(rows[rows.length - 1]).toBe(ENGINE)
    const bubble = withProp(tree, 'borderStyle', BUBBLES.levi?.borderStyle)
    expect(bubble).toHaveLength(1)
    expect(bubble[0]?.props).toMatchObject({ borderColor: '#708090' })
    // the report text is never altered or consumed by the bubble
    expect(JSON.stringify(tree)).toContain(SAYS)
  })

  test('no Says line, no bubble; the agent type may come from the result itself', { options: { banners: true } }, async ($, on) => {
    setup(on, SHIKAMARU)
    const tree = await draw($, on, {
      component: 'ToolResult',
      props: toolResult({ tool: 'Agent', output: agentOut('Verdict: PASS', { agentType: 'dojo:robin' }) }),
    })
    expect(lines(tree)).toContain('🌸 Robin · docs · ✓ returned')
    expect(withProp(tree, 'borderStyle', BUBBLES.robin?.borderStyle)).toHaveLength(1) // the card border is round too
    expect(lines(tree).filter(r => r.startsWith('“'))).toHaveLength(1) // only the signature line
  })

  test('failed or killed: a fallen card, no bubble', { options: { banners: true } }, async ($, on) => {
    setup(on, SHIKAMARU, [agent('ag-levi', 'dojo:levi', 'killed')])
    const base = { tool: 'Agent', output: agentOut(REPORT, { agentType: 'dojo:levi' }) }
    for (const props of [{ ...base, isErrored: true }, { ...base, output: agentOut(REPORT, { agentType: 'dojo:levi', status: 'failed', agentId: 'nope' }) }, base]) {
      const tree = await draw($, on, { component: 'ToolResult', props: toolResult(props) })
      const rows = lines(tree)
      expect(rows).toContain('💀 Levi · QA · ✗ fell')
      expect(rows).not.toContain(SAYS)
      expect(rows.some(r => FALLEN_LINES.levi?.some(l => r === `“${l}”`))).toBe(true)
      expect(withProp(tree, 'borderColor', 'error')).toHaveLength(1)
      expect(rows[rows.length - 1]).toBe(ENGINE)
    }
  })

  test('a background launch is not a return', { options: { banners: true } }, async ($, on) => {
    setup(on, SHIKAMARU)
    const tree = await draw($, on, {
      component: 'ToolResult',
      props: toolResult({ tool: 'Agent', output: { status: 'async_launched', agentId: 'ag-1', agentType: 'dojo:senku' } }),
    })
    expect(lines(tree)).toContain('🧪 Senku · backend · … running in background')
  })

  test('a non-dojo Agent result is left alone', async ($, on) => {
    setup(on, SHIKAMARU)
    await $.tool.call({ tool: 'Agent', subagent_type: 'general-purpose', description: 'x', prompt: 'p', tool_use_id: 'tu-g' } as never)
    const tree = await draw($, on, { component: 'ToolResult', props: toolResult({ tool_use_id: 'tu-g', tool: 'Agent', output: agentOut(REPORT) }) })
    expect(tree).toMatchObject({ type: 'Text' })
    expect(lines(tree)).toEqual([ENGINE])
  })

  test('narrow: header and bubble collapse to lines', { options: { banners: true } }, async ($, on) => {
    setup(on, SHIKAMARU)
    const tree = await draw($, on, {
      component: 'ToolResult',
      props: toolResult({ tool: 'Agent', output: agentOut(REPORT, { agentType: 'dojo:levi' }) }),
      viewport: { columns: 40, rows: 24 },
    })
    expect(lines(tree)).toEqual(['🧹 Levi · ✓ returned', `🧹 “${SAYS}”`, ENGINE])
  })

  test('no row of any card is wider than the viewport', { options: { banners: true } }, async ($, on) => {
    setup(on, SHIKAMARU)
    for (const columns of [60, 64, 80, 120]) {
      for (const key of Object.keys(CREW)) {
        const tree = await draw($, on, {
          component: 'ToolResult',
          props: toolResult({ tool: 'Agent', output: agentOut(`Says: ${'long '.repeat(40)}`, { agentType: `dojo:${key}` }) }),
          viewport: { columns, rows: 24 },
        })
        // fixed-width boxes leave room beside them; every truncating Text fits the viewport; the rest wraps
        for (const box of withProp(tree, 'width')) expect(Number(box.props?.width)).toBeLessThanOrEqual(columns - 2)
        for (const text of elements(tree, e => e.type === 'Text' && e.props?.wrap === 'truncate-end')) {
          expect(cells(flat(text)), flat(text)).toBeLessThanOrEqual(columns)
        }
      }
    }
  })
})

describe('commands, questions, notices', () => {
  const out = (command: string, text: string, over: Record<string, unknown> = {}) => ({ command, args: '', text, isErrored: false, ...over }) as never

  test('/dojo-duty is framed with the switched-to strategist banner', { options: { banners: true } }, async ($, on) => {
    setup(on, SHIKAMARU)
    const tree = await draw($, on, { component: 'CommandOutput', props: out('dojo-duty', 'On duty: Lelouch') })
    const rows = lines(tree)
    expect(has(rows, 'L E L O U C H')).toBe(true)
    expect(rows).toContain('♟️ ♚ Lelouch · on duty')
    expect(rows[rows.length - 1]).toBe(ENGINE)
    expect(withProp(tree, 'borderColor', '#9E62CA')).toHaveLength(1)
  })

  test('/dojo-voice is one line in the current strategist style, banner-free', async ($, on) => {
    setup(on, SHIKAMARU)
    const tree = await draw($, on, { component: 'CommandOutput', props: out('dojo-voice', 'Voice level override: full') })
    expect(lines(tree)).toEqual(['🦌 Shikamaru · voice', ENGINE])
  })

  test('other commands, errors and a plugin-prefixed name', async ($, on) => {
    setup(on, SHIKAMARU)
    expect(lines(await draw($, on, { component: 'CommandOutput', props: out('cost', '$1') }))).toEqual([ENGINE])
    expect(lines(await draw($, on, { component: 'CommandOutput', props: out('dojo-duty', 'boom', { isErrored: true }) }))).toEqual([ENGINE])
    expect(lines(await draw($, on, { component: 'CommandOutput', props: out('dojo:dojo-voice', 'v') }))).toContain('🦌 Shikamaru · voice')
  })

  test('banners off: command frame without art', { options: { banners: false } }, async ($, on) => {
    setup(on, SHIKAMARU)
    const tree = await draw($, on, { component: 'CommandOutput', props: out('dojo-duty', 'On duty: Lelouch') })
    expect(lines(tree)).toEqual(['♟️ Lelouch · on duty', ENGINE])
  })

  test('AskUserQuestion passes through; the dialog is the engine', async ($, on) => {
    setup(on, LELOUCH)
    const tree = await draw($, on, { component: 'AskUserQuestion', props: { tool: 'AskUserQuestion', questions: [{ question: 'Which?' }] } })
    expect(lines(tree)).toEqual([])
    expect(elements(tree, e => e.type === 'engine')).toHaveLength(1)
    expect(bare(tree)).toBe(true)
  })

  test('InfoNotice passes through', async ($, on) => {
    setup(on, SHIKAMARU)
    const tree = await draw($, on, { component: 'InfoNotice', props: { text: 'Opus 5', command: '/model' } })
    expect(lines(tree)).toEqual([ENGINE])
  })
})

describe('toggles and failure', () => {
  const FIXTURES: { [C in RenderComponent]?: RenderPropsOf[C] } = {
    AssistantMessage: msg,
    UserMessage: user,
    ToolUse: toolUse(),
    ToolResult: toolResult({ isErrored: true }),
    ToolGroup: { calls: [], isActive: false, isExpanded: false },
    ToolProgress: { tool_use_id: 'tu-1', kind: 'background_hint', hint: 'h' },
    CommandOutput: { command: 'dojo-duty', args: '', text: 'On duty: Lelouch', isErrored: false },
    AskUserQuestion: { tool: 'AskUserQuestion', questions: [] },
    InfoNotice: { text: 't', command: null },
  }
  const COMPONENTS = Object.keys(FIXTURES) as RenderComponent[]

  test('every owned component is decorated when on', async ($, on) => {
    setup(on, SHIKAMARU, [])
    // a main-thread row, a prompt, a question and a notice pass through; a crew member's rows are the decorated ones
    const passThrough: RenderComponent[] = ['UserMessage', 'ToolUse', 'ToolResult', 'ToolProgress', 'AskUserQuestion', 'InfoNotice']
    for (const component of COMPONENTS) {
      if (component === 'ToolGroup') continue // an empty group has no one to badge
      if (passThrough.includes(component)) {
        expect(bare(await draw($, on, { component, props: FIXTURES[component] as never })), component).toBe(true)
        continue
      }
      const tree = await draw($, on, { component, props: FIXTURES[component] as never })
      expect(bare(tree), component).toBe(false)
      expect(carriesEngine(tree), component).toBe(true)
    }
  })

  test('transcriptTheme off: the engine drawing comes back untouched', { options: { transcriptTheme: false } }, async ($, on) => {
    setup(on, SHIKAMARU)
    for (const component of COMPONENTS) {
      const tree = await draw($, on, { component, props: FIXTURES[component] as never })
      expect(bare(tree), component).toBe(true)
    }
  })

  test('transcriptTheme off: no call is recorded either', { options: { transcriptTheme: false } }, async ($, on) => {
    setup(on, SHIKAMARU, [agent('ag-levi', 'dojo:levi')])
    await $.tool.call({ tool: 'Bash', command: 'ls', tool_use_id: 'tu-9', agentId: 'ag-levi' } as never)
    const tree = await draw($, on, { component: 'ToolUse', props: toolUse({ tool_use_id: 'tu-9' }) })
    expect(lines(tree)).toEqual([ENGINE])
  })

  test('no persona and neutralMainTheme off: main-thread decoration steps aside', { options: { neutralMainTheme: false } }, async ($, on) => {
    setup(on)
    for (const component of ['AssistantMessage', 'UserMessage', 'ToolUse', 'AskUserQuestion', 'InfoNotice'] as const) {
      const tree = await draw($, on, { component, props: FIXTURES[component] as never })
      expect(bare(tree), component).toBe(true)
    }
  })

  test('anything that throws falls back to the engine drawing', async ($, on) => {
    setup(on, SHIKAMARU)
    // an origin the hook cannot read
    const tree = await draw($, on, { component: 'UserMessage', props: { text: 'x', isExpanded: false } as never })
    expect(lines(tree)).toEqual([ENGINE])
    const odd = await draw($, on, { component: 'ToolGroup', props: { calls: null } as never })
    expect(lines(odd)).toEqual([ENGINE])
  })
})

describe('another surface', () => {
  test('desktop and vscode draw the same frame and badge', { options: { banners: true } }, async ($, on) => {
    setup(on, SHIKAMARU)
    for (const surface of ['desktop', 'vscode', 'mobile'] as const) {
      const frame = await draw($, on, { component: 'AssistantMessage', props: msg, surface, viewport: { columns: 100, rows: 40 } })
      expect(lines(frame), surface).toEqual([ENGINE])
      expect(lines(frame), surface).toContain(ENGINE)
      const card = await draw($, on, { component: 'ToolUse', props: agentUse('dojo:sanji'), surface, viewport: { columns: 100, rows: 40 } })
      expect(has(lines(card), 'S A N J I'), surface).toBe(true)
      expect(withProp(card, 'borderColor', '#F4C430'), surface).toHaveLength(1)
    }
  })

  test('toggle off passes through there too', { options: { transcriptTheme: false } }, async ($, on) => {
    setup(on, SHIKAMARU)
    const tree = await draw($, on, { component: 'AssistantMessage', props: msg, surface: 'desktop' })
    expect(lines(tree)).toEqual([ENGINE])
  })
})

describe('art and helpers', () => {
  const everyone = [...Object.keys(STRATEGISTS), ...Object.keys(CREW)]

  test('every character has an original, plain-ASCII banner within 7 rows by 40 columns', () => {
    for (const key of everyone) {
      const rows = BANNERS[key]
      expect(rows, key).toBeDefined()
      expect(rows?.length, key).toBeGreaterThan(0)
      expect(rows?.length, key).toBeLessThanOrEqual(BANNER_ROWS)
      for (const row of rows ?? []) {
        expect(row.length, `${key}: ${row}`).toBeLessThanOrEqual(BANNER_COLUMNS)
        expect(row, key).toMatch(/^[\x20-\x7e]*$/)
      }
      expect((rows ?? []).join('\n').replace(/\s/g, '').toLowerCase(), key).toContain((STRATEGISTS[key] ?? CREW[key])?.name.replace(/\s/g, '').toLowerCase())
    }
    for (const row of NEUTRAL_BANNER) expect(row).toMatch(/^[\x20-\x7e]*$/)
  })

  test('banners are dropped when they do not fit', () => {
    expect(bannerRows('levi', 80).length).toBeGreaterThan(0)
    expect(bannerRows('levi', 10)).toEqual([])
    expect(bannerRows('nobody', 80)).toBe(NEUTRAL_BANNER)
  })

  test('every character has lines and marks; crew have deploy, return, fallen lines and a bubble', () => {
    for (const key of everyone) {
      expect(ERROR_MARKS[key], key).toBeTruthy()
      expect(MOTIFS[key], key).toBeDefined()
    }
    expect(ERROR_MARKS.strategist).toBeTruthy()
    for (const key of Object.keys(CREW)) {
      for (const table of [DEPLOY_LINES, RETURN_LINES, FALLEN_LINES]) expect(table[key]?.length, key).toBeGreaterThan(0)
      expect(BUBBLES[key]?.borderStyle, key).toBeTruthy()
    }
    for (const key of [...Object.keys(STRATEGISTS), 'strategist']) expect(ASKS[key], key).toBeTruthy()
  })

  test('Says extraction', () => {
    expect(extractSays('Done.\nSays: "Served. Merorin~ (swooning)"')).toBe('Served. Merorin~ (swooning)')
    expect(extractSays('Says: plain words')).toBe('Says: plain words'.slice(6))
    expect(extractSays('Says: “curly”\nlater\nSays: "last one wins"')).toBe('last one wins')
    expect(extractSays('  > Says: "quoted block"  ')).toBe('quoted block')
    expect(extractSays('He says: no. Nothing at line start Says')).toBeNull()
    expect(extractSays('Says:   ')).toBeNull()
    expect(extractSays('')).toBeNull()
  })

  test('agent facts tolerate any shape', () => {
    expect(agentFacts(agentOut('hi'))).toMatchObject({ text: 'hi', status: 'completed', agentId: 'ag-levi', durationMs: 12300, tools: 7 })
    expect(agentFacts('plain')).toMatchObject({ text: 'plain', status: null })
    expect(agentFacts(null).text).toBe('')
    expect(agentFacts({ handbackReport: { text: 'report' } }).text).toBe('report')
  })

  test('cells, clip, names and lanes', () => {
    expect(cells('abc')).toBe(3)
    expect(cells('🦌 Shikamaru')).toBe(12)
    expect(cells('♟️')).toBe(2)
    expect(clip('abcdef', 4)).toBe('abc…')
    expect(clip('abc', 4)).toBe('abc')
    expect(dutyNameOf('On duty: Lelouch', ['lelouch'])).toBe('lelouch')
    expect(dutyNameOf('On duty: Nobody', ['lelouch'])).toBeNull()
    expect(dojoCommand('dojo-duty')).toBe('dojo-duty')
    expect(dojoCommand('dojo:dojo-voice')).toBe('dojo-voice')
    expect(dojoCommand('cost')).toBeNull()
    let table: Record<string, string> = {}
    for (let i = 0; i < LANE_CAP + 20; i++) table = remember(table, `id-${i}`, 'levi')
    expect(Object.keys(table)).toHaveLength(LANE_CAP)
    expect(table['id-0']).toBeUndefined()
    expect(table[`id-${LANE_CAP + 19}`]).toBe('levi')
  })
})

describe('palette mode', () => {
  test('paint: light swaps in the light pair of the same character; dark changes nothing', () => {
    const lelouch = STRATEGISTS.lelouch as (typeof STRATEGISTS)[string]
    // dark keeps the authored colors, lifted only where they fail on black (Lelouch's purple)
    expect(paint(lelouch, 'dark')).toEqual({ ...lelouch, color: '#9E62CA' })
    expect(paint(lelouch, 'light')).toEqual({ ...lelouch, color: lelouch.lightColor, accent: lelouch.lightAccent })
    const l = CREW.l as (typeof CREW)[string]
    expect(paint(l, 'light').color).toBe(l.lightColor)
    expect(paint(l, 'light').color).not.toBe('#E0E0E0')
    expect(paint(NEUTRAL, 'light').accent).toBe(NEUTRAL.lightAccent)
    for (const t of [...Object.values(STRATEGISTS), NEUTRAL, ...Object.values(CREW)]) {
      expect(paint(t, 'light')).toMatchObject({ key: t.key, name: t.name, emoji: t.emoji, color: t.lightColor, accent: t.lightAccent })
    }
  })

  test('modeOf: only the exact string "light" turns the light palette on', () => {
    expect(modeOf('light')).toBe('light')
    expect(modeOf('dark')).toBe('dark')
    expect(modeOf(undefined)).toBe('dark')
    expect(modeOf(null)).toBe('dark')
    expect(modeOf('LIGHT')).toBe('dark')
    expect(modeOf(1)).toBe('dark')
  })

  test('with no palette state written yet, every owned component draws the original colors', { options: { banners: true } }, async ($, on) => {
    setup(on, LELOUCH, [agent('ag-levi', 'dojo:levi')])
    await $.tool.call({ tool: 'Bash', command: 'ls', tool_use_id: 'tu-9', agentId: 'ag-levi' } as never)
    const frame = await draw($, on, { component: 'AssistantMessage', props: msg })
    expect(withProp(frame, 'backgroundColor', '#9E62CA')).toHaveLength(1)
    const badge = await draw($, on, { component: 'ToolUse', props: toolUse({ tool_use_id: 'tu-9' }) })
    expect(withProp(badge, 'color', '#708090')).toHaveLength(1)
    const card = await draw($, on, { component: 'ToolUse', props: agentUse('dojo:l') })
    expect(withProp(card, 'borderColor', '#E0E0E0')).toHaveLength(1)
    const duty = await draw($, on, { component: 'CommandOutput', props: { command: 'dojo-duty', text: 'On duty: Shikamaru', isErrored: false } as never })
    expect(withProp(duty, 'borderColor', '#5B8C5A')).toHaveLength(1)
  })

  /** The palette written the way a person's theme change writes it: through the chrome module's config.set hook. */
  async function chooseTheme($: Engine, on: On, theme: string) {
    on('config.list', () => ({ value: [] }) as never)
    on('config.set', (_$, e) => ({ value: e.value }) as never)
    return () => $.config.set({ key: 'theme', value: theme } as never)
  }

  test('a light engine theme: the stripe, badge, crew card and command frame draw the light colors', { options: { banners: true } }, async ($, on) => {
    setup(on, LELOUCH, [agent('ag-levi', 'dojo:levi')])
    const apply = await chooseTheme($, on, 'light')
    await apply()
    await $.tool.call({ tool: 'Bash', command: 'ls', tool_use_id: 'tu-9', agentId: 'ag-levi' } as never)
    const lelouch = STRATEGISTS.lelouch as (typeof STRATEGISTS)[string]
    const frame = await draw($, on, { component: 'AssistantMessage', props: msg })
    expect(withProp(frame, 'backgroundColor', lelouch.lightColor)).toHaveLength(1)
    expect(withProp(frame, 'backgroundColor', '#9E62CA')).toHaveLength(0)
    const badge = await draw($, on, { component: 'ToolUse', props: toolUse({ tool_use_id: 'tu-9' }) })
    expect(withProp(badge, 'color', CREW.levi?.lightColor)).toHaveLength(1)
    expect(withProp(badge, 'color', '#708090')).toHaveLength(0)
    const card = await draw($, on, { component: 'ToolUse', props: agentUse('dojo:l') })
    expect(withProp(card, 'borderColor', CREW.l?.lightColor)).toHaveLength(1)
    expect(withProp(card, 'color', '#E0E0E0')).toHaveLength(0)
    const duty = await draw($, on, { component: 'CommandOutput', props: { command: 'dojo-duty', text: 'On duty: Shikamaru', isErrored: false } as never })
    expect(withProp(duty, 'borderColor', STRATEGISTS.shikamaru?.lightColor)).toHaveLength(1)
  })
})

// ---- declutter: one-line crew moments, no repeated chrome, fixed banners ----------------------------------------

const quoteOf = (pool: Record<string, readonly string[]>, key: string, salt: string) => line(pool[key], salt)
const OFF = { options: { banners: false } }
const LEVI_SAYS = 'Mostly clean. Fix the corner I marked.'

describe('declutter: strategist and user rows', () => {
  const STRIPES = [
    ['shikamaru', SHIKAMARU, '#5B8C5A'],
    ['lelouch', LELOUCH, '#9E62CA'],
    ['no persona', {}, '#94A3B8'],
  ] as const
  for (const [label, env, color] of STRIPES) {
    test(`an assistant reply has no header line, only the stripe: ${label}`, OFF, async ($, on) => {
      setup(on, env)
      for (const columns of [40, 80, 120]) {
        const tree = await draw($, on, { component: 'AssistantMessage', props: msg, viewport: { columns, rows: 24 } })
        expect(lines(tree), `@${columns}`).toEqual([ENGINE])
        expect(withProp(tree, 'backgroundColor', color), `@${columns}`).toHaveLength(1)
      }
    })
  }

  test('a user prompt passes through untouched', OFF, async ($, on) => {
    setup(on, LELOUCH)
    const tree = await draw($, on, { component: 'UserMessage', props: user })
    expect(bare(tree)).toBe(true)
  })

  test('questions and notices pass through without frames', OFF, async ($, on) => {
    setup(on, LELOUCH)
    const ask = await draw($, on, { component: 'AskUserQuestion', props: { tool: 'AskUserQuestion', questions: [{ question: 'Which?' }] } })
    expect(bare(ask)).toBe(true)
    const info = await draw($, on, { component: 'InfoNotice', props: { text: 'Opus 5', command: '/model' } })
    expect(bare(info)).toBe(true)
  })
})

describe('declutter: tool rows', () => {
  const crewSetup = async ($: Engine, on: On) => {
    setup(on, SHIKAMARU, [agent('ag-levi', 'dojo:levi'), agent('ag-sanji', 'dojo:sanji')])
    await $.tool.call({ tool: 'Bash', command: 'ls', tool_use_id: 'tu-9', agentId: 'ag-levi' } as never)
    await $.tool.call({ tool: 'Bash', command: 'ls', tool_use_id: 'tu-7', agentId: 'ag-sanji' } as never)
  }

  test('main-thread rows carry no badge, errored or not, at any width', OFF, async ($, on) => {
    setup(on, SHIKAMARU)
    for (const columns of [40, 80]) {
      const viewport = { columns, rows: 24 }
      expect(bare(await draw($, on, { component: 'ToolUse', props: toolUse(), viewport }))).toBe(true)
      expect(bare(await draw($, on, { component: 'ToolUse', props: toolUse({ isErrored: true }), viewport }))).toBe(true)
      expect(bare(await draw($, on, { component: 'ToolResult', props: toolResult({ isErrored: true }), viewport }))).toBe(true)
      expect(bare(await draw($, on, { component: 'ToolProgress', props: { tool_use_id: 'tu-1', kind: 'background_hint', hint: 'h' }, viewport }))).toBe(true)
    }
    const group = [{ tool_use_id: 'tu-1', tool: 'Read', input: {}, isRunning: false, isErrored: true, isInterrupted: false }]
    expect(bare(await draw($, on, { component: 'ToolGroup', props: { calls: group, isActive: false, isExpanded: false } }))).toBe(true)
  })

  test('a crew member keeps only a colored emoji, with no name, at any width', OFF, async ($, on) => {
    await crewSetup($, on)
    for (const columns of [40, 80, 120]) {
      const use = await draw($, on, { component: 'ToolUse', props: toolUse({ tool_use_id: 'tu-9', isErrored: true }), viewport: { columns, rows: 24 } })
      expect(lines(use)).toEqual(['🧹', ENGINE])
      expect(withProp(use, 'color', '#708090')).toHaveLength(1)
    }
    const progress = await draw($, on, { component: 'ToolProgress', props: { tool_use_id: 'tu-9', kind: 'background_hint', hint: 'h' } })
    expect(lines(progress)).toEqual(['🧹', ENGINE])
  })

  test('a group shows the emoji of each crew member in it and skips the main thread', OFF, async ($, on) => {
    await crewSetup($, on)
    const calls = (ids: (string | undefined)[]) => ids.map(tool_use_id => ({ tool_use_id, tool: 'Read', input: {}, isRunning: false, isErrored: false, isInterrupted: false }))
    const props = (ids: (string | undefined)[]) => ({ calls: calls(ids), isActive: false, isExpanded: false })
    expect(lines(await draw($, on, { component: 'ToolGroup', props: props(['tu-1', 'tu-9']) }))).toEqual(['🧹', ENGINE])
    expect(lines(await draw($, on, { component: 'ToolGroup', props: props(['tu-9', 'tu-7', 'tu-9']) }))).toEqual(['🧹 🍳', ENGINE])
  })

  test('an errored crew result keeps a one-word mark and drops a longer one', OFF, async ($, on) => {
    await crewSetup($, on)
    const levi = await draw($, on, { component: 'ToolResult', props: toolResult({ tool_use_id: 'tu-9', isErrored: true }) })
    expect(lines(levi)).toEqual(['🧹 ✗ Filthy.', ENGINE])
    expect(withProp(levi, 'color', 'error')).toHaveLength(1)
    // Sanji's mark is two words: the engine's error stands alone
    const sanji = await draw($, on, { component: 'ToolResult', props: toolResult({ tool_use_id: 'tu-7', isErrored: true }) })
    expect(bare(sanji)).toBe(true)
  })

  test('tinyMark keeps one short word and nothing longer', () => {
    expect(tinyMark('levi')).toBe('Filthy.')
    expect(tinyMark('l')).toBe('Suspicious.')
    expect(tinyMark('sanji')).toBeNull()
    expect(tinyMark('robin')).toBeNull()
    expect(tinyMark('nobody')).toBeNull()
  })
})

describe('declutter: crew moments are one line', () => {
  test('deploy: emoji and name bold in the character color, task plain, quote dim italic in the accent', OFF, async ($, on) => {
    setup(on, SHIKAMARU)
    const tree = await draw($, on, { component: 'ToolUse', props: agentUse('dojo:levi') })
    const quote = quoteOf(DEPLOY_LINES, 'levi', 'tu-a')
    expect(lines(tree)).toEqual([`🧹 Levi ▸ QA the cart  “${quote}”`, ENGINE])
    expect(withProp(tree, 'borderStyle')).toHaveLength(0)
    expect(has(lines(tree), 'L E V I')).toBe(false)
    const [name] = withProp(tree, 'color', '#708090')
    expect(name?.props).toMatchObject({ bold: true })
    expect(flat(name as Node)).toBe('🧹 Levi')
    const [said] = withProp(tree, 'italic', true)
    expect(said?.props).toMatchObject({ color: paint(CREW.levi as (typeof CREW)[string], 'dark').accent, dimColor: true })
    // task and the arrow are plain text
    const plain = elements(tree, e => e.type === 'Text' && flat(e) === ' QA the cart')
    expect(plain).toHaveLength(1)
    expect(plain[0]?.props?.color).toBeUndefined()
    expect(plain[0]?.props?.dimColor).toBeUndefined()
  })

  test('every crew member deploys as one line with their own signature', OFF, async ($, on) => {
    setup(on, SHIKAMARU)
    for (const [key, c] of Object.entries(CREW)) {
      const tree = await draw($, on, { component: 'ToolUse', props: agentUse(`dojo:${key}`) })
      expect(lines(tree)[0], key).toBe(`${c.emoji} ${c.name} ▸ QA the cart  “${quoteOf(DEPLOY_LINES, key, 'tu-a')}”`)
      expect(withProp(tree, 'borderStyle'), key).toHaveLength(0)
    }
  })

  test('deploy is width aware: under 50 columns the quote goes, then the task is cut', OFF, async ($, on) => {
    setup(on, SHIKAMARU)
    const long = 'Check the whole cart flow end to end including the remove-book change'
    const at = async (columns: number) =>
      lines(await draw($, on, { component: 'ToolUse', props: agentUse('dojo:levi', { input: { description: long, prompt: 'p', subagent_type: 'dojo:levi' } }), viewport: { columns, rows: 24 } }))[0] as string
    expect(await at(49)).not.toContain('“')
    expect(await at(49)).toBe(`🧹 Levi ▸ ${clip(long, 49 - 1 - 9 - 1)}`)
    expect(await at(30)).toBe(`🧹 Levi ▸ ${clip(long, 30 - 1 - 9 - 1)}`)
    expect(await at(80)).toContain('“')
    for (const columns of [20, 30, 40, 49, 50, 60, 80, 120]) expect(cells(await at(columns)), `@${columns}`).toBeLessThanOrEqual(columns)
  })

  test('an errored spawn is the fallen line; an interrupted one is recalled', OFF, async ($, on) => {
    setup(on, SHIKAMARU)
    const fell = await draw($, on, { component: 'ToolUse', props: agentUse('dojo:levi', { isErrored: true }) })
    expect(lines(fell)[0]).toBe(`💀 Levi ✗ fell  “${quoteOf(FALLEN_LINES, 'levi', 'tu-a')}”`)
    const recalled = await draw($, on, { component: 'ToolUse', props: agentUse('dojo:levi', { isInterrupted: true }) })
    expect(lines(recalled)[0]).toBe('🧹 Levi ↩ recalled QA the cart')
  })

  describe('returns', () => {
    const report = `Verdict: PASS\nSays: "${LEVI_SAYS}"`
    const result = (output: unknown, over: Record<string, unknown> = {}) => toolResult({ tool_use_id: 'tu-a', tool: 'Agent', output, ...over })
    const spawn = async ($: Engine) => $.tool.call({ tool: 'Agent', subagent_type: 'dojo:levi', description: 'QA', prompt: 'p', tool_use_id: 'tu-a' } as never)

    test('one line with the duration and the Says line; the result stays beneath, no box', OFF, async ($, on) => {
      setup(on, SHIKAMARU)
      await spawn($)
      const tree = await draw($, on, { component: 'ToolResult', props: result(agentOut(report, { totalDurationMs: 175000 })) })
      expect(lines(tree)).toEqual([`🧹 Levi ✓ 2m 55s  “${LEVI_SAYS}”`, ENGINE])
      expect(withProp(tree, 'borderStyle')).toHaveLength(0)
      expect(withProp(tree, 'color', 'success')).toHaveLength(1)
      expect(flat(withProp(tree, 'color', 'success')[0] as Node)).toBe(' ✓')
    })

    test('no Says line: a return line from the art; no duration: none shown', OFF, async ($, on) => {
      setup(on, SHIKAMARU)
      await spawn($)
      const tree = await draw($, on, { component: 'ToolResult', props: result(agentOut('Verdict: PASS', { totalDurationMs: undefined })) })
      expect(lines(tree)[0]).toBe(`🧹 Levi ✓  “${quoteOf(RETURN_LINES, 'levi', 'tu-a')}”`)
    })

    test('fallen: skull, red mark only on the glyph, the fall line', OFF, async ($, on) => {
      setup(on, SHIKAMARU)
      await spawn($)
      const tree = await draw($, on, { component: 'ToolResult', props: result(agentOut(report), { isErrored: true }) })
      expect(lines(tree)).toEqual([`💀 Levi ✗ fell  “${quoteOf(FALLEN_LINES, 'levi', 'tu-a')}”`, ENGINE])
      const red = withProp(tree, 'color', 'error')
      expect(red).toHaveLength(1)
      expect(flat(red[0] as Node)).toBe(' ✗')
      expect(withProp(tree, 'borderStyle')).toHaveLength(0)
    })

    test('a background launch draws nothing of its own', OFF, async ($, on) => {
      setup(on, SHIKAMARU)
      const tree = await draw($, on, { component: 'ToolResult', props: result({ status: 'async_launched', agentId: 'ag-1', agentType: 'dojo:senku' }) })
      expect(bare(tree)).toBe(true)
    })

    test('width aware: no quote under 50 columns; a long Says is cut to fit', OFF, async ($, on) => {
      setup(on, SHIKAMARU)
      await spawn($)
      const out = agentOut(`Says: ${'long '.repeat(40)}`)
      for (const columns of [20, 40, 49, 50, 60, 80, 120]) {
        const tree = await draw($, on, { component: 'ToolResult', props: result(out), viewport: { columns, rows: 24 } })
        const first = lines(tree)[0] as string
        expect(cells(first), `@${columns}`).toBeLessThanOrEqual(columns)
        expect(first.includes('“'), `@${columns}`).toBe(columns >= 50)
        expect(first.startsWith('🧹 Levi ✓'), `@${columns}`).toBe(true)
      }
    })
  })

  test('a non-dojo Agent call and result are left alone', OFF, async ($, on) => {
    setup(on, SHIKAMARU)
    for (const type of ['general-purpose', 'dojo:strategist', 'dojo:nobody']) {
      expect(bare(await draw($, on, { component: 'ToolUse', props: agentUse(type) })), type).toBe(true)
    }
  })

  test('commands: one line with the strategist emoji, no banner, no frame', OFF, async ($, on) => {
    setup(on, SHIKAMARU)
    const out = (command: string, text: string) => ({ command, args: '', text, isErrored: false }) as never
    const duty = await draw($, on, { component: 'CommandOutput', props: out('dojo-duty', 'On duty: Lelouch') })
    expect(lines(duty)).toEqual(['♟️ Lelouch · on duty', ENGINE])
    expect(withProp(duty, 'borderStyle')).toHaveLength(0)
    expect(withProp(duty, 'color', '#9E62CA').length).toBeGreaterThan(0)
    const voice = await draw($, on, { component: 'CommandOutput', props: out('dojo-voice', 'Voice level override: full') })
    expect(lines(voice)).toEqual(['🦌 Shikamaru · voice', ENGINE])
  })
})

describe('declutter: banners=true brings the cards back', () => {
  const ON = { options: { banners: true } }
  const SAYS = 'Mostly clean. Fix the corner I marked.'
  const REPORT = `Verdict: PASS WITH ISSUES\nSays: "${SAYS}"`

  test('banners=false draws the one-liner, never a card', OFF, async ($, on) => {
    setup(on, SHIKAMARU)
    const tree = await draw($, on, { component: 'ToolUse', props: agentUse('dojo:levi') })
    expect(withProp(tree, 'borderStyle')).toHaveLength(0)
    expect(has(lines(tree), 'task  QA the cart')).toBe(false)
  })

  test('deploy card: banner, header, task, signature, border', ON, async ($, on) => {
    setup(on, SHIKAMARU)
    const tree = await draw($, on, { component: 'ToolUse', props: agentUse('dojo:levi') })
    const rows = lines(tree)
    expect(has(rows, 'L E V I')).toBe(true)
    expect(rows).toContain('🧹 Levi · QA · ▸ deployed')
    expect(rows).toContain('task  QA the cart')
    expect(rows).toContain(`“${quoteOf(DEPLOY_LINES, 'levi', 'tu-a')}”`)
    expect(rows[rows.length - 1]).toBe(ENGINE)
    expect(withProp(tree, 'borderStyle', 'round')[0]?.props).toMatchObject({ borderColor: '#708090', width: 46 })
  })

  test('return card with bubble, fallen card and background card', ON, async ($, on) => {
    setup(on, SHIKAMARU)
    await $.tool.call({ tool: 'Agent', subagent_type: 'dojo:levi', description: 'QA', prompt: 'p', tool_use_id: 'tu-a' } as never)
    const back = await draw($, on, { component: 'ToolResult', props: toolResult({ tool_use_id: 'tu-a', tool: 'Agent', output: agentOut(REPORT) }) })
    expect(lines(back)).toContain('🧹 Levi · QA · ✓ returned')
    expect(lines(back)).toContain('7 tools · 12.3s')
    expect(lines(back)).toContain(SAYS)
    expect(withProp(back, 'borderStyle', BUBBLES.levi?.borderStyle)).toHaveLength(1)
    const fell = await draw($, on, { component: 'ToolResult', props: toolResult({ tool_use_id: 'tu-a', tool: 'Agent', output: agentOut(REPORT), isErrored: true }) })
    expect(lines(fell)).toContain('💀 Levi · QA · ✗ fell')
    expect(withProp(fell, 'borderColor', 'error')).toHaveLength(1)
    const bg = await draw($, on, { component: 'ToolResult', props: toolResult({ tool: 'Agent', output: { status: 'async_launched', agentId: 'ag-1', agentType: 'dojo:senku' } }) })
    expect(lines(bg)).toContain('🧪 Senku · backend · … running in background')
  })

  test('command frame with the switched-to strategist banner', ON, async ($, on) => {
    setup(on, SHIKAMARU)
    const tree = await draw($, on, { component: 'CommandOutput', props: { command: 'dojo-duty', args: '', text: 'On duty: Lelouch', isErrored: false } as never })
    expect(has(lines(tree), 'L E L O U C H')).toBe(true)
    expect(lines(tree)).toContain('♟️ ♚ Lelouch · on duty')
    expect(withProp(tree, 'borderColor', '#9E62CA')).toHaveLength(1)
  })

  test('cards do not bring back the assistant header, the seal or the badges', ON, async ($, on) => {
    setup(on, SHIKAMARU)
    expect(lines(await draw($, on, { component: 'AssistantMessage', props: msg }))).toEqual([ENGINE])
    expect(bare(await draw($, on, { component: 'UserMessage', props: user }))).toBe(true)
    expect(lines(await draw($, on, { component: 'ToolUse', props: toolUse() }))).toEqual([ENGINE])
  })
})

describe('declutter: fitLine', () => {
  test('quote first dropped under 50 columns, then the task is cut', () => {
    expect(fitLine({ fixed: 9, lead: ' ', task: 'short', quote: 'hi', cols: 80 })).toEqual({ task: 'short', quote: 'hi' })
    expect(fitLine({ fixed: 9, lead: ' ', task: 'short', quote: 'hi', cols: 49 })).toEqual({ task: 'short', quote: '' })
    expect(fitLine({ fixed: 9, lead: ' ', task: 'x'.repeat(60), quote: 'hi', cols: 49 })).toEqual({ task: clip('x'.repeat(60), 38), quote: '' })
  })

  test('a quote that would squeeze the task out goes instead; a returned line cuts its quote', () => {
    expect(fitLine({ fixed: 9, lead: ' ', task: 'x'.repeat(60), quote: 'q'.repeat(40), cols: 60 }).quote).toBe('')
    const kept = fitLine({ fixed: 9, lead: ' ', task: 'x'.repeat(20), quote: 'a long signature quote', cols: 60 })
    expect(kept.quote).toBe('a long signature quote')
    expect(cells(kept.task) + cells(kept.quote) + 4 + 9 + 1).toBeLessThanOrEqual(59)
    const cut = fitLine({ fixed: 9, lead: ' ', task: '', quote: 'word '.repeat(30), cols: 60 })
    expect(cut.quote.endsWith('…')).toBe(true)
    expect(cells(cut.quote) + 4 + 9).toBeLessThanOrEqual(59)
  })
})

describe('declutter: banner art is aligned', () => {
  const everyone = [...Object.keys(STRATEGISTS), ...Object.keys(CREW)]
  const all: [string, readonly string[]][] = [...everyone.map(k => [k, BANNERS[k] ?? []] as [string, readonly string[]]), ['neutral', NEUTRAL_BANNER]]

  test('every row of a banner has the same cell width, within 7 rows by 40 columns', () => {
    for (const [key, rows] of all) {
      expect(rows.length, key).toBeGreaterThan(0)
      expect(rows.length, key).toBeLessThanOrEqual(BANNER_ROWS)
      const width = cells(rows[0] as string)
      expect(width, key).toBeLessThanOrEqual(BANNER_COLUMNS)
      for (const row of rows) {
        expect(cells(row), `${key}: |${row}|`).toBe(width)
        expect(row.length, `${key}: |${row}|`).toBe(width) // plain single-width glyphs only
        expect(row, key).toMatch(/^[\x20-\x7e]*$/)
      }
    }
  })

  test('a banner is a tight box: something sits in its first column, last column, first row and last row', () => {
    for (const [key, rows] of all) {
      expect(rows.some(r => r.startsWith(' ') === false), `${key}: first column`).toBe(true)
      expect(rows.some(r => r.endsWith(' ') === false), `${key}: last column`).toBe(true)
      expect((rows[0] as string).trim(), key).not.toBe('')
      expect((rows[rows.length - 1] as string).trim(), key).not.toBe('')
    }
  })

  test("Levi's crossed blades are a symmetric X, left to right and top to bottom", () => {
    const mirror = (r: string) => [...r].reverse().map(c => (c === '/' ? '\\' : c === '\\' ? '/' : c)).join('')
    const art = (BANNERS.levi ?? []).map(r => r.slice(0, 6))
    expect(art).toEqual(['\\    /', ' \\  / ', '  \\/  ', '  /\\  ', ' /  \\ ', '/    \\'])
    for (const row of art) expect(mirror(row)).toBe(row)
    expect([...art].reverse().map(r => r.replace(/[/\\]/g, c => (c === '/' ? '\\' : '/')))).toEqual(art)
  })

  test('the drawings that centre on an axis are mirror-symmetric', () => {
    const mirror = (r: string) => [...r].reverse().map(c => ({ '/': '\\', '\\': '/', '(': ')', ')': '(', '[': ']', ']': '[' })[c] ?? c).join('')
    for (const [key, width] of [['lelouch', 7], ['sanji', 11], ['light', 9], ['l', 9], ['senku', 9], ['robin', 7]] as const) {
      for (const row of (BANNERS[key] ?? []).map(r => r.slice(0, width).trimEnd().padEnd(width))) {
        // rows narrower than the drawing are centred in it
        const body = row.trim()
        const pad = (width - body.length) / 2
        expect(Number.isInteger(pad) && row.startsWith(' '.repeat(pad)), `${key}: |${row}|`).toBe(true)
        if (body.length > 0) expect(mirror(body), `${key}: |${row}|`).toBe(body.replace(/o o/, 'o o'))
      }
    }
  })
})

describe('declutter: shipped default (needs the plugin.json default of banners to be false)', () => {
  test('with no banners option set, the plugin default draws one-liners', async ($, on) => {
    setup(on, SHIKAMARU)
    const tree = await draw($, on, { component: 'ToolUse', props: agentUse('dojo:levi') })
    expect(lines(tree)[0]).toBe(`🧹 Levi ▸ QA the cart  “${line(DEPLOY_LINES.levi, 'tu-a')}”`)
    expect(withProp(tree, 'borderStyle')).toHaveLength(0)
  })
})
