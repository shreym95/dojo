import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { AgentInfo, On } from 'claude-code'

import { agent, spawnInput } from '../lib/testkit'
import { colorFor } from '../theme'
import { cellWidth, framesOf, planBand, toolName } from './chrome-lib'
import type { BandRow, Line } from './chrome-lib'

const PLUGIN = 'dojo'
const MODEL_ID = 'claude-sonnet-5-5'

const BAND_PROPS = {
  hasSurvey: false,
  isWorking: true,
  maxRows: 10,
  bodyColumns: 120,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
} as const

const text = (line: Line) => line.map(s => s.text).join('')

const SANJI: BandRow = {
  key: 'sanji',
  description: 'Light palette + transcript side',
  tool: 'Bash: sed -i "s| const unset = await draw(...|x|" mods/visuals/chrome.test.tsx',
  elapsedMs: 157_000,
  tokens: 58_500,
}
const LEVI: BandRow = { key: 'levi', description: 'Review the whole chrome and transcript diff for regressions and a11y gaps', tool: 'Read: /a/b.ts', elapsedMs: 42_000, tokens: 3100 }
const L: BandRow = { key: 'l', description: 'Research', elapsedMs: 3_900_000 }

/** The crew rows of a plan. */
const rowsOf = (rows: readonly BandRow[], columns: number, mode: 'dark' | 'light' = 'dark', frame = 0) =>
  planBand({ persona: 'shikamaru', rows, frame, columns, maxRows: 12, mode })

describe('band rows: format', () => {
  test('glyph and emoji, the name in the character color, the task, a dim right column', () => {
    const [row] = rowsOf([SANJI], 120)
    expect(row).toBeDefined()
    const segs = row as Line
    expect(segs[0]).toEqual({ text: '♨ 🍳 ', color: colorFor('sanji', 'dark') })
    expect(segs[1]).toEqual({ text: 'Sanji', color: colorFor('sanji', 'dark'), bold: true })
    expect(segs.find(s => s.text === 'Light palette + transcript side')?.color).toBeUndefined()
    expect(segs.find(s => s.text === ' · Bash')?.dim).toBe(true)
    const last = segs[segs.length - 1]
    expect(last?.dim).toBe(true)
    expect(last?.text.trim()).toBe('2m 37s · ↓ 58.5k')
    expect(text(segs).startsWith('♨ 🍳 Sanji  Light palette + transcript side · Bash')).toBe(true)
    expect(text(segs).endsWith('2m 37s · ↓ 58.5k')).toBe(true)
  })

  test('the glyph walks the character frames', () => {
    const frames = framesOf('sanji')
    for (const frame of [0, 1, 2, 3, 4]) {
      const [row] = rowsOf([SANJI], 120, 'dark', frame)
      expect(row?.[0]?.text).toBe(`${frames[frame % frames.length]} 🍳 `)
    }
  })

  test('no header: a row is one line, and a band is one line per row', () => {
    const lines = planBand({ persona: 'shikamaru', rows: [SANJI, LEVI], frame: 0, columns: 120, maxRows: 5 })
    expect(lines).toHaveLength(2)
    expect(text(lines[0] as Line).startsWith('♨ 🍳 Sanji')).toBe(true)
    expect(text(lines[1] as Line).startsWith('⚔ 🧹 Levi')).toBe(true)
    expect(lines.map(text).join('\n')).not.toContain('Shadow formation')
  })

  test('the right column ends on one cell for every row, and the names line up', () => {
    for (const columns of [120, 80, 60, 52]) {
      const rows = rowsOf([SANJI, LEVI, L], columns)
      const widths = rows.map(r => cellWidth(text(r)))
      expect(new Set(widths).size, `${columns} cols`).toBe(1)
      expect(widths[0]).toBe(columns - 1)
      // the task starts in the same column on every row: glyph, emoji, name column, gap
      for (const r of rows) expect(cellWidth((r[0]?.text ?? '') + (r[1]?.text ?? '') + (r[2]?.text ?? ''))).toBe(12)
    }
  })

  test('elapsed reads like the engine list: 5s, 42s, 2m 37s, 1h 05m', () => {
    const cases: [number, string][] = [
      [0, '0s'],
      [5_000, '5s'],
      [42_000, '42s'],
      [157_000, '2m 37s'],
      [3_900_000, '1h 05m'],
    ]
    for (const [ms, shown] of cases) {
      const [row] = rowsOf([{ key: 'levi', description: 'qa', elapsedMs: ms }], 100)
      expect(text(row as Line).endsWith(shown), shown).toBe(true)
      expect(text(row as Line)).not.toContain('↓')
    }
  })

  test('tokens: shown as ↓ with the figure when known, left out when absent or zero', () => {
    const base = { key: 'levi', description: 'qa', elapsedMs: 5_000 }
    const withTokens = text(rowsOf([{ ...base, tokens: 850 }], 100)[0] as Line)
    expect(withTokens.endsWith('5s · ↓ 850')).toBe(true)
    expect(text(rowsOf([{ ...base, tokens: 1_200_000 }], 100)[0] as Line).endsWith('5s · ↓ 1.2M')).toBe(true)
    for (const tokens of [undefined, 0]) {
      const row = text(rowsOf([{ ...base, ...(tokens === undefined ? {} : { tokens }) }], 100)[0] as Line)
      expect(row.endsWith('5s')).toBe(true)
      expect(row).not.toContain('↓')
    }
    // no elapsed figure known: the tokens stand alone; neither: no right column at all
    expect(text(rowsOf([{ key: 'levi', description: 'qa', tokens: 3100 }], 100)[0] as Line).endsWith('↓ 3.1k')).toBe(true)
    const bare = text(rowsOf([{ key: 'levi', description: 'qa' }], 100)[0] as Line)
    expect(bare).toBe('⚔ 🧹 Levi   qa')
  })
})

