import { atom, read, update } from 'claude-code'

import type { Installer } from '../lib/options'
import { isDojoType, strategistKey, strategistName } from '../lib/persona'
import { VOICE_CLEAR_WORDS, VOICE_LEVELS, voiceContext, voiceKey, voiceOverrideBlock } from '../lib/voice'
import { STRATEGISTS } from '../theme'

// The module scan reads an atom only from a const of the file that uses it; the {plugin, key} pair is the shared name.
const strategist = atom({ plugin: 'dojo', key: 'strategist' } as const, null)
const chosen = atom({ plugin: 'dojo', key: 'chosen' } as const, null)
const voice = atom({ plugin: 'dojo', key: 'voice' } as const, null)

const COMMANDS = [
  { name: 'dojo-duty', description: 'Show or switch the strategist persona on duty', argumentHint: '[shikamaru|lelouch]' },
  { name: 'dojo-voice', description: 'Show or set the dojo voice level for this session', argumentHint: '[subtle|medium|full|default]' },
] as const

const argsOf = (args: unknown) => (typeof args === 'string' ? args : '')

export const installCommands: Installer = on => {
  // Voice override: dojo crew spawned while /dojo-voice is set carry that level's rules.
  on('agent.spawn', { subagentType: /^dojo:/ }, async ($, e, next) => {
    let out = e
    try {
      const level = voiceKey(await read($, voice))
      if (level !== null && isDojoType(e.subagentType) && e.subagentType !== 'dojo:strategist') {
        out = { ...e, prompt: `${e.prompt}\n\n${voiceOverrideBlock(level)}` }
      }
    } catch {
      out = e
    }
    return next(out)
  })

  // Slash commands can only be registered once the session binds.
  on('session.start', async ($, e, next) => {
    for (const spec of COMMANDS) {
      try {
        await $.command.register(spec)
      } catch {
        // a name taken or refused: the others still register
      }
    }
    return next(e)
  })

  on('command.run', { command: 'dojo-duty' }, async ($, e, next) => {
    try {
      const arg = argsOf(e.args).trim()
      const current = (await read($, strategist)) ?? strategistKey(await $.env.get('DOJO_STRATEGIST'))
      if (arg === '') {
        const name = strategistName(current)
        return { text: name === null ? `No strategist on duty. Valid names: ${Object.keys(STRATEGISTS).join(', ')}.` : `On duty: ${name}` }
      }
      const key = strategistKey(arg)
      if (key === null) return { text: `Unknown strategist "${arg}". Valid names: ${Object.keys(STRATEGISTS).join(', ')}.` }
      // the choice is the persona on duty now, and the one every later automatic on-duty line must yield to
      await update($, strategist, () => key)
      await update($, chosen, () => key)
      const name = strategistName(key) as string
      return { text: `On duty: ${name}`, context: [`dojo: on duty: ${name}`] }
    } catch {
      return next(e)
    }
  })

  on('command.run', { command: 'dojo-voice' }, async ($, e, next) => {
    try {
      const arg = argsOf(e.args).trim().toLowerCase()
      if (arg === '') {
        const level = voiceKey(await read($, voice))
        return { text: `Voice level override: ${level ?? 'none (roster default)'}` }
      }
      if (VOICE_CLEAR_WORDS.includes(arg)) {
        await update($, voice, () => null)
        return { text: 'Voice level override cleared (roster default).', context: ['dojo: voice level: default'] }
      }
      const level = voiceKey(arg)
      if (level === null) {
        return { text: `Unknown voice level "${arg}". Valid levels: ${VOICE_LEVELS.join(', ')}, or default to clear.` }
      }
      await update($, voice, () => level)
      return { text: `Voice level override: ${level} (the strategist and dojo agents spawned from now on).`, context: [voiceContext(level)] }
    } catch {
      return next(e)
    }
  })
}
