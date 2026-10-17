import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { AgentInfo, On } from 'claude-code'

import { agent, spawnInput } from '../lib/testkit'
import { CREW, STRATEGISTS, WORDS } from '../theme'
import { DEPLOY_MORE, FALL_LINES, FALL_MORE, RANK_LADDERS, RANK_STEPS, RANK_UP_LINES, RETURN_TOAST, TOAST_CELLS, TOAST_MS, USAGE_HOT_LINES, USAGE_STAMINA_AT, VERBS_MORE, VERB_CELLS } from './chrome-art'
import {
  cellWidth,
  deployToast,
  fallToast,
  galleryLines,
  planBand,
  planModes,
  planUsage,
  rankOf,
  rankUpText,
  recapLines,
  returnToast,
  rosterLines,
  snapshotUsage,
  themedModes,
  tint,
  verbAt,
} from './chrome-lib'
import type { Line } from './chrome-lib'

// Tests for the declutter pass: toasts as the personality channel, a headerless band, a quieter usage line, a plain
// prompt hint, a tag-only session mode, short spinner verbs and the pane readability pass. The plugin config is
// checked in tests/plugin-config.test.mjs (a module test cannot load JSON).

const PLUGIN = 'dojo'
const text = (line: Line) => line.map(s => s.text).join('')

type Toast = { text: string; timeoutMs?: number }

/** Beneath the plugin: a clock, the agent list, spawn and toast recording (text and the options it was given). */
function world(on: On, env: Record<string, string> = {}) {
  const clock = mock.clock(on)
  mock.env(on, env)
  const toasts: Toast[] = []
  let agents: AgentInfo[] = []
  let n = 0
  on('ui.toast', (_$, e) => {
    toasts.push({ text: e.text, ...(e.timeoutMs === undefined ? {} : { timeoutMs: e.timeoutMs }) })
    return { value: undefined }
  })
  on('audio.play', () => ({ value: undefined }))
  on('agent.list', () => ({ value: agents }))
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: `ag-${++n}` }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  return {
    clock,
    toasts,
    setAgents: (next: AgentInfo[]) => {
      agents = next
    },
  }
}

const finish = (agentId: string, answer: string) =>
  ({ answer, durationMs: 1000, isAborted: false, turnId: 't1', agentId, reason: 'answer' }) as const

/** Spawns `types` (ids ag-1, ag-2 ...), lets them run a second, then ends them with `ends` and lets the tick see it. */
async function runCrew(
  w: ReturnType<typeof world>,
  $: Engine,
  types: readonly string[],
  ends: readonly ('completed' | 'failed')[],
  answers: Record<number, string> = {},
) {
  const ids: string[] = []
  for (const t of types) ids.push((await $.agent.spawn(spawnInput(t, undefined, 'work'))).agentId as string)
  w.setAgents(types.map((t, i) => agent(ids[i] as string, t, 'running', 'work')))
  await w.clock.advance(1000)
  for (const [i, answer] of Object.entries(answers)) await $.turn.complete(finish(ids[Number(i)] as string, answer))
  w.setAgents(types.map((t, i) => agent(ids[i] as string, t, ends[i] ?? 'completed', 'work')))
  const before = w.toasts.length
  await w.clock.advance(300)
  return w.toasts.slice(before)
}