describe('band rows: width', () => {
  const TASK = 'Review the whole chrome and transcript diff for regressions and a11y gaps'

  test('the task gives way first, then the tool name, then the tokens, then the rest', () => {
    const row: BandRow = { key: 'levi', description: TASK, tool: 'Read: /a/b.ts', elapsedMs: 157_000, tokens: 58_500 }
    const at = (columns: number) => text(rowsOf([row], columns)[0] as Line)
    const full = at(120)
    expect(full).toContain(TASK)
    expect(full).toContain(' · Read')
    expect(full.endsWith('2m 37s · ↓ 58.5k')).toBe(true)

    // 80: the task is cut, the tool and the tokens stay
    const cut = at(80)
    expect(cut).not.toContain(TASK)
    expect(cut).toContain('…')
    expect(cut).toContain(' · Read')
    expect(cut.endsWith('2m 37s · ↓ 58.5k')).toBe(true)

    // 52: not enough left for a useful task beside the tool: the tool drops, the tokens stay
    const noTool = at(52)
    expect(noTool).toContain('…')
    expect(noTool).not.toContain('Read')
    expect(noTool.endsWith('2m 37s · ↓ 58.5k')).toBe(true)

    // 50: the tokens drop, the elapsed time stays
    const noTokens = at(50)
    expect(noTokens).not.toContain('↓')
    expect(noTokens).not.toContain('Read')
    expect(noTokens.endsWith('2m 37s')).toBe(true)
    expect(noTokens).not.toMatch(/·\s+2m/)
    expect(noTokens).toContain('…')

    // under 50: identity and elapsed only
    expect(at(49)).toBe('⚔ 🧹 Levi   2m 37s')
  })

  test('the tool name stays when the whole task and the tool fit', () => {
    const row = text(rowsOf([{ key: 'levi', description: 'short task', tool: 'Grep: foo', elapsedMs: 1000, tokens: 10 }], 60)[0] as Line)
    expect(row).toContain('short task · Grep')
    expect(row).not.toContain('…')
  })

  test('narrow form: glyph, emoji, name, two spaces, elapsed; the elapsed figures line up', () => {
    const lines = rowsOf([SANJI, LEVI, L], 45)
    expect(lines.map(text)).toEqual(['♨ 🍳 Sanji  2m 37s', '⚔ 🧹 Levi   42s', '◔ 🍰 L      1h 05m'])
    // no elapsed figure: the identity alone
    expect(text(rowsOf([{ key: 'senku', description: 'x' }], 30)[0] as Line)).toBe('⚗ 🧪 Senku')
    // the elapsed figure is dim
    expect(lines[0]?.[lines[0].length - 1]?.dim).toBe(true)
  })

  test('no row is wider than the columns less one, at any width, with wide characters in the task', () => {
    const rows: BandRow[] = [
      { ...SANJI, description: '日本語のタスク 🍣 with a mix of wide and narrow cells' },
      LEVI,
      L,
      { key: 'robin', description: '', tool: 'mcp__docs__search: terms', elapsedMs: 1, tokens: 1 },
    ]
    for (let columns = 1; columns <= 140; columns++) {
      for (const line of rowsOf(rows, columns)) {
        expect(cellWidth(text(line)), `${columns} cols: ${text(line)}`).toBeLessThanOrEqual(Math.max(1, columns - 1))
      }
    }
  })

  test('overflow still folds into a +N more line; a single spare row is a summary', () => {
    const three = planBand({ persona: 'shikamaru', rows: [SANJI, LEVI, L], frame: 0, columns: 120, maxRows: 3 })
    expect(three.map(text)).toEqual([expect.stringContaining('Sanji'), expect.stringContaining('Levi'), expect.stringContaining('L  ')])
    const two = planBand({ persona: 'shikamaru', rows: [SANJI, LEVI, L], frame: 0, columns: 120, maxRows: 2 })
    expect(two.map(text)).toEqual([expect.stringContaining('Sanji'), '+2 more'])
    const one = planBand({ persona: 'shikamaru', rows: [SANJI, LEVI, L], frame: 0, columns: 120, maxRows: 1 })
    expect(one.map(text)).toEqual(['🦌 3 out 🍳 🧹 🍰'])
  })
})

