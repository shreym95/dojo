import { CREW, NEUTRAL, STRATEGISTS, WORDS } from '../theme'
import { hash, pick, truncate } from '../lib/text'
import type { DojoRosterEntry, DojoUsage } from '../state'
import {
  BAND_HEADER,
  DEFAULT_VOICE,
  FALL_LINES,
  FRAMES_MORE,
  HINTS,
  LONG_TURN_MS,
  MODELS,
  MODE_LABELS,
  TURN_LONG,
  USAGE_BAR,
  USAGE_HOT_AT,
  USAGE_HOT_LINES,
  USAGE_LABELS,
  USAGE_WARN_AT,
  VERBS_MORE,
  WINDOW_LABELS,
} from './chrome-art'

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

const channel = (v: number) => {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}

/** The hex lightened toward white until it holds 4.5:1 against a black terminal; light colors come back as given. */
export function legible(hex: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex
  const n = parseInt(hex.slice(1), 16)
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const mixed = rgb.map(c => Math.round(c + (255 - c) * t))
    const out = '#' + mixed.map(c => c.toString(16).padStart(2, '0')).join('').toUpperCase()
    if (luminance(out) >= 0.18) return out
  }
  return '#FFFFFF'
}

// --- wording -----------------------------------------------------------------------------------------------------

const words = (key: string) => WORDS[key] ?? WORDS.strategist

/** Band and spinner frames of a character: the base four, then the extra ones. */
export function framesOf(key: string): readonly string[] {
  const w = words(key)
  return [...(w?.frames ?? ['◐']), ...(FRAMES_MORE[key] ?? [])]
}