describe('toasts: the personality channel', () => {
  test('API: a toast is its text and a timeoutMs, nothing else, so the voice rides in the line itself', async ($, on) => {
    const w = world(on)
    await $.agent.spawn(spawnInput('dojo:levi', undefined, 'a'))
    expect(w.toasts).toHaveLength(1)
    expect(Object.keys(w.toasts[0] as Toast).sort()).toEqual(['text', 'timeoutMs'])
  })

  test('deploy: emoji, name and a line of the character, for two characters', async ($, on) => {
    const w = world(on)
    await $.agent.spawn(spawnInput('dojo:levi', undefined, 'a'))
    await $.agent.spawn(spawnInput('dojo:sanji', undefined, 'b'))
    expect(w.toasts).toEqual([
      { text: '🧹 Levi deployed — “Chi. Show me the mess.”', timeoutMs: TOAST_MS.deploy },
      { text: '🍳 Sanji deployed — “Allow me.”', timeoutMs: TOAST_MS.deploy },
    ])
  })

  test('return: the report’s own Says line, else a line of the character; two characters', async ($, on) => {
    const w = world(on)
    const out = await runCrew(w, $, ['dojo:levi', 'dojo:sanji'], ['completed', 'completed'], {
      0: 'Verdict: PASS\nSays: "Mostly clean. Fix the corner I marked."',
    })
    expect(out).toEqual([
      { text: '🧹 Levi returned — “Mostly clean. Fix the corner I marked.”', timeoutMs: TOAST_MS.return },
      { text: `🍳 Sanji returned — “${RETURN_TOAST.sanji?.[0]}”`, timeoutMs: TOAST_MS.return },
    ])
  })

  test('fall: a skull and a fall line of the character; two characters', async ($, on) => {
    const w = world(on)
    const out = await runCrew(w, $, ['dojo:levi', 'dojo:sanji'], ['failed', 'failed'])
    expect(out).toEqual([
      { text: '💀 Levi fell — “Filthy.”', timeoutMs: TOAST_MS.fall },
      { text: '💀 Sanji fell — “Spoiled ingredient.”', timeoutMs: TOAST_MS.fall },
    ])
  })

  test('the lines rotate per character with its run count: deploy, return and fall', async ($, on) => {
    const w = world(on)
    const first = await runCrew(w, $, ['dojo:levi'], ['failed'])
    expect(first[0]?.text).toBe(`💀 Levi fell — “${FALL_LINES.levi}”`)
    const second = await runCrew(w, $, ['dojo:levi'], ['failed'])
    expect(second[0]?.text).toBe(`💀 Levi fell — “${FALL_MORE.levi?.[0]}”`)
    // the deploy toast of that second run was the second line of the set
    expect(w.toasts.filter(t => t.text.includes('deployed')).map(t => t.text)[1]).toBe(`🧹 Levi deployed — “${DEPLOY_MORE.levi?.[0]}”`)
    expect(deployToast('levi', 1)).not.toBe(deployToast('levi', 2))
    expect(returnToast('levi', 1)).not.toBe(returnToast('levi', 2))
    expect(fallToast('levi', 1)).not.toBe(fallToast('levi', 2))
    // the sets wrap round
    expect(deployToast('levi', 1)).toBe(deployToast('levi', 1 + 1 + (DEPLOY_MORE.levi?.length ?? 0)))
  })

  test('every line of every character fits 60 cells, the Says line is cut with an ellipsis, and a rank-up fits too', () => {
    for (const key of Object.keys(CREW)) {
      for (let nth = 1; nth <= 12; nth++) {
        for (const line of [deployToast(key, nth), returnToast(key, nth), fallToast(key, nth), returnToast(key, nth, 'x'.repeat(200))]) {
          expect(cellWidth(line), `${key} ${nth}: ${line}`).toBeLessThanOrEqual(TOAST_CELLS)
          expect(line.length).toBeGreaterThan(0)
        }
      }
      const long = returnToast(key, 1, 'word '.repeat(40))
      expect(long.endsWith('…”')).toBe(true)
      expect(returnToast(key, 1, 'Short.')).toBe(`${CREW[key]?.emoji} ${CREW[key]?.name} returned — “Short.”`)
    }
    for (const persona of [...Object.keys(STRATEGISTS), null]) {
      for (let index = 1; index < RANK_STEPS.length; index++) {
        const info = rankOf(RANK_STEPS[index] ?? 0, persona)
        expect(info.index).toBe(index)
        expect(cellWidth(rankUpText(info, persona)), `${persona} ${index}`).toBeLessThanOrEqual(TOAST_CELLS)
        expect(rankUpText(info, persona)).toContain(`Rank up: ${info.name}`)
      }
    }
  })

  test('a Says line wins the quote, a missing or blank one falls back to the character set', () => {
    expect(returnToast('levi', 1, undefined)).toBe(`🧹 Levi returned — “${RETURN_TOAST.levi?.[0]}”`)
    expect(returnToast('levi', 1, '')).toBe(`🧹 Levi returned — “${RETURN_TOAST.levi?.[0]}”`)
    expect(returnToast('levi', 1, 'Own words.')).toBe('🧹 Levi returned — “Own words.”')
    expect(deployToast('nobody', 1)).toBe('')
  })

  test('every character has a distinct deploy, return and fall voice, with Japanese lines only where its sheet has them', () => {
    for (const key of Object.keys(CREW)) {
      expect((RETURN_TOAST[key] ?? []).length, key).toBeGreaterThanOrEqual(3)
      expect((FALL_MORE[key] ?? []).length, key).toBeGreaterThanOrEqual(2)
      expect(new Set([deployToast(key, 1), returnToast(key, 1), fallToast(key, 1)]).size).toBe(3)
    }
    const pool = (key: string) => [WORDS[key]?.deploy ?? '', ...(DEPLOY_MORE[key] ?? []), ...(RETURN_TOAST[key] ?? []), ...(FALL_MORE[key] ?? [])].join(' | ')
    expect(pool('senku')).toContain('Sosoru ze')
    expect(pool('light')).toContain('Keikaku dōri')
    expect(pool('levi')).toContain('Rittai Kidō Sōchi')
    expect(pool('robin')).toContain('Cien Fleur')
  })

  test('never more than one toast per agent event: three returns are three toasts, a spawn is one', async ($, on) => {
    const w = world(on)
    await $.agent.spawn(spawnInput('dojo:levi', undefined, 'a'))
    expect(w.toasts).toHaveLength(1)
    const out = await runCrew(w, $, ['dojo:levi', 'dojo:senku', 'dojo:robin'], ['completed', 'failed', 'completed'])
    expect(out).toHaveLength(3)
    expect(out.map(t => t.text.slice(0, 2))).toEqual(['🧹', '💀', '🌸'])
  })

  test('a return that earns a rank speaks as the rank-up instead of doubling up; the others keep their own toast', async ($, on) => {
    mock.store(on, { rank: { points: 23 } })
    const w = world(on, { DOJO_STRATEGIST: 'shikamaru' })
    const out = await runCrew(w, $, ['dojo:levi', 'dojo:senku', 'dojo:robin'], ['completed', 'completed', 'completed'])
    // points 24, 25 (the second return crosses), 26
    expect(out).toHaveLength(3)
    expect(out[0]?.text.startsWith('🧹 Levi returned')).toBe(true)
    expect(out[1]).toEqual({ text: `🦌 Rank up: Chūnin — “${RANK_UP_LINES.shikamaru?.[1]}”`, timeoutMs: TOAST_MS.rankUp })
    expect(out[2]?.text.startsWith('🌸 Robin returned')).toBe(true)
  })

  test('only returns count toward the rank: a fall before the crossing return keeps its own toast', async ($, on) => {
    mock.store(on, { rank: { points: 24 } })
    const w = world(on, { DOJO_STRATEGIST: 'lelouch' })
    const out = await runCrew(w, $, ['dojo:levi', 'dojo:senku'], ['failed', 'completed'])
    expect(out.map(t => t.text)).toEqual([`💀 Levi fell — “${FALL_LINES.levi}”`, `♟️ Rank up: Knight — “${RANK_UP_LINES.lelouch?.[1]}”`])
  })

  test('toasts off: nothing shows, rank-up included', { options: { toasts: false } }, async ($, on) => {
    mock.store(on, { rank: { points: 24 } })
    const w = world(on)
    const out = await runCrew(w, $, ['dojo:levi'], ['completed'])
    expect(out).toEqual([])
    expect(w.toasts).toEqual([])
  })

  test('the toast durations rise with the weight of the moment', () => {
    expect(TOAST_MS.deploy).toBeLessThan(TOAST_MS.return)
    expect(TOAST_MS.return).toBeLessThan(TOAST_MS.fall)
    expect(TOAST_MS.fall).toBeLessThan(TOAST_MS.rankUp)
  })
})

