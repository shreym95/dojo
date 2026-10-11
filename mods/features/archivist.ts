import { atom, read } from 'claude-code'

import { isOn } from '../lib/options'
import type { Installer } from '../lib/options'
import { isDojoType, strategistKey, strategistName } from '../lib/persona'
import { toastLine } from '../lib/toast'
import { voiceKey } from '../lib/voice'
import type { VoiceLevel } from '../voice.generated'

// The module scan reads an atom only from a const of the file that uses it; the {plugin, key} pair is the shared name.
const strategist = atom({ plugin: 'dojo', key: 'strategist' } as const, null)
const voice = atom({ plugin: 'dojo', key: 'voice' } as const, null)

const TERMINAL = new Set(['completed', 'failed', 'killed'])

export type RunningAgent = { id: string; type: string; description: string }

/** The directive appended to the compaction instructions. */
export function compactDirective(input: { strategist: string | null; voice: VoiceLevel | null; agents: readonly RunningAgent[] }): string {
  const name = strategistName(input.strategist)
  const lines = ['When summarizing, preserve verbatim:']
  lines.push(
    name === null
      ? '- the context line "dojo: on duty: <Name>" naming the strategist persona on duty, exactly as it appeared'
      : `- the context line "dojo: on duty: ${name}" (the strategist persona on duty)`,
  )
  lines.push(
    input.voice === null
      ? '- the active voice level: the roster default (no override is set)'
      : `- the active voice level override: "dojo: voice level: ${input.voice}"`,
  )
  lines.push(
    input.agents.length === 0
      ? '- every running dojo agent with its task (none are running now)'
      : `- every running dojo agent with its task:\n${input.agents.map(a => `  - ${a.type} (${a.id}): ${a.description}`).join('\n')}`,
  )
  lines.push('- every decision the user made, with the question it answered')
  return lines.join('\n')
}

export const installArchivist: Installer = (on, options) => {
  // The compaction summary keeps what a dojo session cannot afford to lose.
  on('session.compact', async ($, e, next) => {
    let out = e
    try {
      if (isOn(options, 'archivist') && e.agentId === undefined) {
        const key = (await read($, strategist)) ?? strategistKey(await $.env.get('DOJO_STRATEGIST'))
        if (key !== null) {
          const agents = (await $.agent.list())
            .filter(a => isDojoType(a.type) && !TERMINAL.has(a.status))
            .map(a => ({ id: a.id, type: a.type, description: a.description }))
          const level = voiceKey(await read($, voice))
          const directive = compactDirective({ strategist: key, voice: level, agents })
          const instructions = e.instructions === undefined || e.instructions.trim() === '' ? directive : `${e.instructions}\n\n${directive}`
          out = { ...e, instructions }
          if (e.trigger !== 'precompute') {
            try {
              $.ui.toast(toastLine('compact'))
            } catch {
              // a toast is never worth failing a hook
            }
          }
        }
      }
    } catch {
      out = e
    }
    return next(out)
  })
}
