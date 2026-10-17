import { CREW, FELL_EMOJI, NEUTRAL, STRATEGISTS, WORDS, accentFor, colorFor } from '../theme'
import type { PaletteMode, Theme } from '../theme'
import { hash, pick, truncate } from '../lib/text'
import type { DojoCrewStats, DojoRank, DojoRosterEntry, DojoUsage } from '../state'
import {
  DEFAULT_VOICE,
  DEPLOY_MORE,
  FALL_LINES,
  FALL_MORE,
  FRAMES_MORE,
  GALLERY_ORDER,
  LONG_TURN_MS,
  MODELS,
  RANK_LADDERS,
  RANK_STEPS,
  RANK_UP_LINES,
  RECAP_SIGNOFFS,
  RETURN_TOAST,
  SAYS_SAMPLES,
  TOAST_CELLS,
  TURN_LONG,
  USAGE_BAR,
  USAGE_BARS,
  USAGE_HOT_AT,
  USAGE_HOT_LINES,
  USAGE_LABELS,
  USAGE_STAMINA_AT,
  USAGE_WARN_AT,
  VERBS_MORE,
  VERB_CELLS,
  WINDOW_LABELS,
} from './chrome-art'
import { BANNERS, BANNER_COLUMNS, BANNER_ROWS, BUBBLES, NEUTRAL_BANNER, RETURN_LINES } from './transcript-art'

// Pure helpers for visuals/chrome.tsx: width math, color, wording and the line plans the hooks draw.
// A plan is plain data (Line[]); chrome.tsx turns it into Box and Text, because only a hook may reach the element table.

export type Seg = { text: string; color?: string; bold?: boolean; dim?: boolean; italic?: boolean }
export type Line = Seg[]

// --- width -------------------------------------------------------------------------------------------------------

const WIDE: readonly (readonly [number, number])[] = [
  [0x1100, 0x115f],
  [0x2e80, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe30, 0xfe6f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x1f300, 0x1f64f],
  [0x1f680, 0x1f6ff],
  [0x1f900, 0x1faff],
  [0x20000, 0x3fffd],
]

const isWide = (cp: number) => WIDE.some(([a, b]) => cp >= a && cp <= b)
const isZeroWidth = (cp: number) => cp === 0x200d || (cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0x300 && cp <= 0x36f)

/** The cells each code point of `chars` takes: emoji and CJK two, joiners and variation selectors none. */
function widths(chars: readonly string[]): number[] {
  return chars.map((ch, i) => {
    const cp = ch.codePointAt(0) ?? 0
    if (isZeroWidth(cp)) return 0
    // a glyph followed by the emoji selector is drawn as a two-cell emoji
    return isWide(cp) || chars[i + 1]?.codePointAt(0) === 0xfe0f ? 2 : 1
  })
}

/** Terminal cells `text` takes. */
export function cellWidth(text: string): number {
  return widths([...text]).reduce((a, b) => a + b, 0)
}

/** `text` cut to `cells` terminal cells, ending in an ellipsis when it was cut. */
export function clip(text: string, cells: number): string {
  if (cells <= 0) return ''
  if (cellWidth(text) <= cells) return text
  const chars = [...text]
  const w = widths(chars)
  let out = ''
  let used = 0
  for (let i = 0; i < chars.length; i++) {
    if (used + (w[i] as number) > cells - 1) break
    out += chars[i]
    used += w[i] as number
  }
  return out + '…'
}

/** A line cut to `cells` terminal cells. */
export function clipLine(line: Line, cells: number): Line {
  const out: Line = []
  let left = cells
  for (const seg of line) {
    if (left <= 0) break
    const w = cellWidth(seg.text)
    if (w <= left) {
      out.push(seg)
      left -= w
    } else {
      out.push({ ...seg, text: clip(seg.text, left) })
      break
    }
  }
  return out
}

const pad = (text: string, cells: number) => text + ' '.repeat(Math.max(0, cells - cellWidth(text)))

// --- color -------------------------------------------------------------------------------------------------------

export { legible } from '../theme'

/** The color the chrome draws character `key` in: the palette's own value for `mode` (dark is already lifted to read on black). */
export function tint(key: string, mode: PaletteMode = 'dark'): string {
  return colorFor(key, mode)
}

// --- wording -----------------------------------------------------------------------------------------------------

const words = (key: string) => WORDS[key] ?? WORDS.strategist

/** Band and spinner frames of a character: the base four, then the extra ones. */
export function framesOf(key: string): readonly string[] {
  const w = words(key)
  return [...(w?.frames ?? ['◐']), ...(FRAMES_MORE[key] ?? [])]
}

/** The spinner verb for a turn: the first one is the base pick; `step` walks on through the base then the extra verbs. A verb wider than `VERB_CELLS` is never drawn. */
export function verbAt(key: string, turn: number, salt: string, step: number): string {
  const fits = (verb: string) => cellWidth(verb) <= VERB_CELLS
  const base = (words(key)?.verbs ?? []).filter(fits)
  if (base.length === 0) return ''
  const seq = [...base, ...(VERBS_MORE[key] ?? []).filter(fits)]
  const first = (turn + hash(salt)) % base.length
  return seq[(first + Math.max(0, step)) % seq.length] as string
}

/** The turn-end word: the strategist's own pool, and a long-turn pool once the turn ran past a minute and a half. */
export function turnWord(key: string, done: readonly string[], durationMs: number, turn: number): string {
  const long = TURN_LONG[key]
  const pool = durationMs >= LONG_TURN_MS && long !== undefined ? long : done
  return pick(pool, turn, String(durationMs))
}

/** `Bash: npm test` for a crew row: one band line, cut to `columns` code points. */
export type RowInput = { key: string; description: string; tool?: string; frame: number }

export function bandLine(row: RowInput, columns: number): string {
  const c = CREW[row.key]
  if (c === undefined) return ''
  const frames = framesOf(row.key)
  const glyph = frames[row.frame % frames.length] ?? ''
  const head = `${c.emoji} ${c.name} ${glyph} ${row.description}`
  const line = row.tool === undefined ? head : `${head} · ${row.tool}`
  return truncate(line, columns)
}