describe('band: rows only', () => {
  const ROW = { description: 'QA the cart', elapsedMs: 42_000 }
  const rows = ['levi', 'senku', 'robin'].map(key => ({ key, ...ROW }))

  test('one agent is one row, three agents are three rows, for either strategist or none', () => {
    for (const persona of ['shikamaru', 'lelouch', null]) {
      const one = planBand({ persona, rows: rows.slice(0, 1), frame: 0, columns: 80, maxRows: 5 })
      expect(one).toHaveLength(1)
      expect(text(one[0] as Line).startsWith('⚔ 🧹 Levi')).toBe(true)
      const three = planBand({ persona, rows, frame: 0, columns: 80, maxRows: 5 })
      expect(three).toHaveLength(3)
      for (const line of three) expect(text(line)).not.toMatch(/deployed|formation|Knights|Shadows/)
    }
  })

  test('overflow still folds into +N more, and one spare row still gives a summary', () => {
    const two = planBand({ persona: 'shikamaru', rows, frame: 0, columns: 80, maxRows: 2 })
    expect(two.map(text)).toEqual([expect.stringContaining('Levi'), '+2 more'])
    const one = planBand({ persona: 'shikamaru', rows, frame: 0, columns: 80, maxRows: 1 })
    expect(one.map(text)).toEqual(['🦌 3 out 🧹 🧪 🌸'])
  })

  test('animated glyphs stay: the row glyph walks the character frames frame by frame', () => {
    const seen = new Set<string>()
    for (let frame = 0; frame < 8; frame++) seen.add(text(planBand({ persona: null, rows: rows.slice(0, 1), frame, columns: 80, maxRows: 5 })[0] as Line).slice(0, 1))
    expect(seen.size).toBeGreaterThanOrEqual(4)
  })

  test('on screen: the hook draws exactly the rows, with a lone agent as a single line', async ($, on) => {
    const w = world(on, { DOJO_STRATEGIST: 'lelouch' })
    on('ui.render', { component: 'AbovePrompt' }, ($, e) => $.ui.resolve(e).Text({ children: 'ENGINE-BAND' }))
    w.setAgents([agent('ag-1', 'dojo:levi', 'running', 'QA the cart')])
    await $.agent.spawn(spawnInput('dojo:levi', undefined, 'QA the cart'))
    const props = { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 10 }, view: {} } as never
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props })
    const lines = (await ui.findAll({ type: 'Text' })).filter(t => t.props.wrap === 'truncate-end').map(t => t.text)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(/^\S 🧹 Levi {3}QA the cart/)
    await ui.unmount()
  })
})

