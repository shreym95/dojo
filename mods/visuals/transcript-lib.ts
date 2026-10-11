import { BANNERS, BANNER_COLUMNS, BANNER_ROWS, NEUTRAL_BANNER } from './transcript-art'
import { crewKey } from '../lib/persona'
import { hash } from '../lib/text'

// Pure helpers for visuals/transcript.tsx: no `$`, no engine. Everything here is plain data in, plain data out.

/** Below this many columns a drawing drops banners and falls back to one compact line. */
export const WIDE = 60
/** Used when the surface has not measured. */
export const DEFAULT_COLUMNS = 80
/** Entries kept in the call-lane atoms; the oldest go first. */
export const LANE_CAP = 300

/** Display cells of `text`: wide glyphs and emoji count two. An estimate, kept on the safe side. */
export function cells(text: string): number {
  let n = 0
  let last = 0
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0
    if (cp === 0xfe0f) {
      if (last === 1) n += 1
      last = 0
      continue
    }
    if (cp === 0x200d || (cp >= 0x300 && cp <= 0x36f)) continue
    const wide =
      (cp >= 0x1f000 && cp <= 0x1faff) ||
      (cp >= 0x1100 && cp <= 0x115f) ||
      (cp >= 0x2e80 && cp <= 0xa4cf) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe30 && cp <= 0xfe6f) ||
      (cp >= 0xff00 && cp <= 0xff60)
    last = wide ? 2 : 1
    n += last
  }
  return n
}

/** `text` cut to at most `max` display cells, ending in an ellipsis when it was cut. Decoration only. */
export function clip(text: string, max: number): string {
  if (max <= 0) return ''
  if (cells(text) <= max) return text
  let out = ''
  for (const ch of text) {
    if (cells(out + ch) > max - 1) break
    out += ch
  }
  return `${out}…`
}

export const columnsOf = (viewport: { columns: number } | undefined): number => {
  const n = viewport?.columns
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_COLUMNS
}

/** One entry of a rotating pool, steady for one salt (a call id). */
export function line(pool: readonly string[] | undefined, salt: string): string {
  if (pool === undefined || pool.length === 0) return ''
  return pool[hash(salt) % pool.length] as string
}

/** A header rule of the right length: fills what is left of `columns` after `used`, never more than `cap`. */
export function rule(glyph: string, columns: number, used: number, cap = 28): string {
  const n = Math.min(cap, columns - used - 2)
  return n > 1 ? glyph.repeat(n) : ''
}

/** The banner rows of character `key`, or the neutral banner; empty when nothing fits `columns`. */
export function bannerRows(key: string, columns: number): readonly string[] {
  const rows = BANNERS[key] ?? NEUTRAL_BANNER
  const width = Math.max(...rows.map(r => r.length))
  return rows.length > BANNER_ROWS || width > BANNER_COLUMNS || width > columns ? [] : rows
}

const SAYS = /^[ \t>*_`-]*Says:[ \t]*(.+?)[ \t]*$/gim
const QUOTES = /^["'“”‘’`]+|["'“”‘’`]+$/g

/** The text of the last `Says:` line of `text` with its quotes stripped, or null. */
export function extractSays(text: string): string | null {
  let found: string | null = null
  for (const m of text.matchAll(SAYS)) {
    const said = (m[1] ?? '').replace(QUOTES, '').trim()
    if (said !== '') found = said
  }
  return found
}

export type AgentFacts = {
  text: string
  status: string | null
  agentId: string | null
  agentType: string | null
  durationMs: number | null
  tools: number | null
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** What an Agent tool result says about the run: its text, status, ids and totals. Any shape is tolerated. */
export function agentFacts(output: unknown): AgentFacts {
  if (typeof output === 'string') return { text: output, status: null, agentId: null, agentType: null, durationMs: null, tools: null }
  if (!isRecord(output)) return { text: '', status: null, agentId: null, agentType: null, durationMs: null, tools: null }
  const parts: string[] = []
  if (Array.isArray(output.content)) {
    for (const block of output.content) if (isRecord(block) && typeof block.text === 'string') parts.push(block.text)
  }
  if (isRecord(output.handbackReport) && typeof output.handbackReport.text === 'string') parts.push(output.handbackReport.text)
  return {
    text: parts.join('\n'),
    status: str(output.status),
    agentId: str(output.agentId),
    agentType: str(output.agentType),
    durationMs: num(output.totalDurationMs),
    tools: num(output.totalToolUseCount),
  }
}

/** The crew key an Agent call's input names (`dojo:levi` -> `levi`), or null for any other call. */
export function crewOfInput(input: unknown): string | null {
  return isRecord(input) && typeof input.subagent_type === 'string' ? crewKey(input.subagent_type) : null
}

export const descriptionOf = (input: unknown): string => (isRecord(input) && typeof input.description === 'string' ? input.description : '')

export function duration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)}s`
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`
}

/** `7 tools · 12.3s` from what is known; empty when nothing is. */
export function statsLine(facts: Pick<AgentFacts, 'durationMs' | 'tools'>): string {
  const parts: string[] = []
  if (facts.tools !== null) parts.push(`${facts.tools} ${facts.tools === 1 ? 'tool' : 'tools'}`)
  if (facts.durationMs !== null) parts.push(duration(facts.durationMs))
  return parts.join(' · ')
}

export const FALLEN_STATUSES: ReadonlySet<string> = new Set(['failed', 'killed', 'error', 'errored', 'cancelled', 'canceled'])

/** The lane table with `id` set to `value`, capped at LANE_CAP entries (oldest dropped). */
export function remember(table: Record<string, string>, id: string, value: string): Record<string, string> {
  if (table[id] === value) return table
  const next: Record<string, string> = { ...table }
  delete next[id]
  next[id] = value
  const ids = Object.keys(next)
  for (const old of ids.slice(0, Math.max(0, ids.length - LANE_CAP))) delete next[old]
  return next
}

/** The strategist key a `On duty: <Name>` output names, or null. */
export function dutyNameOf(text: string, known: readonly string[]): string | null {
  const m = /On duty:\s*([A-Za-z]+)/.exec(text)
  const name = m?.[1]?.toLowerCase()
  return name !== undefined && known.includes(name) ? name : null
}

/** `dojo-duty` or `dojo-voice` from a command name that may carry a plugin prefix, else null. */
export function dojoCommand(name: string): 'dojo-duty' | 'dojo-voice' | null {
  const m = /(?:^|:)(dojo-duty|dojo-voice)$/.exec(name)
  return m === null ? null : (m[1] as 'dojo-duty' | 'dojo-voice')
}
