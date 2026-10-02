import { CREW, NEUTRAL, STRATEGISTS } from './characters'
import type { Character } from './characters'

export const DOJO_PREFIX = 'dojo:'
const ON_DUTY = /dojo: on duty: ([A-Za-z]+)/

/** `dojo:levi` -> `levi`; anything that is not a dojo crew type -> null (the strategist is no crew). */
export function crewKey(type: string): string | null {
  if (!type.startsWith(DOJO_PREFIX)) return null
  const key = type.slice(DOJO_PREFIX.length)
  return Object.prototype.hasOwnProperty.call(CREW, key) ? key : null
}

export function isDojoType(type: string): boolean {
  return type.startsWith(DOJO_PREFIX)
}

/** Persona key from the SessionStart context line `dojo: on duty: <Name>`, or null. */
export function parseOnDuty(text: string): string | null {
  const name = ON_DUTY.exec(text)?.[1]?.toLowerCase()
  return name !== undefined && Object.prototype.hasOwnProperty.call(STRATEGISTS, name) ? name : null
}

export function strategistKey(raw: string | undefined | null): string | null {
  const key = (raw ?? '').trim().toLowerCase()
  return Object.prototype.hasOwnProperty.call(STRATEGISTS, key) ? key : null
}

export function strategistTheme(key: string | null, neutral: boolean): Character | null {
  if (key !== null) return STRATEGISTS[key] ?? null
  return neutral ? NEUTRAL : null
}

export function hash(text: string): number {
  let h = 0
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h
}

/** Rotates per turn; `salt` (an agent id) keeps concurrent agents from marching in step. */
export function pick<T>(pool: readonly T[], turn: number, salt = ''): T {
  return pool[(turn + hash(salt)) % pool.length] as T
}

export function truncate(text: string, max: number): string {
  const chars = [...text]
  if (max <= 0) return ''
  return chars.length <= max ? text : chars.slice(0, Math.max(0, max - 1)).join('') + '…'
}

/** `Bash: npm test` from a tool.call event's tool name and arguments. */
export function summarizeTool(tool: string, args: Record<string, unknown>): string {
  const preferred = ['command', 'file_path', 'path', 'pattern', 'url', 'query', 'description']
  const field = preferred.find(k => typeof args[k] === 'string')
  const value =
    field !== undefined
      ? (args[field] as string)
      : Object.values(args).find((v): v is string => typeof v === 'string')
  const short = tool.replace(/^mcp__/, '')
  return value === undefined ? short : `${short}: ${value.replace(/\s+/g, ' ').trim()}`
}

export type RowInput = { key: string; description: string; tool?: string; frame: number }

/** One band line, cut to `columns` cells. */
export function bandLine(row: RowInput, columns: number): string {
  const c = CREW[row.key]
  if (c === undefined) return ''
  const glyph = c.frames[row.frame % c.frames.length] ?? ''
  const head = `${c.emoji} ${c.name} ${glyph} ${row.description}`
  const line = row.tool === undefined ? head : `${head} · ${row.tool}`
  return truncate(line, columns)
}