describe('usage line: Chakra and cost always, Stamina from 50%', () => {
  const at = (percent: number | null, stamina: number | null, usd: number | null, columns = 80, persona: string | null = 'shikamaru') =>
    text(
      planUsage({
        persona,
        usage: { percent, limit: stamina === null ? null : { kind: 'five_hour', percent: stamina }, usd },
        columns,
      }) ?? [],
    )

  test('below the mark Stamina is left out, from it the figure and its window show', () => {
    expect(USAGE_STAMINA_AT).toBe(50)
    expect(at(58, 49, 1.42)).toBe('🦌 Chakra ≋≋≋≋≋≋∙∙∙∙ 58% · 両 $1.42')
    expect(at(58, 50, 1.42)).toBe('🦌 Chakra ≋≋≋≋≋≋∙∙∙∙ 58% · Stamina 50% (5h) · 両 $1.42')
    expect(at(58, 100, 1.42)).toContain('Stamina 100% (5h)')
    expect(at(58, 0, null)).toBe('🦌 Chakra ≋≋≋≋≋≋∙∙∙∙ 58%')
  })

  test('the mark is judged on the busiest window, rounded as drawn', () => {
    const line = (limits: [string, number][]) =>
      text(
        planUsage({
          persona: 'shikamaru',
          usage: snapshotUsage({ context: { percent: 10 }, rateLimits: limits.map(([kind, percentUsed]) => ({ kind, percentUsed })) }),
          columns: 80,
        }) ?? [],
      )
    expect(line([['five_hour', 20], ['seven_day', 49.4]])).not.toContain('Stamina')
    expect(line([['five_hour', 20], ['seven_day', 49.6]])).toContain('Stamina 50% (7d)')
  })

  test('Chakra and cost are on the line whatever Stamina does, narrow included', () => {
    for (const stamina of [0, 49, 50, 99]) {
      expect(at(30, stamina, 2.5, 80)).toContain('Chakra')
      expect(at(30, stamina, 2.5, 80)).toContain('両 $2.50')
      expect(at(30, stamina, 2.5, 40)).toContain('$2.50')
      expect(at(30, stamina, 2.5, 40)).toContain('30%')
    }
    expect(at(null, null, 0.5)).toBe('🦌 Chakra — · 両 $0.50')
  })

  test('narrow: Stamina is a bare figure from the mark, none below it, never wider than the columns', () => {
    expect(at(58, 23, 1.42, 40)).toBe('🦌 ≋≋≋∙ 58% · $1.42')
    expect(at(58, 62, 1.42, 40)).toBe('🦌 ≋≋≋∙ 58% · 62% · $1.42')
    for (const columns of [49, 40, 30, 20, 12, 6, 2]) {
      expect(cellWidth(at(58, 62, 1.42, columns)), `${columns}`).toBeLessThanOrEqual(Math.max(1, columns - 1))
    }
  })

  test('the persona warning stays at 85 and up, for context and for Stamina', () => {
    expect(at(84, 20, null)).not.toContain('Mendokus')
    expect(at(85, 20, null)).toContain(USAGE_HOT_LINES.shikamaru?.context ?? '?')
    expect(at(20, 85, null)).toContain(USAGE_HOT_LINES.shikamaru?.stamina ?? '?')
    expect(at(20, 84, null)).not.toContain('Mendokus')
  })

  test('on screen: 40% Stamina is hidden, 60% shows, with the cost on both', async ($, on) => {
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    world(on, { DOJO_STRATEGIST: 'lelouch' })
    on('ui.render', { component: 'AbovePrompt' }, ($, e) => $.ui.resolve(e).Text({ children: 'ENGINE-BAND' }))
    const measure = (stamina: number) => ({
      context: { window: 200_000, percent: 30, tokens: 60_000 },
      rateLimits: [{ kind: 'five_hour', percentUsed: stamina }],
      cost: { usd: 0.75 },
      changed: ['context' as const],
    })
    const props = { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 10 }, view: {} } as never
    const rowAfter = async (stamina: number) => {
      await $.session.measure(measure(stamina) as never)
      const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props })
      const row = (await ui.findAll({ type: 'Text' })).find(t => t.props.wrap === 'truncate-end')?.text
      await ui.unmount()
      return row
    }
    expect(await rowAfter(40)).toBe('♟️ Chakra ♞♞♞⋅⋅⋅⋅⋅⋅⋅ 30% · 両 $0.75')
    expect(await rowAfter(60)).toBe('♟️ Chakra ♞♞♞⋅⋅⋅⋅⋅⋅⋅ 30% · Stamina 60% (5h) · 両 $0.75')
  })
})

