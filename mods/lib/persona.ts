import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine } from 'claude-code'

import type { Installer } from './options'
import { CREW, STRATEGISTS } from '../theme'

// The one copy of strategist detection. Every feature that needs to know who is on duty reads it here.

export const DOJO_PREFIX = 'dojo:'
const ON_DUTY = /dojo: on duty: ([A-Za-z]+)/g

/** The strategist persona key (`shikamaru`, `lelouch`) read off the session, or null. */
export const strategist = atom({ plugin: 'dojo', key: 'strategist' } as const, null)
/** The persona a /dojo-duty command picked; it outranks every automatic on-duty line after it. */
export const chosen = atom({ plugin: 'dojo', key: 'chosen' } as const, null)
/** Prompts submitted so far; rotates the verb pools and bounds the transcript scan. */
export const turn = atom({ plugin: 'dojo', key: 'turn' } as const, 0)

const TALK_DOORS = new Set(['prompt', 'response', 'tool-result'])
// The transcript fallback only looks during the first prompts: later it would cost a read per prompt.
const SCAN_PROMPTS = 3

const has = (table: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(table, key)

/** `dojo:levi` -> `levi`; anything that is not a dojo crew type -> null (the strategist is no crew). */
export function crewKey(type: string): string | null {
  if (!type.startsWith(DOJO_PREFIX)) return null
  const key = type.slice(DOJO_PREFIX.length)
  return has(CREW, key) ? key : null
}

export function isDojoType(type: string): boolean {
  return type.startsWith(DOJO_PREFIX)
}

/** Persona key from the context line `dojo: on duty: <Name>` (the last one in the text), or null. */
export function parseOnDuty(text: string): string | null {
  let found: string | null = null
  for (const m of text.matchAll(ON_DUTY)) {
    const name = m[1]?.toLowerCase()
    if (name !== undefined && has(STRATEGISTS, name)) found = name
  }
  return found
}

export function strategistKey(raw: string | undefined | null): string | null {
  const key = (raw ?? '').trim().toLowerCase()
  return has(STRATEGISTS, key) ? key : null
}

export function strategistName(key: string | null): string | null {
  return key === null ? null : (STRATEGISTS[key]?.name ?? null)
}

/** Every known `dojo: on duty: <Name>` line in `text` renamed to the persona `key`. */
export function reassertOnDuty(text: string, key: string): string {
  const name = STRATEGISTS[key]?.name
  if (name === undefined) return text
  return text.replace(ON_DUTY, (line, found: string) => (has(STRATEGISTS, found.toLowerCase()) ? `dojo: on duty: ${name}` : line))
}

async function scanForPersona($: Engine) {
  if ((await read($, strategist)) !== null || (await read($, turn)) > SCAN_PROMPTS) return
  try {
    const messages = await $.session.messages()
    if ('deny' in messages) return
    for (const m of [...messages].reverse()) {
      const found = m.role === 'user' ? parseOnDuty(m.text) : null
      if (found !== null) {
        await update($, strategist, () => found)
        return
      }
    }
  } catch {
    // no transcript to read: the env var or no dojo session stands
  }
}

export const installPersona: Installer = on => {
  // The dojo SessionStart hook (and /dojo-duty) inject `dojo: on duty: <Name>` as context. The most recent
  // line wins, so every appended row updates the persona, except that a /dojo-duty choice outranks the hook:
  // SessionStart fires again on resume and compact and would announce the original persona over the switch,
  // so such a line is rewritten to the chosen persona before the model reads it.
  on('session.append', async ($, e, next) => {
    let out = e
    try {
      if (e.agentId === undefined && !TALK_DOORS.has(e.door)) {
        const picked = (await read($, chosen)) ?? null
        const content = e.message.content.map(block => {
          if (block.type !== 'text' || typeof block.text !== 'string') return block
          const text = picked === null ? block.text : reassertOnDuty(block.text, picked)
          return text === block.text ? block : { ...block, text }
        })
        for (const block of content) {
          const found = block.type === 'text' && typeof block.text === 'string' ? parseOnDuty(block.text) : null
          if (found !== null) await update($, strategist, () => found)
        }
        if (content.some((block, i) => block !== e.message.content[i])) out = { ...e, message: { ...e.message, content } }
      }
    } catch {
      out = e
    }
    return next(out)
  })

  // A new prompt is a new turn.
  on('prompt.submit', async ($, e, next) => {
    try {
      await update($, turn, n => n + 1)
      await scanForPersona($)
    } catch {
      // bookkeeping only
    }
    return next(e)
  })
}