/** The spinner verb for a turn: the first one is the base pick; `step` walks on through the base then the extra verbs. */
export function verbAt(key: string, turn: number, salt: string, step: number): string {
  const base = words(key)?.verbs ?? []
  if (base.length === 0) return ''
  const seq = [...base, ...(VERBS_MORE[key] ?? [])]
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

/** The deploy toast line for the n-th deploy of a character (1-based): WORDS first, then the extra lines. */
export function deployLine(key: string, nth: number, more: readonly string[]): string {
  const pool = [words(key)?.deploy ?? '', ...more].filter(l => l !== '')
  return pool.length === 0 ? '' : (pool[(Math.max(1, nth) - 1) % pool.length] as string)
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

/** `claude-sonnet-5-5` -> `sonnet 5.5`; anything else as given. */
export function modelLabel(id: string): string {
  const m = /^claude-([a-z]+)-(\d+)-(\d+)/.exec(id)
  return m === null ? id : `${m[1]} ${m[2]}.${m[3]}`
}

// --- prompt chrome -----------------------------------------------------------------------------------------------

/** Dim text after the prompt hint, in the on-duty strategist's voice; undefined when there is no persona to speak. */
export function hintTail(persona: string | null, turn: number, isWorking: boolean, isDraft: boolean): string | undefined {
  const t = persona === null ? undefined : STRATEGISTS[persona]
  const pools = persona === null ? undefined : HINTS[persona]
  if (t === undefined || pools === undefined) return undefined
  const pool = isWorking ? pools.working : isDraft ? pools.draft : pools.idle
  return `· ${t.emoji} ${pick(pool, turn)}`
}

/** Footer modes, each known one with a themed label beside its own name, then the strategist's badge. Real names stay. */
export function themedModes(persona: string | null, modes: readonly string[]): string[] {
  const t = persona === null ? undefined : STRATEGISTS[persona]
  if (persona === null || t === undefined) return [...modes]
  const labels = MODE_LABELS[persona] ?? []
  const themed = modes.map(mode => {
    const hit = labels.find(l => l.match.test(mode))
    return hit === undefined ? mode : `${mode} · ${t.emoji} ${hit.label}`
  })
  return [...themed, `${t.emoji} ${t.name}`]
}

// --- crew band ---------------------------------------------------------------------------------------------------

export type BandRow = { key: string; description: string; tool?: string }

const fill = (template: string, n: number) => template.replace('{n}', String(n))

function headerText(persona: string, n: number, columns: number): string {
  const t = STRATEGISTS[persona]
  const h = BAND_HEADER[persona]
  if (t === undefined || h === undefined) return ''
  for (const text of [`${t.emoji} ${fill(h.full, n)}`, `${t.emoji} ${fill(h.compact, n)}`]) {
    if (cellWidth(text) <= columns) return text
  }
  return clip(`${t.emoji} ${n}`, columns)
}

/**
 * The band as lines: a strategist header when a persona is on duty, then one line per running crew member in their
 * color. Never more than `maxRows` lines and never wider than `columns`; overflow becomes one dim `+N more` line,
 * and a band of a single row is one summary line.
 */
export function planBand(input: { persona: string | null; rows: readonly BandRow[]; frame: number; columns: number; maxRows: number }): Line[] {
  const { persona, rows, frame, columns } = input
  const maxRows = Math.max(1, input.maxRows)
  const theme = persona === null ? undefined : STRATEGISTS[persona]
  const row = (r: BandRow): Line => {
    const c = CREW[r.key]
    // one cell less than the width: the emoji at the start is two cells to the code point's one
    const text = bandLine({ key: r.key, description: r.description, tool: r.tool, frame }, Math.max(1, columns - 1))
    return [{ text, ...(c === undefined ? {} : { color: legible(c.color) }) }]
  }
  const header = (): Line => {
    const frames = framesOf(theme?.key ?? 'strategist')
    const glyph = frames[frame % frames.length] ?? ''
    const base = headerText(persona as string, rows.length, columns - 2)
    return clipLine([{ text: `${base} ${glyph}`, color: legible(theme?.color ?? '#94A3B8'), bold: true }], columns)
  }
  const head = theme === undefined || persona === null ? [] : [header()]
  if (head.length + rows.length <= maxRows) return [...head, ...rows.map(row)]
  if (maxRows === 1) {
    const emojis = rows.map(r => CREW[r.key]?.emoji ?? '').join(' ')
    const lead = theme === undefined ? '' : `${theme.emoji} `
    return [clipLine([{ text: `${lead}${rows.length} out ${emojis}`, color: legible(theme?.color ?? '#94A3B8'), bold: true }], columns)]
  }
  const room = maxRows - head.length - 1
  const hidden = rows.length - room
  return [...head, ...rows.slice(0, room).map(row), [{ text: `+${hidden} more`, dim: true }]]
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

/** `▰▰▰▱▱▱▱▱▱▱`: the bar filled up to the next whole cell. */
export function usageBar(percent: number, cells: number): string {
  const filled = Math.min(cells, Math.max(0, Math.ceil((clampPercent(percent) * cells) / 100)))
  return USAGE_BAR.full.repeat(filled) + USAGE_BAR.empty.repeat(cells - filled)
}

/** The color of a figure: the strategist's below the warning mark, then the theme's warning and error colors. */
export function usageColor(percent: number, base: string): string {
  const p = clampPercent(percent)
  return p >= USAGE_HOT_AT ? 'error' : p >= USAGE_WARN_AT ? 'warning' : base
}

/**
 * The one usage row as a line, or none when no figure is known. Wide terminals get the full row, dropping the persona
 * warning, then the cost, when they do not fit; under 50 columns it is the compact form. Never wider than `columns`.
 */
export function planUsage(input: { persona: string | null; usage: DojoUsage; columns: number }): Line | undefined {
  const { usage, columns } = input
  if (usage.percent === null && usage.limit === null && usage.usd === null) return undefined
  const theme = (input.persona === null ? undefined : STRATEGISTS[input.persona]) ?? NEUTRAL
  const base = legible(theme.color)
  const lead: Seg = { text: `${theme.emoji} ` }
  const sep: Seg = { text: ' · ', dim: true }
  const room = Math.max(1, columns - 1)
  const ctx = usage.percent === null ? undefined : clampPercent(usage.percent)
  const sta = usage.limit === null ? undefined : clampPercent(usage.limit.percent)
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
        : [{ text: `${USAGE_LABELS.context} ` }, figure(ctx, usageBar(ctx, USAGE_BAR.cells)), figure(ctx, ` ${ctx}%`)],
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
    parts.push(ctx === undefined ? [{ text: '—' }] : [figure(ctx, usageBar(ctx, USAGE_BAR.compactCells)), figure(ctx, ` ${ctx}%`)])
    if (sta !== undefined) parts.push([figure(sta, `${sta}%`)])
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
}

const MEDIUM = 36
const WIDE_PANE = 64

function statusOf(key: string, entry: RosterEntry | undefined, frame: number): { glyph: string; color: string; word: string } {
  const c = CREW[key]
  switch (entry?.status) {
    case 'running': {
      const frames = framesOf(key)
      return { glyph: frames[frame % frames.length] ?? '●', color: legible(c?.color ?? '#94A3B8'), word: 'running' }
    }
    case 'returned':
      return { glyph: '✔', color: 'success', word: entry.count > 1 ? `returned ×${entry.count}` : 'returned' }
    case 'fell':
      return { glyph: '✖', color: 'error', word: entry.count > 1 ? `fell ×${entry.count}` : 'fell' }
    default:
      return { glyph: '○', color: 'inactive', word: 'idle' }
  }
}

function quoteLine(key: string, entry: RosterEntry | undefined, indent: number): Line | undefined {
  const c = CREW[key]
  const text = entry?.says !== undefined ? `“${entry.says}”` : entry?.status === 'fell' ? (FALL_LINES[key] ?? '') : ''
  if (text === '' || c === undefined) return undefined
  return [{ text: ' '.repeat(indent) + text, color: legible(c.color), italic: true, dim: entry?.says === undefined }]
}

/** The /dojo pane as lines: who is on duty and at what voice level, a tally, then every crew member. */
export function rosterLines(input: RosterInput): Line[] {
  const { persona, entries, frame, columns } = input
  const t = persona === null ? undefined : STRATEGISTS[persona]
  const lines: Line[] = []

  lines.push(
    t === undefined
      ? [{ text: 'No strategist on duty', dim: true }]
      : [{ text: `${t.emoji} ${t.name} on duty`, color: legible(t.color), bold: true }],
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
  lines.push([{ text: '─'.repeat(Math.max(1, Math.min(columns, 48))), dim: true }])

  for (const key of keys) {
    const c = CREW[key]
    if (c === undefined) continue
    const entry = entries[key]
    const st = statusOf(key, entry, frame)
    const color = legible(c.color)
    const model = modelLabel(MODELS[key] ?? '')
    const task = entry?.status === 'running' && entry.task !== '' ? entry.task : ''
    if (columns >= WIDE_PANE) {
      lines.push([
        { text: `${c.emoji} ` },
        { text: pad(c.name, 7), color, bold: true },
        { text: pad(c.role, 14), dim: true },
        { text: pad(model, 12), dim: true },
        { text: `${st.glyph} `, color: st.color },
        { text: pad(st.word, 12), color: st.color },
        ...(task === '' ? [] : [{ text: task, dim: true }]),
      ])
      const q = quoteLine(key, entry, 3)
      if (q !== undefined) lines.push(q)
    } else if (columns >= MEDIUM) {
      lines.push([
        { text: `${c.emoji} ` },
        { text: c.name, color, bold: true },
        { text: ` · ${c.role} · ${model}`, dim: true },
      ])
      lines.push([
        { text: `   ${st.glyph} `, color: st.color },
        { text: st.word, color: st.color },
        ...(task === '' ? [] : [{ text: ` · ${task}`, dim: true }]),
      ])
      const q = quoteLine(key, entry, 3)
      if (q !== undefined) lines.push(q)
    } else {
      lines.push([
        { text: `${c.emoji} ` },
        { text: c.name, color, bold: true },
        { text: ` ${st.glyph} `, color: st.color },
        { text: st.word, color: st.color },
      ])
      const q = quoteLine(key, entry, 3)
      if (q !== undefined) lines.push(q)
    }
  }
  return lines.map(l => clipLine(l, columns))
}

/** The roster as plain text (for a surface or a moment that cannot place the pane). */
export function rosterText(input: RosterInput): string {
  return rosterLines({ ...input, columns: Math.max(input.columns, WIDE_PANE) })
    .map(l => l.map(s => s.text).join('').trimEnd())
    .join('\n')
}
