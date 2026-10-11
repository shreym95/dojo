import { VOICE_RULES } from '../voice.generated'
import type { VoiceLevel } from '../voice.generated'

export const VOICE_LEVELS = Object.keys(VOICE_RULES) as VoiceLevel[]

export function voiceKey(raw: string | undefined | null): VoiceLevel | null {
  const key = (raw ?? '').trim().toLowerCase()
  return (VOICE_LEVELS as string[]).includes(key) ? (key as VoiceLevel) : null
}

/** Appended to a dojo agent's spawn prompt while an override is set. */
export function voiceOverrideBlock(level: VoiceLevel): string {
  return `## Voice level override\nThe user set the voice level to "${level}" for this session. It replaces the voice level in your instructions; follow these rules instead.\n\n${VOICE_RULES[level]}`
}

/** The context entry /dojo-voice leaves the main model. */
export function voiceContext(level: VoiceLevel): string {
  return `dojo: voice level: ${level}\n${VOICE_RULES[level]}`
}

export const VOICE_CLEAR_WORDS = ['default', 'reset', 'off']