describe('band rows: tool name', () => {
  test('the internal report hand-back is not shown as a tool', () => {
    expect(toolName('SubagentHandback: report')).toBeUndefined()
    expect(toolName('SubagentHandback')).toBeUndefined()
  })

  test('only the name of the tool, never its command', () => {
    expect(toolName('Bash: sed -i "s|a|b|" file')).toBe('Bash')
    expect(toolName('Read: /home/x/y.ts')).toBe('Read')
    expect(toolName('Bash')).toBe('Bash')
    expect(toolName('docs__search: terms')).toBe('search')
    expect(toolName(undefined)).toBeUndefined()
    expect(toolName('')).toBeUndefined()
    expect(toolName('sed -i "s|a|b|" file')).toBeUndefined()
    expect(toolName('(weird) thing: x')).toBeUndefined()
  })

  test('the drawn row carries the name and none of the command', () => {
    for (const columns of [120, 100, 80, 60]) {
      const row = text(rowsOf([SANJI], columns)[0] as Line)
      expect(row).not.toContain('sed')
      expect(row).not.toContain('unset')
      expect(row).not.toContain('Bash:')
    }
    expect(text(rowsOf([SANJI], 120)[0] as Line)).toContain(' · Bash')
  })
})

describe('band rows: colors', () => {
  test('identity in the character color of the palette in force; the rest uncolored or dim', () => {
    for (const mode of ['dark', 'light'] as const) {
      const rows = rowsOf([SANJI, LEVI, L], 120, mode)
      for (const [i, key] of (['sanji', 'levi', 'l'] as const).entries()) {
        const row = rows[i] as Line
        expect(row[0]?.color, `${mode} ${key} glyph`).toBe(colorFor(key, mode))
        expect(row[1]?.color, `${mode} ${key} name`).toBe(colorFor(key, mode))
        for (const seg of row.slice(2)) expect(seg.color).toBeUndefined()
      }
    }
    expect(rowsOf([SANJI], 120, 'dark')[0]?.[0]?.color).not.toBe(rowsOf([SANJI], 120, 'light')[0]?.[0]?.color)
  })
})

// --- through the hooks ---------------------------------------------------------------------------------------------

type World = ReturnType<typeof world>

