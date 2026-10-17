import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { AgentInfo, EngineInterface, On, RenderComponent, RenderPropsOf, RenderSurface } from 'claude-code'

import { CREW, NEUTRAL, STRATEGISTS } from '../theme'
import { agent, core } from '../lib/testkit'
import { ASKS, BANNERS, BANNER_COLUMNS, BANNER_ROWS, BUBBLES, DEPLOY_LINES, ERROR_MARKS, FALLEN_LINES, MOTIFS, NEUTRAL_BANNER, RETURN_LINES } from './transcript-art'
import { bannerRows, cells, clip, dojoCommand, dutyNameOf, extractSays, modeOf, paint, remember, agentFacts, LANE_CAP } from './transcript-lib'

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
    expect(rows[0]).toMatch(/^🦌 ☁ Shikamaru ☁ ~+$/)
    expect(rows).toContain(ENGINE)
    expect(withProp(tree, 'backgroundColor', '#5B8C5A')).toHaveLength(1)
    expect(withProp(tree, 'color', '#5B8C5A').length).toBeGreaterThan(0)
  })

  test('lelouch: purple stripe, gold rule, chess motif', async ($, on) => {
    setup(on, LELOUCH)
    const tree = await draw($, on, { component: 'AssistantMessage', props: msg })
    expect(lines(tree)[0]).toMatch(/^♟️ ♚ Lelouch ♚ ═+$/)
    expect(withProp(tree, 'backgroundColor', '#9E62CA')).toHaveLength(1)
    expect(withProp(tree, 'color', '#D4AF37').length).toBeGreaterThan(0)
  })

  test('no persona: neutral theme', async ($, on) => {
    setup(on)
    const tree = await draw($, on, { component: 'AssistantMessage', props: msg })
    expect(lines(tree)[0]).toMatch(/^🎴 ◆ Strategist ◆ ─+$/)
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
    expect(lines(tree)).toEqual(['🦌 Shikamaru', ENGINE])
  })
})