describe('prompt hint and session mode', () => {
  test('the hint passes through: no tail is added, and the engine’s own tail is left as it is', async ($, on) => {
    world(on, { DOJO_STRATEGIST: 'shikamaru' })
    on('ui.render', { component: 'PromptHint' }, ($, e) => {
      const p = e.props as { hint: string; tail?: string }
      return $.ui.resolve(e).Text({ children: `${p.hint}|${p.tail ?? 'none'}` })
    })
    const base = { isDraft: false, isWorking: false, hint: '? for shortcuts' }
    for (const props of [base, { ...base, isDraft: true }, { ...base, isWorking: true, hint: 'esc to interrupt' }]) {
      const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'PromptHint', props: props as never })
      expect((await ui.find({ type: 'Text' }))?.text).toBe(`${props.hint}|none`)
      await ui.unmount()
    }
    const withTail = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'PromptHint', props: { ...base, tail: 'engine pill' } as never })
    expect((await withTail.find({ type: 'Text' }))?.text).toBe('? for shortcuts|engine pill')
    await withTail.unmount()
  })

  test('the footer is the real mode names, dim, then the strategist tag in its color; no themed labels', () => {
    const line = planModes('shikamaru', ['focus', 'memory paused']) as Line
    expect(text(line)).toBe('focus & memory paused & 🦌 Shikamaru')
    expect(line).toEqual([
      { text: 'focus & memory paused & ', dim: true },
      { text: '🦌 Shikamaru', color: tint('shikamaru', 'dark') },
    ])
    expect(text(line)).not.toMatch(/stance|clouds|board|frozen|·/)
    // the tag alone when no mode is set; the other strategist and the light palette
    expect(planModes('lelouch', [], 'light')).toEqual([{ text: '♟️ Lelouch', color: tint('lelouch', 'light') }])
    // no strategist on duty: the footer is the engine's
    expect(planModes(null, ['focus'])).toBeUndefined()
    expect(themedModes('shikamaru', ['focus'])).toEqual(['focus', '🦌 Shikamaru'])
    expect(themedModes('shikamaru', [])).toEqual(['🦌 Shikamaru'])
  })

  test('on screen: modes dim, tag colored, on the terminal and the desktop; no persona leaves the engine footer', async ($, on) => {
    world(on, { DOJO_STRATEGIST: 'lelouch' })
    on('ui.render', { component: 'SessionMode' }, ($, e) => $.ui.resolve(e).Text({ children: `ENGINE:${(e.props as { modes: string[] }).modes.join('|')}` }))
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'SessionMode', props: { modes: ['focus'] } })
      const texts = await ui.findAll({ type: 'Text' })
      expect(texts[0]?.text).toBe('focus & ♟️ Lelouch')
      expect(texts.find(t => t.text === '♟️ Lelouch')?.props.color).toBe(tint('lelouch', 'dark'))
      expect(texts.find(t => t.text === 'focus & ')?.props.dimColor).toBe(true)
      await ui.unmount()
    }
    const alone = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'SessionMode', props: { modes: [] } })
    expect((await alone.find({ type: 'Text' }))?.text).toBe('♟️ Lelouch')
    await alone.unmount()
  })

  test('no persona: the footer is the engine’s, untouched', async ($, on) => {
    world(on)
    on('ui.render', { component: 'SessionMode' }, ($, e) => $.ui.resolve(e).Text({ children: `ENGINE:${(e.props as { modes: string[] }).modes.join('|')}` }))
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'SessionMode', props: { modes: ['focus', 'plan'] } })
    expect((await ui.find({ type: 'Text' }))?.text).toBe('ENGINE:focus|plan')
    await ui.unmount()
  })
})