/** Beneath the plugin: a clock, the agent list, spawn, the tool and model-request stubs the band reads from. */
function world(on: On, opts: { env?: Record<string, string> } = {}) {
  const clock = mock.clock(on)
  mock.env(on, opts.env ?? { DOJO_STRATEGIST: 'shikamaru' })
  let agents: AgentInfo[] = []
  let n = 0
  let spend = { input_tokens: 0, output_tokens: 0 }
  on('ui.toast', () => ({ value: undefined }))
  on('audio.play', () => ({ value: undefined }))
  on('agent.list', () => ({ value: agents }))
  on('agent.spawn', () => ({ model: MODEL_ID, agentId: `ag-${++n}` }))
  on('tool.call', () => ({ result: 'ok' as never }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('turn.step', async function* (_$, e) {
    const usage = spend.input_tokens + spend.output_tokens === 0 ? null : { model: MODEL_ID, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, ...spend }
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage }
  })
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => $.ui.resolve(e).Text({ children: 'ENGINE-BAND' }))
  return {
    clock,
    setAgents: (next: AgentInfo[]) => {
      agents = next
    },
    /** What the model request beneath reports as its cost from now on. */
    spend: (input_tokens: number, output_tokens: number) => {
      spend = { input_tokens, output_tokens }
    },
  }
}

const mountBand = ($: Engine, props: Record<string, unknown> = {}) =>
  $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: { ...BAND_PROPS, ...props } as never })

/** The outer text of each row the plugin drew. */
const rowTexts = async (ui: Awaited<ReturnType<typeof mountBand>>) =>
  (await ui.findAll({ type: 'Text' })).filter(t => t.props.wrap === 'truncate-end').map(t => t.text)

/** One model request in the loop of `agentId` (the main loop when omitted), read to its end. */
const step = async ($: Engine, agentId?: string) => {
  const stream = $.turn.step({ turnId: 't1', index: 0, model: MODEL_ID, messageCount: 3, ...(agentId === undefined ? {} : { agentId }) })
  for await (const chunk of stream) void chunk
}