describe('user message', () => {
  test('composer prompt gets a restrained seal in the accent', async ($, on) => {
    setup(on, LELOUCH)
    const tree = await draw($, on, { component: 'UserMessage', props: user })
    expect(lines(tree)).toEqual(['♚ you ══════', ENGINE])
    expect(withProp(tree, 'color', '#D4AF37').length).toBeGreaterThan(0)
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
    expect(lines(tree)).toEqual(['🦌 Shikamaru', ENGINE])
    expect(withProp(tree, 'color', '#5B8C5A')).toHaveLength(1)
  })

  test('an errored call is marked on the badge', async ($, on) => {
    setup(on, SHIKAMARU)
    const tree = await draw($, on, { component: 'ToolUse', props: toolUse({ isErrored: true }) })
    expect(lines(tree)).toEqual(['🦌 Shikamaru ✗', ENGINE])
  })

  test('a dojo subagent badges its own call, found through tool.call', async ($, on) => {
    setup(on, SHIKAMARU, [agent('ag-levi', 'dojo:levi'), agent('ag-x', 'general-purpose')])
    await $.tool.call({ tool: 'Bash', command: 'ls', tool_use_id: 'tu-9', agentId: 'ag-levi' } as never)
    await $.tool.call({ tool: 'Bash', command: 'ls', tool_use_id: 'tu-8', agentId: 'ag-x' } as never)
    const crew = await draw($, on, { component: 'ToolUse', props: toolUse({ tool_use_id: 'tu-9' }) })
    expect(lines(crew)).toEqual(['🧹 Levi', ENGINE])
    expect(withProp(crew, 'color', '#708090')).toHaveLength(1)
    // some other subagent: no badge at all
    const other = await draw($, on, { component: 'ToolUse', props: toolUse({ tool_use_id: 'tu-8' }) })
    expect(lines(other)).toEqual([ENGINE])
  })

  test('narrow: emoji-only badge', async ($, on) => {
    setup(on, SHIKAMARU)
    const tree = await draw($, on, { component: 'ToolUse', props: toolUse(), viewport: { columns: 40, rows: 24 } })
    expect(lines(tree)).toEqual(['🦌', ENGINE])
  })

  test('errored result: character mark above the engine drawing, error text untouched', async ($, on) => {
    setup(on, SHIKAMARU, [agent('ag-levi', 'dojo:levi')])
    await $.tool.call({ tool: 'Bash', command: 'ls', tool_use_id: 'tu-9', agentId: 'ag-levi' } as never)
    const crew = await draw($, on, { component: 'ToolResult', props: toolResult({ tool_use_id: 'tu-9', isErrored: true }) })
    expect(lines(crew)).toEqual(['🧹 ✗ Filthy.', ENGINE])
    expect(withProp(crew, 'color', 'error')).toHaveLength(1)
    const main = await draw($, on, { component: 'ToolResult', props: toolResult({ isErrored: true }) })
    expect(lines(main)).toEqual(['🦌 ✗ A hole in the formation.', ENGINE])
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
    expect(lines(main)).toEqual(['🦌 Shikamaru', ENGINE])
    const mixed = await draw($, on, { component: 'ToolGroup', props: { calls: calls(['tu-1', 'tu-9']), isActive: false, isExpanded: false } })
    expect(lines(mixed)).toEqual(['🦌 Shikamaru 🧹 Levi', ENGINE])
    const bad = await draw($, on, { component: 'ToolGroup', props: { calls: calls(['tu-1'], true), isActive: false, isExpanded: false } })
    expect(lines(bad)).toEqual(['🦌 Shikamaru ✗', ENGINE])
  })

  test('progress row: badge of the caller', async ($, on) => {
    setup(on, SHIKAMARU)
    const tree = await draw($, on, {
      component: 'ToolProgress',
      props: { tool_use_id: 'tu-1', kind: 'background_hint', hint: '(ctrl+b to run in background)' },
    })
    expect(lines(tree)).toEqual(['🦌', ENGINE])
  })
})

describe('crew cards', () => {
  test('a dojo spawn is drawn as a card: banner, emoji, name, role, border, task, signature', async ($, on) => {
    setup(on, SHIKAMARU)
    const tree = await draw($, on, { component: 'ToolUse', props: agentUse('dojo:levi') })
    const rows = lines(tree)
    expect(has(rows, 'L E V I')).toBe(true)
    expect(has(rows, 'spotless')).toBe(true)
    expect(rows).toContain('🧹 Levi · QA · ▸ deployed')
    expect(rows).toContain('task  QA the cart')
    expect(rows.some(r => DEPLOY_LINES.levi?.some(l => r === `“${l}”`))).toBe(true)
    expect(rows).toContain('🦌 Shikamaru')
    expect(rows[rows.length - 1]).toBe(ENGINE)
    const border = withProp(tree, 'borderStyle', 'round')
    expect(border).toHaveLength(1)
    expect(border[0]?.props).toMatchObject({ borderColor: '#708090', width: 46 })
  })

  test('every crew member has a card', async ($, on) => {
    setup(on, SHIKAMARU)
    for (const [key, c] of Object.entries(CREW)) {
      const tree = await draw($, on, { component: 'ToolUse', props: agentUse(`dojo:${key}`) })
      expect(lines(tree).some(r => r.startsWith(`${c.emoji} ${c.name} · ${c.role}`))).toBe(true)
      expect(withProp(tree, 'borderColor', paint(c, 'dark').color)).toHaveLength(1)
    }
  })

  test('banners off: the card stays, the art goes', { options: { banners: false } }, async ($, on) => {
    setup(on, SHIKAMARU)
    const tree = await draw($, on, { component: 'ToolUse', props: agentUse('dojo:levi') })
    expect(has(lines(tree), 'L E V I')).toBe(false)
    expect(lines(tree)).toContain('🧹 Levi · QA · ▸ deployed')
  })

  test('narrow: one compact line, no border, no banner', async ($, on) => {
    setup(on, SHIKAMARU)
    const tree = await draw($, on, { component: 'ToolUse', props: agentUse('dojo:levi'), viewport: { columns: 40, rows: 24 } })
    expect(lines(tree)).toEqual(['🧹 Levi · ▸ deployed · QA the cart', '🦌', ENGINE])
    expect(withProp(tree, 'borderStyle')).toHaveLength(0)
  })

  test('a non-dojo Agent call and the strategist agent type get no card', async ($, on) => {
    setup(on, SHIKAMARU)
    for (const type of ['general-purpose', 'dojo:strategist', 'dojo:nobody']) {
      const tree = await draw($, on, { component: 'ToolUse', props: agentUse(type) })
      expect(lines(tree)).toEqual(['🦌 Shikamaru', ENGINE])
      expect(withProp(tree, 'borderStyle')).toHaveLength(0)
    }
  })

  test('a failed spawn is a fallen card', async ($, on) => {
    setup(on, SHIKAMARU)
    const tree = await draw($, on, { component: 'ToolUse', props: agentUse('dojo:levi', { isErrored: true }) })
    expect(lines(tree)).toContain('💀 Levi · QA · ✗ fell')
    expect(withProp(tree, 'borderColor', 'error')).toHaveLength(1)
  })
})