describe('spinner verbs stay short', () => {
  test('no verb the spinner can pick is wider than 22 cells, for any character, turn and step', () => {
    expect(VERB_CELLS).toBe(22)
    for (const key of [...Object.keys(WORDS)]) {
      expect((WORDS[key]?.verbs ?? []).length).toBeGreaterThan(0)
      for (const verb of VERBS_MORE[key] ?? []) expect(cellWidth(verb), `${key}: ${verb}`).toBeLessThanOrEqual(VERB_CELLS)
      for (let turn = 0; turn < 8; turn++) {
        for (let step = 0; step < 40; step++) {
          const verb = verbAt(key, turn, `salt-${turn}`, step)
          expect(verb, key).not.toBe('')
          expect(cellWidth(verb), `${key} ${turn}/${step}: ${verb}`).toBeLessThanOrEqual(VERB_CELLS)
        }
      }
    }
  })

  test('a verb that is too wide is skipped, not cut: the walk still covers every verb that fits', () => {
    const fits = (v: string) => cellWidth(v) <= VERB_CELLS
    for (const key of Object.keys(WORDS)) {
      const expected = new Set([...(WORDS[key]?.verbs ?? []), ...(VERBS_MORE[key] ?? [])].filter(fits))
      const walked = new Set(Array.from({ length: expected.size + 2 }, (_, step) => verbAt(key, 0, 'x', step)))
      expect(walked).toEqual(expected)
    }
  })

  test('on screen: the crew and strategist words keep their emoji, and the verb after it is short', async ($, on) => {
    const w = world(on, { DOJO_STRATEGIST: 'lelouch' })
    w.setAgents([agent('ag-levi', 'dojo:levi')])
    on('ui.render', { component: 'Spinner' }, ($, e) => $.ui.resolve(e).Text({ children: `${(e.props as { word: string }).word}|${(e.props as { suffix: string }).suffix}` }))
    for (const [id, emoji] of [['ag-levi', '🧹'], ['main', '♟️']] as const) {
      const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Spinner', props: { word: 'Sauteing', message: null, suffix: '…', mode: 'requesting' } as never, requestId: id })
      for (let i = 0; i < 6; i++) {
        const [word, suffix] = ((await ui.find({ type: 'Text' }))?.text ?? '').split('|') as [string, string]
        expect(word.startsWith(`${emoji} `)).toBe(true)
        expect(cellWidth(word.slice(emoji.length + 1))).toBeLessThanOrEqual(VERB_CELLS)
        expect(suffix).toMatch(/^… \S$/)
        await w.clock.advance(400 * 12)
      }
      await ui.unmount()
    }
  })
})