describe('band rows: live', () => {
  const crew = (w: World, ...entries: [string, string, string][]) =>
    w.setAgents(entries.map(([id, type, description]) => agent(id, type, 'running', description)))

  test('a deployed row shows its elapsed time from the spawn and keeps counting with the tick', async ($, on) => {
    const w = world(on)
    crew(w, ['ag-1', 'dojo:levi', 'QA the cart'])
    await $.agent.spawn(spawnInput('dojo:levi', undefined, 'QA the cart'))
    const ui = await mountBand($)
    expect((await rowTexts(ui))[0]).toMatch(/^⚔ 🧹 Levi {3}QA the cart {2,}0s$/)
    await w.clock.advance(65_000)
    const later = (await rowTexts(ui))[0] ?? ''
    expect(later).toMatch(/^\S 🧹 Levi {3}QA the cart {2,}1m 05s$/)
    expect(cellWidth(later)).toBe(BAND_PROPS.bodyColumns - 1)
    await ui.unmount()
  })

  test('the row after an engine note: a start the spawn hook did not see is noted by the tick', async ($, on) => {
    const w = world(on)
    crew(w, ['ag-1', 'dojo:levi', 'QA the cart'])
    await $.agent.spawn(spawnInput('dojo:levi', undefined, 'QA the cart'))
    // a second member appears in the list later (no spawn seen): the tick gives it a start of its own
    await w.clock.advance(10_000)
    crew(w, ['ag-1', 'dojo:levi', 'QA the cart'], ['ag-9', 'dojo:robin', 'write docs'])
    await w.clock.advance(1_000)
    const ui = await mountBand($)
    const rows = await rowTexts(ui)
    expect(rows.some(r => /Levi.*11s$/.test(r))).toBe(true)
    expect(rows.some(r => /Robin.*write docs.*[01]s$/.test(r))).toBe(true)
    await ui.unmount()
  })

  test('tokens ride the row as the agent spends them: each model request adds its own', async ($, on) => {
    const w = world(on)
    crew(w, ['ag-1', 'dojo:levi', 'QA the cart'])
    await $.agent.spawn(spawnInput('dojo:levi', undefined, 'QA the cart'))
    const ui = await mountBand($)
    expect((await rowTexts(ui))[0]).not.toContain('↓')
    w.spend(500, 1000)
    await step($, 'ag-1')
    expect(((await rowTexts(ui))[0] ?? '').endsWith('0s · ↓ 1.5k')).toBe(true)
    w.spend(100, 400)
    await step($, 'ag-1')
    expect(((await rowTexts(ui))[0] ?? '').endsWith('0s · ↓ 2k')).toBe(true)
    // the main loop's requests, and another agent's, are not this row's
    await step($)
    await step($, 'ag-other')
    expect(((await rowTexts(ui))[0] ?? '').endsWith('0s · ↓ 2k')).toBe(true)
    await ui.unmount()
  })

  test('a turn that reports a larger total lifts the figure; a smaller one never lowers it', async ($, on) => {
    const w = world(on)
    crew(w, ['ag-1', 'dojo:levi', 'QA the cart'])
    await $.agent.spawn(spawnInput('dojo:levi', undefined, 'QA the cart'))
    const finish = (input_tokens: number, output_tokens: number) =>
      $.turn.complete({
        answer: 'x',
        durationMs: 1000,
        isAborted: false,
        turnId: 't1',
        agentId: 'ag-1',
        reason: 'answer',
        usage: { model: MODEL_ID, input_tokens, output_tokens, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      } as never)
    const ui = await mountBand($)
    await finish(1000, 4000)
    expect(((await rowTexts(ui))[0] ?? '').endsWith('↓ 5k')).toBe(true)
    await finish(10, 10)
    expect(((await rowTexts(ui))[0] ?? '').endsWith('↓ 5k')).toBe(true)
    await ui.unmount()
  })

  test('the latest tool is a name on the row, not its command', async ($, on) => {
    const w = world(on)
    crew(w, ['ag-1', 'dojo:sanji', 'Light palette + transcript side'])
    await $.agent.spawn(spawnInput('dojo:sanji', undefined, 'Light palette + transcript side'))
    const command = 'sed -i "s| const unset = await draw(...|x|" mods/visuals/chrome.test.tsx'
    await $.tool.call({ tool: 'Bash', input: { command }, command, agentId: 'ag-1' } as never)
    const ui = await mountBand($)
    const row = (await rowTexts(ui))[0] ?? ''
    expect(row).toContain('Light palette + transcript side · Bash')
    expect(row).not.toContain('sed')
    await ui.unmount()
  })

  test('colors follow the palette written by the session: light after a light theme', async ($, on) => {
    const w = world(on)
    on('session.start', (_$, e) => ({ cwd: e.cwd }))
    on('config.list', () => ({ value: [{ key: 'theme', label: 'Theme', kind: 'choice', value: 'light', provider: { plugin: 'engine', tier: 'core' }, isLocked: false }] }) as never)
    crew(w, ['ag-1', 'dojo:levi', 'QA the cart'])
    await $.session.start({ cwd: '/x', surface: 'terminal', isInteractive: true })
    await $.agent.spawn(spawnInput('dojo:levi', undefined, 'QA the cart'))
    const ui = await mountBand($)
    const colored = (await ui.findAll({ type: 'Text' })).filter(t => t.props.wrap !== 'truncate-end' && t.text.trim() === 'Levi')
    expect(colored.map(t => t.props.color)).toEqual([colorFor('levi', 'light')])
    await ui.unmount()
  })

  test('the row leaves with the agent, and its bookkeeping with it', async ($, on) => {
    const w = world(on)
    crew(w, ['ag-1', 'dojo:levi', 'QA the cart'])
    await $.agent.spawn(spawnInput('dojo:levi', undefined, 'QA the cart'))
    await w.clock.advance(1_000)
    w.setAgents([agent('ag-1', 'dojo:levi', 'completed', 'QA the cart')])
    await w.clock.advance(1_000)
    const ui = await mountBand($)
    expect(await rowTexts(ui)).toEqual([])
    await ui.unmount()
  })

  test('band off: no row, and no model-request bookkeeping disturbs the stream', { options: { band: false } }, async ($, on) => {
    const w = world(on)
    crew(w, ['ag-1', 'dojo:levi', 'QA the cart'])
    await $.agent.spawn(spawnInput('dojo:levi', undefined, 'QA the cart'))
    w.spend(1, 1)
    await step($, 'ag-1')
    const ui = await mountBand($)
    expect(await rowTexts(ui)).toEqual([])
    await ui.unmount()
  })

  test('narrow bands keep the identity and the elapsed time', async ($, on) => {
    const w = world(on)
    crew(w, ['ag-1', 'dojo:levi', 'QA the cart'])
    await $.agent.spawn(spawnInput('dojo:levi', undefined, 'QA the cart'))
    await w.clock.advance(42_000)
    const ui = await mountBand($, { bodyColumns: 45 })
    expect((await rowTexts(ui))[0]).toMatch(/^\S 🧹 Levi {3}42s$/)
    await ui.unmount()
  })
})