describe('return cards', () => {
  const SAYS = 'Mostly clean. Fix the corner I marked.'
  const REPORT = `Verdict: PASS WITH ISSUES\nDefects: none\nSays: "${SAYS}"`

  test('the Says line becomes a speech bubble in the character colour; the result is untouched', async ($, on) => {
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

  test('no Says line, no bubble; the agent type may come from the result itself', async ($, on) => {
    setup(on, SHIKAMARU)
    const tree = await draw($, on, {
      component: 'ToolResult',
      props: toolResult({ tool: 'Agent', output: agentOut('Verdict: PASS', { agentType: 'dojo:robin' }) }),
    })
    expect(lines(tree)).toContain('🌸 Robin · docs · ✓ returned')
    expect(withProp(tree, 'borderStyle', BUBBLES.robin?.borderStyle)).toHaveLength(1) // the card border is round too
    expect(lines(tree).filter(r => r.startsWith('“'))).toHaveLength(1) // only the signature line
  })

  test('failed or killed: a fallen card, no bubble', async ($, on) => {
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

  test('a background launch is not a return', async ($, on) => {
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

  test('narrow: header and bubble collapse to lines', async ($, on) => {
    setup(on, SHIKAMARU)
    const tree = await draw($, on, {
      component: 'ToolResult',
      props: toolResult({ tool: 'Agent', output: agentOut(REPORT, { agentType: 'dojo:levi' }) }),
      viewport: { columns: 40, rows: 24 },
    })
    expect(lines(tree)).toEqual(['🧹 Levi · ✓ returned', `🧹 “${SAYS}”`, ENGINE])
  })

  test('no row of any card is wider than the viewport', async ($, on) => {
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

  test('/dojo-duty is framed with the switched-to strategist banner', async ($, on) => {
    setup(on, SHIKAMARU)
    const tree = await draw($, on, { component: 'CommandOutput', props: out('dojo-duty', 'On duty: Lelouch') })
    const rows = lines(tree)
    expect(has(rows, 'L E L O U C H')).toBe(true)
    expect(rows).toContain('♟️ ♚ Lelouch · on duty')
    expect(rows[rows.length - 1]).toBe(ENGINE)
    expect(withProp(tree, 'borderColor', '#9E62CA')).toHaveLength(1)
  })

  test('/dojo-voice is framed in the current strategist style, banner-free', async ($, on) => {
    setup(on, SHIKAMARU)
    const tree = await draw($, on, { component: 'CommandOutput', props: out('dojo-voice', 'Voice level override: full') })
    expect(lines(tree)).toEqual(['🦌 ☁ Shikamaru · voice', ENGINE])
  })

  test('other commands, errors and a plugin-prefixed name', async ($, on) => {
    setup(on, SHIKAMARU)
    expect(lines(await draw($, on, { component: 'CommandOutput', props: out('cost', '$1') }))).toEqual([ENGINE])
    expect(lines(await draw($, on, { component: 'CommandOutput', props: out('dojo-duty', 'boom', { isErrored: true }) }))).toEqual([ENGINE])
    expect(lines(await draw($, on, { component: 'CommandOutput', props: out('dojo:dojo-voice', 'v') }))).toContain('🦌 ☁ Shikamaru · voice')
  })

  test('banners off: command frame without art', { options: { banners: false } }, async ($, on) => {
    setup(on, SHIKAMARU)
    const tree = await draw($, on, { component: 'CommandOutput', props: out('dojo-duty', 'On duty: Lelouch') })
    expect(lines(tree)).toEqual(['♟️ ♚ Lelouch · on duty', ENGINE])
  })

  test('AskUserQuestion carries the strategist header; the dialog is the engine', async ($, on) => {
    setup(on, LELOUCH)
    const tree = await draw($, on, { component: 'AskUserQuestion', props: { tool: 'AskUserQuestion', questions: [{ question: 'Which?' }] } })
    expect(lines(tree)).toEqual([`♟️ ♚ Lelouch ${ASKS.lelouch}`])
    expect(elements(tree, e => e.type === 'engine')).toHaveLength(1)
  })

  test('InfoNotice leads with the strategist glyph', async ($, on) => {
    setup(on, SHIKAMARU)
    const tree = await draw($, on, { component: 'InfoNotice', props: { text: 'Opus 5', command: '/model' } })
    expect(lines(tree)).toEqual(['☁', ENGINE])
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
    for (const component of COMPONENTS) {
      if (component === 'ToolGroup') continue // an empty group has no one to badge
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
  test('desktop and vscode draw the same frame and badge', async ($, on) => {
    setup(on, SHIKAMARU)
    for (const surface of ['desktop', 'vscode', 'mobile'] as const) {
      const frame = await draw($, on, { component: 'AssistantMessage', props: msg, surface, viewport: { columns: 100, rows: 40 } })
      expect(lines(frame)[0], surface).toBe('🦌 ☁ Shikamaru ☁ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~')
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
    expect(bannerRows('levi', 20)).toEqual([])
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

  test('with no palette state written yet, every owned component draws the original colors', async ($, on) => {
    setup(on, LELOUCH, [agent('ag-levi', 'dojo:levi')])
    await $.tool.call({ tool: 'Bash', command: 'ls', tool_use_id: 'tu-9', agentId: 'ag-levi' } as never)
    const frame = await draw($, on, { component: 'AssistantMessage', props: msg })
    expect(withProp(frame, 'backgroundColor', '#9E62CA')).toHaveLength(1)
    expect(withProp(frame, 'color', '#D4AF37').length).toBeGreaterThan(0)
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

  test('a light engine theme: the frame, seal, badge, crew card and command frame draw the light colors', async ($, on) => {
    setup(on, LELOUCH, [agent('ag-levi', 'dojo:levi')])
    const apply = await chooseTheme($, on, 'light')
    await apply()
    await $.tool.call({ tool: 'Bash', command: 'ls', tool_use_id: 'tu-9', agentId: 'ag-levi' } as never)
    const lelouch = STRATEGISTS.lelouch as (typeof STRATEGISTS)[string]
    const frame = await draw($, on, { component: 'AssistantMessage', props: msg })
    expect(withProp(frame, 'color', lelouch.lightAccent).length).toBeGreaterThan(0)
    expect(withProp(frame, 'color', '#D4AF37')).toHaveLength(0)
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