describe('panes: readability', () => {
  const entries = {
    levi: { status: 'returned' as const, count: 2, task: 'QA', says: 'Mostly clean. Fix the corner I marked.' },
    senku: { status: 'fell' as const, count: 1, task: 'build' },
    robin: { status: 'running' as const, count: 1, task: 'write the docs' },
  }
  const stats = {
    levi: { runs: 2, returned: 2, fell: 0, ms: 192_000, tokens: 14_200, says: 'Mostly clean. Fix the corner I marked.' },
    senku: { runs: 1, returned: 0, fell: 1, ms: 5_000, tokens: 0 },
  }
  const roster = (columns: number) => rosterLines({ persona: 'shikamaru', voice: null, entries, frame: 1, columns, stats, rank: { points: 31, saved: true } })
  const recap = (columns: number) =>
    recapLines({ persona: 'shikamaru', stats, usage: { percent: 58, limit: null, usd: 1.42 }, rank: { points: 31, saved: true }, columns })

  test('roster: only emoji, names, status glyphs, the bar and the badge carry color; the rest is plain or dim', () => {
    for (const columns of [80, 50, 30]) {
      const allowed = (t: string) =>
        /^(Senku|Sanji|L|Light|Levi|Robin)\s*$/.test(t) || // crew names
        /^[✔✖○]\s?$/.test(t.trim() + ' ') || // status glyphs
        t.trim().length === 1 || // an animated running glyph
        /^🦌 Shikamaru$/.test(t) || // the strategist
        /^Chūnin$/.test(t) || // the rank name
        /^≋[≋∙]*$/.test(t) || // the rank bar
        t.startsWith('★')
      for (const line of roster(columns)) {
        for (const seg of line) if (seg.color !== undefined) expect(allowed(seg.text), `${columns}: "${seg.text}"`).toBe(true)
      }
    }
  })

  test('roster: the status word is plain (dim while idle) and never repeats a count; the figures line carries the runs', () => {
    const wide = roster(80).map(l => l.map(s => s.text).join(''))
    expect(wide.find(l => l.startsWith('🧹 Levi'))).toMatch(/✔ returned\s*$/)
    expect(wide.some(l => l.includes('×'))).toBe(false)
    expect(wide).toContain('   2 runs · 3m 12s · 14.2k tokens · ★ most deployed')
    const segs = roster(80).flat()
    expect(segs.find(s => s.text.startsWith('returned'))).toEqual({ text: 'returned    ' })
    expect(segs.find(s => s.text.startsWith('idle'))?.dim).toBe(true)
    expect(segs.find(s => s.text.startsWith('fell'))?.color).toBeUndefined()
    expect(segs.find(s => s.text === '✖ ')?.color).toBe('error')
  })

  test('roster: the header names the strategist in color and says on duty dim; quotes are italic and never colored', () => {
    const lines = roster(80)
    expect(lines[0]).toEqual([
      { text: '🦌 Shikamaru', color: tint('shikamaru', 'dark'), bold: true },
      { text: ' on duty', dim: true },
    ])
    const says = lines.find(l => l[0]?.text.includes('Mostly clean'))
    expect(says).toEqual([{ text: '   “Mostly clean. Fix the corner I marked.”', italic: true }])
    const fall = lines.find(l => l[0]?.text.includes(FALL_LINES.senku ?? '?'))
    expect(fall).toEqual([{ text: `   ${FALL_LINES.senku}`, italic: true, dim: true }])
  })

  test('recap: names share a column, a fall rides its member line, and no total repeats it', () => {
    const lines = recap(60).map(text)
    const levi = lines.find(l => l.startsWith('🧹 Levi'))
    const senku = lines.find(l => l.startsWith('🧪 Senku'))
    expect(levi).toBe('🧹 Levi  2 runs · 3m 12s · 14.2k tokens')
    expect(senku).toBe('🧪 Senku 1 run · 5s ✖ fell ×1')
    expect(levi?.indexOf('2 runs')).toBe(senku?.indexOf('1 run'))
    expect(lines.some(l => l.startsWith('Fallen'))).toBe(false)
    expect(lines.filter(l => l.includes('fell'))).toHaveLength(1)
    const fell = recap(60).flat().filter(s => s.color === 'error')
    expect(fell.map(s => s.text)).toEqual([' ✖'])
  })

  test('recap: the rolls are dim around a bold title, the sign-off is plain italic after its emoji', () => {
    const lines = recap(60)
    expect(lines[0]?.[0]).toEqual({ text: '◖═ ', dim: true })
    expect(lines[0]?.[1]).toEqual({ text: '📜 Mission report', bold: true })
    expect(lines[0]?.[2]?.dim).toBe(true)
    expect(lines.at(-1)?.every(s => s.dim === true)).toBe(true)
    const signoff = lines.at(-2) as Line
    expect(signoff[0]?.text).toBe('🦌 ')
    expect(signoff[1]?.italic).toBe(true)
    expect(signoff.some(s => s.color !== undefined)).toBe(false)
    for (const columns of [60, 40, 30, 20, 12]) for (const l of recap(columns)) expect(cellWidth(text(l)), `${columns}`).toBeLessThanOrEqual(columns)
  })

  test('gallery: the band header and prompt hint rows are gone; the quotes are plain italic, the frames keep the color', () => {
    for (let index = 0; index < 9; index++) {
      const lines = galleryLines({ index, columns: 80 })
      const labels = lines.map(l => l[0]?.text.trim())
      expect(labels).not.toContain('Band')
      expect(labels).not.toContain('Hint')
      for (const seg of lines.flat().filter(s => s.italic === true && s.text.startsWith('“'))) expect(seg.color, seg.text).toBeUndefined()
    }
    const sanji = galleryLines({ index: 4, columns: 80 })
    expect(sanji.find(l => l[0]?.text.trim() === 'Frames')?.[1]?.color).toBe(tint('sanji', 'dark'))
    expect(sanji.find(l => l[0]?.text.trim() === 'Deploy')?.[1]).toEqual({ text: '“Allow me.”', italic: true })
  })

  test('the rank line dims its label and figures; the name and bar keep the color', () => {
    const rank = roster(80)[3] as Line
    expect(rank[0]).toEqual({ text: 'Rank: ', dim: true })
    expect(rank[1]?.bold).toBe(true)
    expect(rank[1]?.color).toBe(tint('shikamaru', 'dark'))
    expect(rank.at(-1)?.dim).toBe(true)
    expect(RANK_LADDERS.shikamaru).toContain('Chūnin')
  })
})