/** The last `Says:` line of a report, without its quotes; undefined when there is none. */
export function parseSays(answer: string): string | undefined {
  let found: string | undefined
  for (const m of answer.matchAll(/^\s*(?:[-*>]\s*)?Says:\s*(.+)$/gim)) {
    const text = (m[1] ?? '').trim().replace(/^["“'‘]+/, '').replace(/["”'’]+$/, '').trim()
    if (text !== '') found = text.length > 120 ? truncate(text, 120) : text
  }
  return found
}

// --- toasts ------------------------------------------------------------------------------------------------------

/** `head — “quote”` inside `TOAST_CELLS`: the quote is cut with an ellipsis, and left out where no room is left for it. */
function toastLine(head: string, quote: string | undefined): string {
  const room = TOAST_CELLS - cellWidth(head) - 5
  if (quote === undefined || quote.trim() === '' || room < 6) return clip(head, TOAST_CELLS)
  return `${head} — “${clip(quote.replace(/\s+/g, ' ').trim(), room)}”`
}

/** The n-th (1-based) entry of a pool, wrapping round. */
const nthOf = (pool: readonly string[], nth: number): string | undefined => pool[(Math.max(1, nth) - 1) % Math.max(1, pool.length)]

/** The deploy toast of the n-th deploy of crew member `key`: its emoji, name and a line from its deploy set. */
export function deployToast(key: string, nth: number): string {
  const c = CREW[key]
  if (c === undefined) return ''
  const pool = [words(key)?.deploy ?? '', ...(DEPLOY_MORE[key] ?? [])].filter(l => l !== '')
  return toastLine(`${c.emoji} ${c.name} deployed`, nthOf(pool, nth))
}

/** The return toast: the report's own `Says:` line when it gave one, else a line from the return set. */
export function returnToast(key: string, nth: number, says?: string): string {
  const c = CREW[key]
  if (c === undefined) return ''
  return toastLine(`${c.emoji} ${c.name} returned`, says !== undefined && says !== '' ? says : nthOf(RETURN_TOAST[key] ?? [], nth))
}

/** The fall toast: a line from the fall set of crew member `key`. */
export function fallToast(key: string, nth: number): string {
  const c = CREW[key]
  if (c === undefined) return ''
  const pool = [FALL_LINES[key] ?? '', ...(FALL_MORE[key] ?? [])].filter(l => l !== '')
  return toastLine(`${FELL_EMOJI} ${c.name} fell`, nthOf(pool, nth))
}

/** `claude-sonnet-5-5` -> `sonnet 5.5`; anything else as given. */
export function modelLabel(id: string): string {
  const m = /^claude-([a-z]+)-(\d+)-(\d+)/.exec(id)
  return m === null ? id : `${m[1]} ${m[2]}.${m[3]}`
}

// --- prompt chrome -----------------------------------------------------------------------------------------------

/** Footer modes as they are, then the on-duty strategist's tag as the last one; the modes alone when no strategist is on duty. */
export function themedModes(persona: string | null, modes: readonly string[]): string[] {
  const t = persona === null ? undefined : STRATEGISTS[persona]
  return t === undefined ? [...modes] : [...modes, `${t.emoji} ${t.name}`]
}

/** The footer as one line: the modes dim and joined as the engine joins them, then the strategist's tag in its color. Undefined with no strategist on duty. */
export function planModes(persona: string | null, modes: readonly string[], mode: PaletteMode = 'dark'): Line | undefined {
  const t = persona === null ? undefined : STRATEGISTS[persona]
  if (t === undefined) return undefined
  const tag: Seg = { text: `${t.emoji} ${t.name}`, color: tint(t.key, mode) }
  return modes.length === 0 ? [tag] : [{ text: `${modes.join(' & ')} & `, dim: true }, tag]
}

// --- crew band ---------------------------------------------------------------------------------------------------

export type BandRow = {
  key: string
  description: string
  /** The latest tool line (`Bash: npm test`); only its name is ever drawn. */
  tool?: string
  /** Milliseconds since the agent started; none when its start is unknown. */
  elapsedMs?: number
  /** Tokens it has spent so far; none (or 0) when no figure is known. */
  tokens?: number
}

/** Rows narrower than this keep only the identity and the elapsed time. */
const BAND_NARROW = 50
/** Cells the task must keep for the token figure to stay on the row. */
const TASK_WITH_TOKENS = 20
/** Cells the task must keep, cut short, for the tool name to stay beside it. */
const TASK_WITH_TOOL = 16
const BAND_GAP = 2
const NAME_CELLS = Math.max(...Object.values(CREW).map(c => cellWidth(c.name)))

/** `Bash` from `Bash: npm test`; a tool line that does not start with a plain name gives undefined, never the command. */
const HIDDEN_TOOLS = new Set(['SubagentHandback'])

export function toolName(line: string | undefined): string | undefined {
  if (line === undefined) return undefined
  const head = (line.split(':')[0] ?? '').trim()
  const name = head.includes('__') ? (head.split('__').pop() ?? '') : head
  if (HIDDEN_TOOLS.has(name)) return undefined
  return /^[A-Za-z][A-Za-z0-9_.-]{0,23}$/.test(name) ? name : undefined
}

/** `2m 37s · ↓ 58.5k`: the right column of a row. `withTokens` false leaves the token figure out. */
function rightText(r: BandRow, withTokens: boolean): string {
  const parts: string[] = []
  if (r.elapsedMs !== undefined && Number.isFinite(r.elapsedMs)) parts.push(fmtDuration(r.elapsedMs))
  if (withTokens && r.tokens !== undefined && r.tokens > 0) parts.push(`↓ ${fmtTokens(r.tokens)}`)
  return parts.join(' · ')
}

/**
 * The band as lines: one line per running crew member, led by its animated glyph and emoji. Never more than `maxRows`
 * lines and never wider than `columns`; overflow becomes one dim `+N more` line, and a band squeezed into a single
 * row is one summary line.
 */
export function planBand(input: {
  persona: string | null
  rows: readonly BandRow[]
  frame: number
  columns: number
  maxRows: number
  mode?: PaletteMode
}): Line[] {
  const { persona, rows, frame, columns } = input
  const mode = input.mode ?? 'dark'
  const maxRows = Math.max(1, input.maxRows)
  const theme = persona === null ? undefined : STRATEGISTS[persona]
  const cells = Math.max(1, columns - 1)
  const lead = (r: BandRow): { head: Seg; name: Seg; width: number } | undefined => {
    const c = CREW[r.key]
    if (c === undefined) return undefined
    const frames = framesOf(r.key)
    const color = tint(c.key, mode)
    const head = { text: `${frames[frame % frames.length] ?? ''} ${c.emoji} `, color }
    const name = { text: pad(c.name, NAME_CELLS), color, bold: true }
    return { head, name, width: cellWidth(head.text) + NAME_CELLS }
  }
  // the right column is one shape for the whole band: tokens go for every row at once, so the figures stay in line
  const wide = columns >= BAND_NARROW
  const rightWidth = (withTokens: boolean) => Math.max(0, ...rows.map(r => cellWidth(rightText(r, withTokens))))
  const leadCells = Math.max(NAME_CELLS + 5, ...rows.map(r => lead(r)?.width ?? 0))
  const space = (right: number) => cells - leadCells - BAND_GAP - (right === 0 ? 0 : right + BAND_GAP)
  const withTokens = wide && space(rightWidth(true)) >= TASK_WITH_TOKENS
  const rightCells = wide ? rightWidth(withTokens) : 0
  const row = (r: BandRow): Line => {
    const l = lead(r)
    if (l === undefined) return []
    const out: Line = [l.head, l.name]
    if (!wide) {
      const elapsed = rightText(r, false)
      return clipLine(elapsed === '' ? out : [...out, { text: ' '.repeat(BAND_GAP) + elapsed, dim: true }], cells)
    }
    const right = rightText(r, withTokens)
    const avail = Math.max(0, space(rightCells))
    const task = r.description.replace(/\s+/g, ' ').trim()
    const tool = toolName(r.tool)
    const toolText = tool === undefined ? '' : ` · ${tool}`
    let shownTask = task
    let shownTool = toolText
    if (cellWidth(task) + cellWidth(toolText) > avail) {
      if (toolText !== '' && withTokens && avail - cellWidth(toolText) >= TASK_WITH_TOOL) shownTask = clip(task, avail - cellWidth(toolText))
      else {
        shownTool = ''
        shownTask = clip(task, avail)
      }
    }
    out.push({ text: ' '.repeat(BAND_GAP) })
    if (shownTask !== '') out.push({ text: shownTask })
    if (shownTool !== '') out.push({ text: shownTool, dim: true })
    if (right !== '') {
      const used = l.width + BAND_GAP + cellWidth(shownTask) + cellWidth(shownTool)
      out.push({ text: ' '.repeat(Math.max(1, cells - used - cellWidth(right))) + right, dim: true })
    }
    return clipLine(out, cells)
  }
  if (rows.length <= maxRows) return rows.map(row)
  if (maxRows === 1) {
    const emojis = rows.map(r => CREW[r.key]?.emoji ?? '').join(' ')
    const lead = theme === undefined ? '' : `${theme.emoji} `
    return [clipLine([{ text: `${lead}${rows.length} out ${emojis}`, color: tint(theme?.key ?? 'strategist', mode), bold: true }], columns)]
  }
  const room = maxRows - 1
  return [...rows.slice(0, room).map(row), [{ text: `+${rows.length - room} more`, dim: true }]]
}

// --- usage line --------------------------------------------------------------------------------------------------

/** The usage figures of `session.measure` or `$.session.usage()`, cut down to what the line draws. */
export function snapshotUsage(source: {
  context: { percent?: number }
  rateLimits: readonly { kind: string; percentUsed: number }[]
  cost?: { usd: number }
}): DojoUsage {
  let limit: DojoUsage['limit'] = null
  for (const w of source.rateLimits) {
    if (Number.isFinite(w.percentUsed) && (limit === null || w.percentUsed > limit.percent)) limit = { kind: w.kind, percent: w.percentUsed }
  }
  const percent = source.context.percent
  const usd = source.cost?.usd
  return {
    percent: percent !== undefined && Number.isFinite(percent) ? percent : null,
    limit,
    usd: usd !== undefined && Number.isFinite(usd) ? usd : null,
  }
}

const clampPercent = (p: number) => Math.min(100, Math.max(0, Math.round(p)))

/** The bar glyphs of a persona key (the neutral ones for no persona or an unknown key). */
export function barGlyphs(persona: string | null): { full: string; empty: string } {
  return (persona === null ? undefined : USAGE_BARS[persona]) ?? (USAGE_BARS.strategist as { full: string; empty: string })
}

/** `▰▰▰▱▱▱▱▱▱▱`: the bar filled up to the next whole cell, in the glyphs of `persona` (neutral when omitted). */
export function usageBar(percent: number, cells: number, persona: string | null = null): string {
  cells = Math.max(0, cells)
  const filled = Math.min(cells, Math.max(0, Math.ceil((clampPercent(percent) * cells) / 100)))
  const { full, empty } = barGlyphs(persona)
  return full.repeat(filled) + empty.repeat(cells - filled)
}

/** The color of a figure: the strategist's below the warning mark, then the theme's warning and error colors. */
export function usageColor(percent: number, base: string): string {
  const p = clampPercent(percent)
  return p >= USAGE_HOT_AT ? 'error' : p >= USAGE_WARN_AT ? 'warning' : base
}

/**
 * The one usage row as a line, or none when no figure is known. Chakra and the cost are always on it; Stamina joins
 * once its percent reaches `USAGE_STAMINA_AT`. Wide terminals get the full row, dropping the persona warning, then
 * the cost, when they do not fit; under 50 columns it is the compact form. Never wider than `columns`.
 */
export function planUsage(input: { persona: string | null; usage: DojoUsage; columns: number; mode?: PaletteMode }): Line | undefined {
  const { usage, columns } = input
  if (usage.percent === null && usage.limit === null && usage.usd === null) return undefined
  const theme = (input.persona === null ? undefined : STRATEGISTS[input.persona]) ?? NEUTRAL
  const base = tint(theme.key, input.mode ?? 'dark')
  const lead: Seg = { text: `${theme.emoji} ` }
  const sep: Seg = { text: ' · ', dim: true }
  const room = Math.max(1, columns - 1)
  const ctx = usage.percent === null ? undefined : clampPercent(usage.percent)
  const stamina = usage.limit === null ? undefined : clampPercent(usage.limit.percent)
  const sta = stamina !== undefined && stamina >= USAGE_STAMINA_AT ? stamina : undefined
  const window = usage.limit === null ? '' : (WINDOW_LABELS[usage.limit.kind] ?? usage.limit.kind)

  const figure = (percent: number, text: string): Seg => ({ text, color: usageColor(percent, base) })
  const join = (parts: Line[]): Line => parts.flatMap((p, i) => (i === 0 ? p : [sep, ...p]))
  const hot = ctx !== undefined && ctx >= USAGE_HOT_AT ? 'context' : sta !== undefined && sta >= USAGE_HOT_AT ? 'stamina' : undefined
  const hotText = hot === undefined ? undefined : (USAGE_HOT_LINES[theme.key] ?? USAGE_HOT_LINES.strategist)?.[hot]

  const full = (withCost: boolean, withHot: boolean): Line => {
    const parts: Line[] = []
    parts.push(
      ctx === undefined
        ? [{ text: `${USAGE_LABELS.context} —` }]
        : [{ text: `${USAGE_LABELS.context} ` }, figure(ctx, usageBar(ctx, USAGE_BAR.cells, theme.key)), figure(ctx, ` ${ctx}%`)],
    )
    if (sta !== undefined) {
      parts.push([{ text: `${USAGE_LABELS.stamina} ` }, figure(sta, `${sta}%`), ...(window === '' ? [] : [{ text: ` (${window})`, dim: true }])])
    }
    if (withCost && usage.usd !== null) parts.push([{ text: `${USAGE_LABELS.cost} $${usage.usd.toFixed(2)}` }])
    if (withHot && hotText !== undefined) parts.push([{ text: hotText, color: 'error', italic: true }])
    return [lead, ...join(parts)]
  }

  const compact = (): Line => {
    const parts: Line[] = []
    parts.push(ctx === undefined ? [{ text: '—' }] : [figure(ctx, usageBar(ctx, USAGE_BAR.compactCells, theme.key)), figure(ctx, ` ${ctx}%`)])
    if (sta !== undefined) parts.push([figure(sta, `${sta}%`)])
    if (usage.usd !== null) parts.push([{ text: `$${usage.usd.toFixed(2)}` }])
    return [lead, ...join(parts)]
  }

  const width = (line: Line) => line.reduce((n, s) => n + cellWidth(s.text), 0)
  if (columns >= 50) {
    for (const line of [full(true, true), full(true, false), full(false, false)]) {
      if (width(line) <= room) return line
    }
  }
  return clipLine(compact(), room)
}

// --- rank --------------------------------------------------------------------------------------------------------

export type RankInfo = {
  name: string
  /** Rung on the ladder, 0 the lowest. */
  index: number
  points: number
  /** The next rung and the points it starts at; undefined at the top. */
  next?: { name: string; at: number }
  /** 0 to 100 toward the next rung (100 at the top). */
  percent: number
  /** False when the points live only in this session. */
  saved: boolean
}

/** The rung `points` stand on in the ladder of `persona` (neutral names for no persona). */
export function rankOf(points: number, persona: string | null, saved = true): RankInfo {
  const ladder = (persona === null ? undefined : RANK_LADDERS[persona]) ?? (RANK_LADDERS.strategist as readonly string[])
  const p = Math.max(0, Math.floor(Number.isFinite(points) ? points : 0))
  let index = 0
  RANK_STEPS.forEach((at, i) => {
    if (p >= at) index = i
  })
  const floor = RANK_STEPS[index] ?? 0
  const at = RANK_STEPS[index + 1]
  const name = ladder[index] ?? ''
  if (at === undefined) return { name, index, points: p, percent: 100, saved }
  return { name, index, points: p, next: { name: ladder[index + 1] ?? '', at }, percent: ((p - floor) / (at - floor)) * 100, saved }
}

/** The rank-up toast text for reaching `info`'s rung, in the voice of `persona`. */
export function rankUpText(info: RankInfo, persona: string | null): string {
  const t = persona === null ? undefined : STRATEGISTS[persona]
  const lines = RANK_UP_LINES[persona === null || RANK_UP_LINES[persona] === undefined ? 'strategist' : persona] ?? []
  const line = lines[info.index] ?? ''
  const head = `${(t ?? NEUTRAL).emoji} Rank up: ${info.name}`
  return line === '' ? clip(head, TOAST_CELLS) : clip(`${head} — “${line}”`, TOAST_CELLS)
}

const BAR_CELLS = 8

/** The rank as one line: the widest form that fits `columns`, down to name and points. */
export function rankLine(info: RankInfo, persona: string | null, columns: number, mode: PaletteMode = 'dark'): Line {
  const theme = (persona === null ? undefined : STRATEGISTS[persona]) ?? NEUTRAL
  const color = tint(theme.key, mode)
  const tag = info.saved ? '' : ' (this session)'
  const shortTag = info.saved ? '' : ' (session)'
  const bar = usageBar(info.percent, BAR_CELLS, theme.key)
  const name = (text: string): Seg => ({ text, color, bold: true })
  const toward = info.next === undefined ? undefined : `${info.points}/${info.next.at} → ${info.next.name}`
  const rest = toward ?? `${info.points} pts`
  const candidates: Line[] = [
    [{ text: 'Rank: ', dim: true }, name(info.name), { text: ' ' }, { text: bar, color }, { text: ` ${rest}${info.next === undefined ? ' · top rank' : ''}${tag}`, dim: true }],
    [{ text: 'Rank: ', dim: true }, name(info.name), { text: ` ${rest}${tag}`, dim: true }],
    [name(info.name), { text: ` ${info.next === undefined ? info.points : `${info.points}/${info.next.at}`}${shortTag}`, dim: true }],
  ]
  const width = (l: Line) => l.reduce((n, seg) => n + cellWidth(seg.text), 0)
  return candidates.find(l => width(l) <= columns) ?? clipLine(candidates[2] as Line, columns)
}

/** The stats table with `delta` added to `key`'s figures; a new table, the old one untouched. */
export function addStats(table: Readonly<Record<string, DojoCrewStats>>, key: string, delta: Partial<DojoCrewStats>): Record<string, DojoCrewStats> {
  const cur = table[key] ?? { runs: 0, returned: 0, fell: 0, ms: 0, tokens: 0 }
  const says = delta.says ?? cur.says
  return {
    ...table,
    [key]: {
      runs: cur.runs + (delta.runs ?? 0),
      returned: cur.returned + (delta.returned ?? 0),
      fell: cur.fell + (delta.fell ?? 0),
      ms: cur.ms + (delta.ms ?? 0),
      tokens: cur.tokens + (delta.tokens ?? 0),
      ...(says === undefined ? {} : { says }),
    },
  }
}

/** What an agent's token figure is made of: the prompt of its latest response and the output of all of them. */
export type AgentTokens = { latestInput: number; cumOutput: number }

/** Claude Code's own per-agent figure: the latest response's whole prompt plus every response's output. */
export function agentTokens(state: AgentTokens): number {
  return state.latestInput + state.cumOutput
}

/**
 * The state after one more response: the input (cache writes and reads included) replaces the last one, the output
 * is added to the running sum. Undefined or unreadable usage leaves the state as it was.
 */
export function stepTokens(prev: AgentTokens, usage: unknown): AgentTokens {
  if (typeof usage !== 'object' || usage === null) return prev
  const u = usage as Record<string, unknown>
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0)
  return {
    latestInput: n(u.input_tokens) + n(u.cache_creation_input_tokens) + n(u.cache_read_input_tokens),
    cumOutput: prev.cumOutput + n(u.output_tokens),
  }
}

// --- crew stats --------------------------------------------------------------------------------------------------

/** `42s`, `3m 12s`, `1h 05m`. */
export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

/** `850`, `14.2k`, `1.2M`. */
export function fmtTokens(n: number): string {
  if (n < 1000) return String(Math.max(0, Math.round(n)))
  if (n < 1_000_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
}

/**
 * The crew key deployed most this session, or null when nobody ran twice. A tie on runs goes to the member with
 * the longer total run time, then to the earlier one in the crew order.
 */
export function mostDeployed(stats: Readonly<Record<string, DojoCrewStats>>): string | null {
  let best: string | null = null
  for (const key of Object.keys(CREW)) {
    const st = stats[key]
    if (st === undefined || st.runs < 1) continue
    const top = best === null ? undefined : stats[best]
    if (top === undefined || st.runs > top.runs || (st.runs === top.runs && st.ms > top.ms)) best = key
  }
  const winner = best === null ? undefined : stats[best]
  return winner !== undefined && winner.runs >= 2 ? best : null
}

/** The figures of one member, widest to narrowest: `2 runs · 3m 12s · 14.2k tokens`, `2× · 3m 12s · 14.2k tok`, `2× 3m 12s 14.2k`. */
function statForms(st: DojoCrewStats): [string, string, string] {
  const time = st.ms > 0 ? fmtDuration(st.ms) : ''
  const tok = st.tokens > 0 ? fmtTokens(st.tokens) : ''
  const join = (parts: string[], sep: string) => parts.filter(p => p !== '').join(sep)
  return [
    join([`${st.runs} ${st.runs === 1 ? 'run' : 'runs'}`, time, tok === '' ? '' : `${tok} tokens`], ' · '),
    join([`${st.runs}×`, time, tok === '' ? '' : `${tok} tok`], ' · '),
    join([`${st.runs}×`, time, tok], ' '),
  ]
}

/** One dim line under a crew member: runs, run time, tokens and the most-deployed badge. Undefined when it never ran. */
function statsLine(key: string, st: DojoCrewStats | undefined, isTop: boolean, columns: number, indent: number, mode: PaletteMode): Line | undefined {
  if (st === undefined || st.runs < 1) return undefined
  const [wide, mid, narrow] = statForms(st)
  const fits = (text: string) => indent + cellWidth(text) <= columns
  const plan = isTop
    ? [`${wide} · ★ most deployed`, `${wide} ★`, `${mid} ★`, `${narrow} ★`, narrow]
    : [wide, mid, narrow]
  const text = plan.find(fits) ?? clip(narrow, Math.max(1, columns - indent))
  const star = text.indexOf('★')
  const pad = ' '.repeat(indent)
  if (star < 0) return [{ text: pad + text, dim: true }]
  const badgeAt = text.lastIndexOf(' · ★') >= 0 ? text.lastIndexOf(' · ★') + 3 : star
  return [
    { text: pad + text.slice(0, badgeAt), dim: true },
    { text: text.slice(badgeAt), color: tint(key, mode), bold: true },
  ]
}

// --- roster pane -------------------------------------------------------------------------------------------------

export type RosterEntry = DojoRosterEntry
type CrewStatus = RosterEntry['status']

export type RosterInput = {
  /** Detected strategist persona key, or null. */
  persona: string | null
  /** The /dojo-voice override, or null for the roster default. */
  voice: string | null
  entries: Readonly<Record<string, RosterEntry>>
  frame: number
  columns: number
  /** The palette in force; dark when omitted. */
  mode?: PaletteMode
  /** Per-crew runs, time and tokens this session. */
  stats?: Readonly<Record<string, DojoCrewStats>>
  /** Rank points to show under the header; none when omitted (the rank toggle is off). */
  rank?: DojoRank
}

const MEDIUM = 36
const WIDE_PANE = 64

/** A crew member's status: the glyph carries the color, the word stays plain (dim while idle). The run count lives in the figures line. */
function statusOf(key: string, entry: RosterEntry | undefined, frame: number, mode: PaletteMode): { glyph: string; color: string; word: string; isIdle: boolean } {
  switch (entry?.status) {
    case 'running': {
      const frames = framesOf(key)
      return { glyph: frames[frame % frames.length] ?? '●', color: tint(CREW[key]?.key ?? 'strategist', mode), word: 'running', isIdle: false }
    }
    case 'returned':
      return { glyph: '✔', color: 'success', word: 'returned', isIdle: false }
    case 'fell':
      return { glyph: '✖', color: 'error', word: 'fell', isIdle: false }
    default:
      return { glyph: '○', color: 'inactive', word: 'idle', isIdle: true }
  }
}

/** The last `Says:` line (italic), or the character's fall line under a fallen member (italic, dim). Never colored. */
function quoteLine(key: string, entry: RosterEntry | undefined, indent: number): Line | undefined {
  const text = entry?.says !== undefined ? `“${entry.says}”` : entry?.status === 'fell' ? (FALL_LINES[key] ?? '') : ''
  if (text === '' || CREW[key] === undefined) return undefined
  return [{ text: ' '.repeat(indent) + text, italic: true, ...(entry?.says === undefined ? { dim: true } : {}) }]
}

/** The /dojo pane as lines: who is on duty and at what voice level, a tally, the rank, then every crew member. */
export function rosterLines(input: RosterInput): Line[] {
  const { persona, entries, frame, columns } = input
  const mode = input.mode ?? 'dark'
  const stats = input.stats ?? {}
  const top = mostDeployed(stats)
  const t = persona === null ? undefined : STRATEGISTS[persona]
  const lines: Line[] = []

  lines.push(
    t === undefined
      ? [{ text: 'No strategist on duty', dim: true }]
      : [{ text: `${t.emoji} ${t.name}`, color: tint(t.key, mode), bold: true }, { text: ' on duty', dim: true }],
  )
  const voice = input.voice ?? DEFAULT_VOICE
  const source = input.voice === null ? 'roster default' : 'override'
  const model = t === undefined ? '' : ` · ${modelLabel(MODELS.strategist ?? '')}`
  lines.push([{ text: `voice: ${voice} (${source})${model}`, dim: true }])

  const keys = Object.keys(CREW)
  const count = (s: CrewStatus) => keys.filter(k => entries[k]?.status === s).length
  const idle = keys.filter(k => entries[k] === undefined).length
  const tally = [count('running'), count('returned'), count('fell'), idle]
  const tallies = [
    `crew: ${tally[0]} running · ${tally[1]} returned · ${tally[2]} fell · ${tally[3]} idle`,
    `crew: ${tally[0]} run · ${tally[1]} ret · ${tally[2]} fell · ${tally[3]} idle`,
    `${tally[0]} run ${tally[1]} ret ${tally[2]} fell ${tally[3]} idle`,
  ]
  lines.push([{ text: tallies.find(t => cellWidth(t) <= columns) ?? (tallies[2] as string), dim: true }])
  if (input.rank !== undefined) lines.push(rankLine(rankOf(input.rank.points, persona, input.rank.saved), persona, columns, mode))
  lines.push([{ text: '─'.repeat(Math.max(1, Math.min(columns, 48))), dim: true }])

  for (const key of keys) {
    const c = CREW[key]
    if (c === undefined) continue
    const entry = entries[key]
    const st = statusOf(key, entry, frame, mode)
    const color = tint(c.key, mode)
    const model = modelLabel(MODELS[key] ?? '')
    const task = entry?.status === 'running' && entry.task !== '' ? entry.task : ''
    const figures = statsLine(key, stats[key], top === key, columns, 3, mode)
    if (columns >= WIDE_PANE) {
      lines.push([
        { text: `${c.emoji} ` },
        { text: pad(c.name, 7), color, bold: true },
        { text: pad(c.role, 14), dim: true },
        { text: pad(model, 12), dim: true },
        { text: `${st.glyph} `, color: st.color },
        { text: pad(st.word, 12), ...(st.isIdle ? { dim: true } : {}) },
        ...(task === '' ? [] : [{ text: task, dim: true }]),
      ])
    } else if (columns >= MEDIUM) {
      lines.push([
        { text: `${c.emoji} ` },
        { text: c.name, color, bold: true },
        { text: ` · ${c.role} · ${model}`, dim: true },
      ])
      lines.push([
        { text: `   ${st.glyph} `, color: st.color },
        { text: st.word, ...(st.isIdle ? { dim: true } : {}) },
        ...(task === '' ? [] : [{ text: ` · ${task}`, dim: true }]),
      ])
    } else {
      lines.push([
        { text: `${c.emoji} ` },
        { text: c.name, color, bold: true },
        { text: ` ${st.glyph} `, color: st.color },
        { text: st.word, ...(st.isIdle ? { dim: true } : {}) },
      ])
    }
    if (figures !== undefined) lines.push(figures)
    const q = quoteLine(key, entry, 3)
    if (q !== undefined) lines.push(q)
  }
  return lines.map(l => clipLine(l, columns))
}

/** The roster as plain text (for a surface or a moment that cannot place the pane). */
export function rosterText(input: RosterInput): string {
  return rosterLines({ ...input, columns: Math.max(input.columns, WIDE_PANE) })
    .map(l => l.map(s => s.text).join('').trimEnd())
    .join('\n')
}

// --- mission report ----------------------------------------------------------------------------------------------

export type RecapInput = {
  persona: string | null
  stats: Readonly<Record<string, DojoCrewStats>>
  usage: DojoUsage | null
  /** Rank points; none when the rank toggle is off. */
  rank?: DojoRank
  columns: number
  mode?: PaletteMode
}

const SCROLL_CAP = 56

/** What a mission report is made of, before it is laid out. */
function recapFacts(input: Pick<RecapInput, 'persona' | 'stats' | 'usage'>) {
  const deployed = Object.keys(CREW).filter(k => (input.stats[k]?.runs ?? 0) > 0)
  const runs = deployed.reduce((n, k) => n + (input.stats[k]?.runs ?? 0), 0)
  const fell = deployed.reduce((n, k) => n + (input.stats[k]?.fell ?? 0), 0)
  const kind: 'empty' | 'rough' | 'clean' = deployed.length === 0 ? 'empty' : fell > 0 ? 'rough' : 'clean'
  const signoffs = (input.persona === null ? undefined : RECAP_SIGNOFFS[input.persona]) ?? (RECAP_SIGNOFFS.strategist as (typeof RECAP_SIGNOFFS)[string])
  return { deployed, runs, fell, kind, signoff: signoffs[kind] }
}

function usageFigures(usage: DojoUsage | null): string {
  if (usage === null || (usage.percent === null && usage.usd === null)) return 'context and cost: not measured yet'
  const ctx = usage.percent === null ? 'context —' : `context ${clampPercent(usage.percent)}%`
  return usage.usd === null ? ctx : `${ctx} · cost $${usage.usd.toFixed(2)}`
}

/** The mission report as lines, set between two scroll rolls; every line inside `columns`. */
export function recapLines(input: RecapInput): Line[] {
  const { persona, stats, columns } = input
  const mode = input.mode ?? 'dark'
  const theme = (persona === null ? undefined : STRATEGISTS[persona]) ?? NEUTRAL
  const color = tint(theme.key, mode)
  const facts = recapFacts(input)
  const span = Math.max(4, Math.min(columns, SCROLL_CAP))
  // the rolls frame the report in dim; only the title is bold
  const roll = (title: string): Line => {
    const left = title === '' ? '◖' : `◖═ ${title} `
    const fillOf = (n: number) => `${'═'.repeat(Math.max(1, n))}◗`
    if (title === '') return [{ text: `${left}${fillOf(span - cellWidth(left) - 1)}`, dim: true }]
    return [{ text: '◖═ ', dim: true }, { text: title, bold: true }, { text: ` ${fillOf(span - cellWidth(left) - 1)}`, dim: true }]
  }
  const lines: Line[] = [roll('📜 Mission report')]
  lines.push(
    persona === null || STRATEGISTS[persona] === undefined
      ? [{ text: 'No strategist on duty', dim: true }]
      : [{ text: `${theme.emoji} ${theme.name}`, color, bold: true }, { text: ' on duty', dim: true }],
  )

  if (facts.kind === 'empty') {
    lines.push([{ text: 'No crew deployed this session.', dim: true }])
  } else {
    lines.push([{ text: `Deployed: ${facts.deployed.length} of ${Object.keys(CREW).length} crew · ${facts.runs} ${facts.runs === 1 ? 'run' : 'runs'}` }])
    for (const key of facts.deployed) {
      const c = CREW[key]
      const st = stats[key]
      if (c === undefined || st === undefined) continue
      // the names share one column; a fall rides the same line as the figures, its glyph in the error color
      const head: Line = [{ text: `${c.emoji} ` }, { text: pad(c.name, NAME_CELLS), color: tint(c.key, mode), bold: true }, { text: ' ' }]
      const fell = st.fell > 0 ? ` fell ×${st.fell}` : ''
      const room = columns - (3 + NAME_CELLS + 1) - (fell === '' ? 0 : cellWidth(fell) + 2)
      const forms = statForms(st)
      const form = forms.find(f => cellWidth(f) <= room) ?? clip(forms[2], Math.max(1, room))
      lines.push([...head, { text: form, dim: true }, ...(fell === '' ? [] : [{ text: ' ✖', color: 'error' }, { text: fell }])])
      if (st.says !== undefined) lines.push([{ text: `   “${st.says}”`, italic: true }])
    }
  }

  lines.push([{ text: `Final ${usageFigures(input.usage)}`, dim: input.usage === null }])
  if (input.rank !== undefined) lines.push(rankLine(rankOf(input.rank.points, persona, input.rank.saved), persona, columns, mode))
  lines.push([{ text: `${theme.emoji} ` }, { text: `“${facts.signoff}”`, italic: true }])
  lines.push(roll(''))
  return lines.map(l => clipLine(l, columns))
}

/** The report as plain text. */
export function recapText(input: RecapInput): string {
  return recapLines({ ...input, columns: Math.max(input.columns, SCROLL_CAP) })
    .map(l => l.map(s => s.text).join('').trimEnd())
    .join('\n')
}

// --- gallery -----------------------------------------------------------------------------------------------------

export type GalleryInput = { index: number; columns: number; mode?: PaletteMode }

/** The theme of a gallery key: a strategist, the neutral one or a crew member. */
export function galleryTheme(key: string): Theme {
  return STRATEGISTS[key] ?? CREW[key] ?? NEUTRAL
}

/** Gallery page `index` wrapped into range, as a character key. */
export function galleryKey(index: number): string {
  const n = GALLERY_ORDER.length
  return GALLERY_ORDER[((Math.trunc(Number.isFinite(index) ? index : 0) % n) + n) % n] as string
}

const BORDERS: Record<string, readonly [string, string, string, string, string, string]> = {
  round: ['╭', '╮', '╰', '╯', '─', '│'],
  single: ['┌', '┐', '└', '┘', '─', '│'],
  double: ['╔', '╗', '╚', '╝', '═', '║'],
  bold: ['┏', '┓', '┗', '┛', '━', '┃'],
}

/** Words wrapped to `width` cells; a word longer than the width is cut. */
export function wrapWords(text: string, width: number): string[] {
  const out: string[] = []
  let cur = ''
  for (const word of text.split(/\s+/).filter(w => w !== '')) {
    const w = cellWidth(word) > width ? clip(word, width) : word
    if (cur === '') cur = w
    else if (cellWidth(cur) + 1 + cellWidth(w) <= width) cur += ` ${w}`
    else {
      out.push(cur)
      cur = w
    }
  }
  if (cur !== '') out.push(cur)
  return out
}

const LABEL = 9

/** A speech bubble around `text`, the tail beside its middle row; plain quoted text when there is no room for a frame. */
function bubble(key: string, text: string, columns: number, color: string): Line[] {
  const shape = BUBBLES[key] ?? { borderStyle: 'round', tail: '<' }
  const [tl, tr, bl, br, h, v] = BORDERS[shape.borderStyle] ?? (BORDERS.round as NonNullable<(typeof BORDERS)[string]>)
  const inner = Math.min(36, columns - LABEL - 4)
  const label = (s: string) => ({ text: pad(s, LABEL), dim: true })
  if (inner < 8) return [[label('Says'), { text: `“${text}”`, italic: true }]]
  const rows = wrapWords(text, inner)
  const width = Math.max(...rows.map(cellWidth))
  const mid = Math.floor(rows.length / 2)
  const out: Line[] = [[label('Says'), { text: `${tl}${h.repeat(width + 2)}${tr}`, color }]]
  rows.forEach((r, i) => {
    const prefix = i === mid ? shape.tail.padStart(LABEL) : ' '.repeat(LABEL)
    out.push([{ text: prefix, color }, { text: `${v} `, color }, { text: pad(r, width), italic: true }, { text: ` ${v}`, color }])
  })
  out.push([{ text: ' '.repeat(LABEL) + `${bl}${h.repeat(width + 2)}${br}`, color }])
  return out
}

/** The banner of `key` when it fits `columns`, as lines in the character's color. */
function bannerLines(key: string, columns: number, color: string): Line[] {
  const rows = BANNERS[key] ?? NEUTRAL_BANNER
  const width = Math.max(...rows.map(r => r.length))
  if (rows.length > BANNER_ROWS || width > BANNER_COLUMNS || width > columns) return []
  return rows.map(r => [{ text: r, color }])
}

/** How many of `items` fit on a line of `room` cells, joined by `sep`; the rest become `+N`. */
function listFit(items: readonly string[], room: number, sep: string): string {
  for (let n = items.length; n > 0; n--) {
    const shown = items.slice(0, n).join(sep)
    const text = n === items.length ? shown : `${shown}${sep}+${items.length - n}`
    if (cellWidth(text) <= room) return text
  }
  return `+${items.length}`
}

/** One page of the gallery: a character's banner, colors in both palettes, spinner words, lines and a Says bubble. */
export function galleryLines(input: GalleryInput): Line[] {
  const { columns } = input
  const mode = input.mode ?? 'dark'
  const total = GALLERY_ORDER.length
  const key = galleryKey(input.index)
  const theme = galleryTheme(key)
  const isCrew = CREW[key] !== undefined
  const color = tint(theme.key, mode)
  const room = Math.max(1, columns - LABEL)
  const label = (s: string): Seg => ({ text: pad(s, LABEL), dim: true })
  const row = (name: string, ...segs: Seg[]): Line => [label(name), ...segs]
  const said = (text: string): Seg => ({ text: `“${text}”`, italic: true })
  const lines: Line[] = []

  const pos = `${((GALLERY_ORDER as readonly string[]).indexOf(key) + 1)}/${total}`
  lines.push([
    { text: `${theme.emoji} ` },
    { text: theme.name, color, bold: true },
    { text: ` · ${theme.role}`, dim: true },
    { text: `  ${pos}`, dim: true },
  ])
  lines.push(...bannerLines(key, columns, color))
  lines.push([{ text: ' ' }])

  // colors: the primary and accent, as drawn in each palette
  for (const m of ['dark', 'light'] as const) {
    const primary = tint(theme.key, m)
    const accent = accentFor(theme.key, m)
    lines.push(
      row(
        m === 'dark' ? 'Colors' : '',
        { text: pad(m, 6) },
        { text: '██', color: primary },
        { text: ` ${primary} `, dim: true },
        { text: '██', color: accent },
        { text: ` ${accent}`, dim: true },
        ...(m === mode ? [{ text: ' ◂', dim: true }] : []),
      ),
    )
  }

  const words = WORDS[key] ?? WORDS.strategist
  const verbs = [...(words?.verbs ?? []), ...(VERBS_MORE[key] ?? [])]
  lines.push(row('Frames', { text: framesOf(key).join(' '), color }))
  lines.push(row('Verbs', { text: listFit(verbs, room, ' · ') }))

  if (isCrew) {
    const deploy = [words?.deploy ?? '', ...(DEPLOY_MORE[key] ?? [])].filter(l => l !== '')
    if (deploy[0] !== undefined) lines.push(row('Deploy', said(deploy[0])))
    const back = RETURN_LINES[key]?.[0]
    if (back !== undefined) lines.push(row('Return', said(back)))
    const fall = FALL_LINES[key]
    if (fall !== undefined) lines.push(row('Fallen', said(fall)))
  } else {
    lines.push(row('Turn end', { text: listFit([...(words?.done ?? []), ...(TURN_LONG[key] ?? [])], room, ' · ') }))
    lines.push(
      row(
        'Usage',
        { text: `${USAGE_LABELS.context} ` },
        { text: usageBar(58, USAGE_BAR.cells, key), color },
        { text: ' 58%' },
      ),
    )
    const ladder = RANK_LADDERS[key]
    if (ladder !== undefined) lines.push(row('Ranks', { text: listFit(ladder.map((n, i) => `${n} ${RANK_STEPS[i]}`), room, ' · ') }))
  }

  lines.push(...bubble(key, SAYS_SAMPLES[key] ?? '', columns, color))
  return lines.map(l => clipLine(l, columns))
}

/** The current gallery page as plain text. */
export function galleryText(input: GalleryInput): string {
  return galleryLines({ ...input, columns: Math.max(input.columns, 64) })
    .map(l => l.map(s => s.text).join('').trimEnd())
    .join('\n')
}
