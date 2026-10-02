import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, Register } from 'claude-code'

import { CREW, FELL_EMOJI } from './characters'
import {
  bandLine,
  crewKey,
  isDojoType,
  parseOnDuty,
  pick,
  strategistKey,
  strategistTheme,
  summarizeTool,
} from './lib'
import type { FxBand, FxCrewRow } from '../types'

const strategist = atom({ plugin: 'dojo-fx', key: 'strategist' } as const, null)
const turn = atom({ plugin: 'dojo-fx', key: 'turn' } as const, 0)
const band = atom({ plugin: 'dojo-fx', key: 'band' } as const, { frame: 0, rows: [] } as FxBand)
const tools = atom({ plugin: 'dojo-fx', key: 'tools' } as const, {} as Record<string, string>)

const TICK_MS = 250
const TALK_DOORS = new Set(['prompt', 'response', 'tool-result'])
const TERMINAL = new Set(['completed', 'failed', 'killed'])

type Options = Readonly<Record<string, unknown>>

// Each feature is a toggle (userConfig). The model guard below has no toggle.
const isOn = (options: Options, name: string) => options[name] !== false

// Module variables die with a hot reload; everything a drawing reads lives in $.state.
const seen = new Map<string, string>()
let timer: { cancel: () => void } | undefined

async function mainTheme($: Engine, options: Options) {
  let key = (await read($, strategist)) ?? null
  if (key === null) {
    key = strategistKey(await $.env.get('DOJO_STRATEGIST'))
  }
  return strategistTheme(key, isOn(options, 'neutralMainTheme'))
}

async function scanForPersona($: Engine) {
  if ((await read($, strategist)) !== null) return
  try {
    const messages = await $.session.messages()
    if ('deny' in messages) return
    for (const m of messages.slice(0, 8)) {
      const found = parseOnDuty(m.text)
      if (found !== null) {
        await update($, strategist, () => found)
        return
      }
    }
  } catch {
    // no transcript to read: the env var or the neutral theme stands
  }
}

async function tick($: Engine, options: Options) {
  const crew = (await $.agent.list()).filter(a => crewKey(a.type) !== null)
  const rows: FxCrewRow[] = []
  for (const a of crew) {
    const key = crewKey(a.type)
    if (key === null) continue
    const c = CREW[key]
    if (c === undefined) continue
    const before = seen.get(a.id)
    seen.set(a.id, a.status)
    if (TERMINAL.has(a.status)) {
      if (before !== undefined && !TERMINAL.has(before) && isOn(options, 'toasts')) {
        $.ui.toast(a.status === 'completed' ? `${c.emoji} ${c.name} returned` : `${FELL_EMOJI} ${c.name} fell`)
      }
    } else {
      rows.push({ id: a.id, key, description: a.description })
    }
  }
  if (rows.length === 0) {
    timer?.cancel()
    timer = undefined
  }
  if (!isOn(options, 'band')) return
  await update($, band, b =>
    rows.length === 0 && b.rows.length === 0 ? b : { frame: rows.length === 0 ? 0 : b.frame + 1, rows },
  )
}

function ensureTick($: Engine, options: Options) {
  if (timer !== undefined || !(isOn(options, 'band') || isOn(options, 'toasts'))) return
  timer = $.clock.every(TICK_MS, () => {
    tick($, options).catch(() => {})
  })
}

export const register: Register = (on, options) => {
  // Model guard: ships regardless of the visual toggles. A caller's "always pass model: sonnet"
  // must not override a dojo agent's own frontmatter model; undefined lets the agent decide.
  on('agent.spawn', async ($, e, next) => {
    if (!isDojoType(e.subagentType)) return next(e)
    const ran = await next(e.model === undefined ? e : { ...e, model: undefined })

    const key = crewKey(e.subagentType)
    if (ran.deny === undefined && ran.agentId !== undefined && key !== null) {
      seen.set(ran.agentId, 'running')
      const c = CREW[key]
      if (c !== undefined && isOn(options, 'toasts')) {
        $.ui.toast(`${c.emoji} ${c.name} deployed — "${c.deploy}"`)
      }
      ensureTick($, options)
      if (isOn(options, 'band')) {
        const id = ran.agentId
        await update($, band, b => ({
          ...b,
          rows: [...b.rows.filter(r => r.id !== id), { id, key, description: e.description }],
        }))
      }
    }
    return ran
  })

  // Persona detection: the dojo SessionStart hook injects `dojo: on duty: <Name>` as context.
  // Read it off the appended row (any door but the conversation's own talk), and once per
  // prompt fall back to scanning the transcript until it is found.
  on('session.append', async ($, e, next) => {
    if (e.agentId === undefined && !TALK_DOORS.has(e.door)) {
      for (const block of e.message.content) {
        const found = block.type === 'text' && typeof block.text === 'string' ? parseOnDuty(block.text) : null
        if (found !== null) await update($, strategist, () => found)
      }
    }
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    await update($, turn, n => n + 1)
    await scanForPersona($)
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (e.agentId !== undefined && isOn(options, 'band')) {
      const id = e.agentId
      const line = summarizeTool(String(e.tool), e as unknown as Record<string, unknown>)
      await update($, tools, t => ({ ...t, [id]: line }))
      ensureTick($, options)
    }
    return next(e)
  })

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    if (!isOn(options, 'spinners')) return next(e)
    const n = (await read($, turn)) ?? 0
    const agent = (await $.agent.list()).find(a => a.id === e.requestId)
    const key = agent === undefined ? null : crewKey(agent.type)
    const crew = key === null ? undefined : CREW[key]
    if (crew !== undefined) {
      return next({ ...e, props: { ...e.props, word: `${crew.emoji} ${pick(crew.verbs, n, e.requestId)}` } })
    }
    if (agent !== undefined) return next(e) // some other subagent: leave it alone
    const theme = await mainTheme($, options)
    if (theme === null) return next(e)
    return next({ ...e, props: { ...e.props, word: `${theme.emoji} ${pick(theme.verbs, n)}` } })
  })

  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    if (!isOn(options, 'turnFlair')) return next(e)
    const theme = await mainTheme($, options)
    if (theme?.done === undefined) return next(e)
    const n = (await read($, turn)) ?? 0
    return next({ ...e, props: { ...e.props, word: pick(theme.done, n, String(e.props.durationMs)) } })
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!isOn(options, 'band') || e.props.hasSurvey) return next(e)
    const { frame, rows } = await read($, band)
    if (rows.length === 0) return next(e)

    const latest = await read($, tools)
    const { Box, Text } = $.ui.resolve(e)
    const shown = rows.slice(0, Math.max(1, e.props.maxRows))
    return (
      <Box flexDirection="column">
        {shown.map(r => (
          <Text key={r.id} wrap="truncate-end">
            {bandLine({ key: r.key, description: r.description, tool: latest[r.id], frame }, e.props.bodyColumns)}
          </Text>
        ))}
      </Box>
    )
  })
}
