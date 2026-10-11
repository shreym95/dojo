import { atom, read, update } from 'claude-code'
import type { ElementConstructor, EngineInterface as Engine, RenderElement, TextProps } from 'claude-code'

import { isOn } from '../lib/options'
import type { Installer, Options } from '../lib/options'
import { crewKey, strategistKey } from '../lib/persona'
import { summarizeTool } from '../lib/text'
import { CREW, FELL_EMOJI, NEUTRAL, STRATEGISTS, WORDS } from '../theme'
import type { Theme, Words } from '../theme'
import type { DojoBand, DojoCrewRow, DojoRosterEntry, DojoUsage } from '../state'
import { CUE_GAP_MS, DEPLOY_MORE, SOUNDS } from './chrome-art'
import type { Cue } from './chrome-art'
import {
  deployLine,
  framesOf,
  hintTail,
  parseSays,
  planBand,
  planUsage,
  rosterLines,
  rosterText,
  snapshotUsage,
  themedModes,
  turnWord,
  verbAt,
} from './chrome-lib'
import type { Line, Seg } from './chrome-lib'

export { bandLine } from './chrome-lib'
export type { RowInput } from './chrome-lib'

// The module scan reads an atom only from a const of the file that uses it; the {plugin, key} pair is the shared name.
const strategist = atom({ plugin: 'dojo', key: 'strategist' } as const, null)
const turn = atom({ plugin: 'dojo', key: 'turn' } as const, 0)
const voice = atom({ plugin: 'dojo', key: 'voice' } as const, null)
const band = atom({ plugin: 'dojo', key: 'band' } as const, { frame: 0, rows: [] } as DojoBand)
const tools = atom({ plugin: 'dojo', key: 'tools' } as const, {} as Record<string, string>)
const roster = atom({ plugin: 'dojo', key: 'roster' } as const, {} as Record<string, DojoRosterEntry>)
const pulse = atom({ plugin: 'dojo', key: 'pulse' } as const, 0)
const cueAt = atom({ plugin: 'dojo', key: 'cueAt' } as const, null as number | null)
const usage = atom({ plugin: 'dojo', key: 'usage' } as const, null as DojoUsage | null)

const TICK_MS = 250
const PULSE_MS = 400
// the spinner walks on to its next verb every this many pulses
const VERB_EVERY = 12
// pulses with no spinner drawn before the pulse timer stops itself
const PULSE_IDLE = 3
const PANE_ID = 'dojo-roster'
const TERMINAL = new Set(['completed', 'failed', 'killed'])

// Module variables die with a hot reload; everything a drawing reads lives in $.state.
const seen = new Map<string, string>()
let timer: { cancel: () => void } | undefined
let pulseTimer: { cancel: () => void } | undefined
let spinnerDraws = 0

const wordsOf = (key: string): Words => WORDS[key] as Words

/** The strategist's theme and words for `key`; the neutral ones when `neutral` is on and no persona is known. */
export function strategistTheme(key: string | null, neutral: boolean): (Theme & Words) | null {
  const theme = key !== null ? STRATEGISTS[key] : neutral ? NEUTRAL : undefined
  return theme === undefined ? null : { ...theme, ...wordsOf(theme.key) }
}

/** The persona on duty (`shikamaru`, `lelouch`): what a command or the transcript said, else DOJO_STRATEGIST. */
async function personaKey($: Engine): Promise<string | null> {
  const known = await read($, strategist)
  if (known !== null) return known
  try {
    return strategistKey(await $.env.get('DOJO_STRATEGIST'))
  } catch {
    return null
  }
}

async function mainTheme($: Engine, options: Options) {
  return strategistTheme(await personaKey($), isOn(options, 'neutralMainTheme'))
}

const textProps = (s: Seg) => ({
  ...(s.color === undefined ? {} : { color: s.color }),
  ...(s.bold === true ? { bold: true } : {}),
  ...(s.dim === true ? { dimColor: true } : {}),
  ...(s.italic === true ? { italic: true } : {}),
})

/** One planned line as a Text: flat when it has one segment, nested colored runs otherwise. Always cut at the row's end. */
function drawLine(Text: ElementConstructor<TextProps>, line: Line, key: string): RenderElement {
  const only = line.length === 1 ? line[0] : undefined
  if (only !== undefined) {
    return (
      <Text key={key} wrap="truncate-end" {...textProps(only)}>
        {only.text}
      </Text>
    )
  }
  return (
    <Text key={key} wrap="truncate-end">
      {line.map((s, i) => (
        <Text key={`${key}-${i}`} {...textProps(s)}>
          {s.text}
        </Text>
      ))}
    </Text>
  )
}

/**
 * Plays a cue unless one played within the gap. The stamp is claimed inside `update`, which retries on a version
 * miss, so parallel callers (each in an environment of its own) cannot both pass the gate.
 */
async function cue($: Engine, options: Options, kind: Cue): Promise<void> {
  if (!isOn(options, 'sounds')) return
  try {
    const now = await $.clock.now()
    let isClaimed = false
    await update($, cueAt, last => {
      isClaimed = !(last !== null && now >= last && now - last < CUE_GAP_MS)
      return isClaimed ? now : last
    })
    if (isClaimed) $.audio.play({ asset: SOUNDS[kind] }).catch(() => {})
  } catch {
    // no clock or no player: the cue is a garnish
  }
}

/** Keeps the spinner animating while one is on screen, and stops once none has been drawn for a few pulses. */
function startPulse($: Engine) {
  if (pulseTimer !== undefined) return
  let lastDraws = -1
  let idle = 0
  pulseTimer = $.clock.every(PULSE_MS, () => {
    if (spinnerDraws === lastDraws) {
      idle += 1
      if (idle >= PULSE_IDLE) {
        pulseTimer?.cancel()
        pulseTimer = undefined
        return
      }
    } else {
      idle = 0
      lastDraws = spinnerDraws
    }
    update($, pulse, p => p + 1).catch(() => {})
  })
}

type Group = { running: number; last?: 'returned' | 'fell'; task: string }

/** The roster after folding in what the agent list says now; the same object when nothing changed. */
function foldRoster(prev: Record<string, DojoRosterEntry>, groups: ReadonlyMap<string, Group>): Record<string, DojoRosterEntry> {
  let out = prev
  for (const [key, g] of groups) {
    const status = g.running > 0 ? 'running' : g.last
    if (status === undefined) continue
    const before = prev[key]
    if (before !== undefined && before.status === status && (status !== 'running' || before.task === g.task)) continue
    out = {
      ...out,
      [key]: {
        status,
        count: before?.count ?? 1,
        task: g.running > 0 ? g.task : (before?.task ?? ''),
        ...(before?.says === undefined ? {} : { says: before.says }),
      },
    }
  }
  return out
}

async function tick($: Engine, options: Options) {
  const crew = (await $.agent.list()).filter(a => crewKey(a.type) !== null)
  const rows: DojoCrewRow[] = []
  const groups = new Map<string, Group>()
  const finished: { key: string; ok: boolean }[] = []
  for (const a of crew) {
    const key = crewKey(a.type)
    if (key === null || CREW[key] === undefined) continue
    const before = seen.get(a.id)
    seen.set(a.id, a.status)
    const g = groups.get(key) ?? { running: 0, task: '' }
    groups.set(key, g)
    if (TERMINAL.has(a.status)) {
      g.last = a.status === 'completed' ? 'returned' : 'fell'
      if (before !== undefined && !TERMINAL.has(before)) finished.push({ key, ok: a.status === 'completed' })
    } else {
      g.running += 1
      g.task = a.description
      rows.push({ id: a.id, key, description: a.description })
    }
  }

  const keepRoster = isOn(options, 'rosterPane') || isOn(options, 'toasts')
  let table: Record<string, DojoRosterEntry> = {}
  if (keepRoster) {
    const now = await read($, roster)
    table = foldRoster(now, groups) === now ? now : await update($, roster, r => foldRoster(r, groups))
  }

  if (isOn(options, 'toasts')) {
    for (const f of finished) {
      const c = CREW[f.key]
      if (c === undefined) continue
      const says = table[f.key]?.says
      $.ui.toast(
        f.ok ? `${c.emoji} ${c.name} returned${says === undefined ? '' : ` — "${says}"`}` : `${FELL_EMOJI} ${c.name} fell`,
      )
    }
  }
  if (finished.length > 0) await cue($, options, finished.some(f => !f.ok) ? 'fall' : 'return')

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
  const wanted = ['band', 'toasts', 'sounds', 'rosterPane'].some(name => isOn(options, name))
  if (timer !== undefined || !wanted) return
  timer = $.clock.every(TICK_MS, () => {
    tick($, options).catch(() => {})
  })
}

/** What the roster pane (and its text fallback) is drawn from. */
async function rosterInput($: Engine, columns: number) {
  return {
    persona: await personaKey($),
    voice: await read($, voice),
    entries: await read($, roster),
    frame: (await read($, band)).frame,
    columns,
  }
}

export const installChrome: Installer = (on, options) => {
  // Deploy toast, sound and band row for a dojo subagent that started.
  on('agent.spawn', { subagentType: /^dojo:(?!strategist$)/ }, async ($, e, next) => {
    const ran = await next(e)
    const key = crewKey(e.subagentType)
    if (ran.deny === undefined && ran.agentId !== undefined && key !== null) {
      try {
        seen.set(ran.agentId, 'running')
        const c = CREW[key]
        let nth = 1
        if (isOn(options, 'rosterPane') || isOn(options, 'toasts')) {
          const table = await update($, roster, r => ({
            ...r,
            [key]: { status: 'running' as const, count: (r[key]?.count ?? 0) + 1, task: e.description },
          }))
          nth = table[key]?.count ?? 1
        }
        if (c !== undefined && isOn(options, 'toasts')) {
          $.ui.toast(`${c.emoji} ${c.name} deployed — "${deployLine(key, nth, DEPLOY_MORE[key] ?? [])}"`)
        }
        await cue($, options, 'deploy')
        ensureTick($, options)
        if (isOn(options, 'band')) {
          const id = ran.agentId
          await update($, band, b => ({
            ...b,
            rows: [...b.rows.filter(r => r.id !== id), { id, key, description: e.description }],
          }))
        }
      } catch {
        // chrome only: the subagent has started either way
      }
    }
    return ran
  })

  // What a crew member said last: the `Says:` line of its report.
  on('turn.complete', { reason: 'answer' }, async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId !== undefined && (isOn(options, 'rosterPane') || isOn(options, 'toasts'))) {
      try {
        const says = parseSays(e.answer)
        const id = e.agentId
        const agent = (await $.agent.list()).find(a => a.id === id)
        const key = agent === undefined ? null : crewKey(agent.type)
        if (says !== undefined && key !== null) {
          await update($, roster, r => ({
            ...r,
            [key]: { status: 'running' as const, count: 1, task: '', ...r[key], says },
          }))
        }
      } catch {
        // the line is a garnish
      }
    }
    return ran
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
    // a message (compacting, rewinding) is the engine's own state line: leave it alone
    if (!isOn(options, 'spinners') || e.props.message !== null) return next(e)
    let props = e.props
    try {
      const n = (await read($, turn)) ?? 0
      const beat = (await read($, pulse)) ?? 0
      spinnerDraws += 1
      try {
        startPulse($)
      } catch {
        // no clock to animate with: the first verb stands still
      }
      const step = Math.floor(beat / VERB_EVERY)
      const agent = (await $.agent.list()).find(a => a.id === e.requestId)
      const key = agent === undefined ? null : crewKey(agent.type)
      const crew = key === null ? undefined : CREW[key]
      let word: string | undefined
      let owner: string | undefined
      if (key !== null && crew !== undefined) {
        owner = key
        word = `${crew.emoji} ${verbAt(key, n, e.requestId, step)}`
      } else if (agent === undefined) {
        const theme = await mainTheme($, options)
        if (theme !== null) {
          owner = theme.key
          word = `${theme.emoji} ${verbAt(theme.key, n, '', step)}`
        }
      }
      if (word !== undefined && owner !== undefined) {
        const frames = framesOf(owner)
        // the animated glyph rides after the ellipsis; the terminal is the surface that documents a suffix rewrite
        props =
          e.surface === 'terminal'
            ? { ...e.props, word, suffix: `${e.props.suffix} ${frames[beat % frames.length] ?? ''}`.trimEnd() }
            : { ...e.props, word }
      }
    } catch {
      props = e.props
    }
    return next({ ...e, props } as typeof e)
  })

  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    if (!isOn(options, 'turnFlair')) return next(e)
    let word: string | undefined
    try {
      const theme = await mainTheme($, options)
      if (theme?.done !== undefined) {
        const n = (await read($, turn)) ?? 0
        word = turnWord(theme.key, theme.done, e.props.durationMs, n)
      }
    } catch {
      word = undefined
    }
    return word === undefined ? next(e) : next({ ...e, props: { ...e.props, word } })
  })

  // The latest session figures for the usage line; the engine pushes them, the band hook below draws them.
  on('session.measure', async ($, e, next) => {
    const ran = await next(e)
    if (isOn(options, 'usageLine')) {
      try {
        const figures = snapshotUsage(e)
        await update($, usage, () => figures)
      } catch {
        // the usage line is a garnish
      }
    }
    return ran
  })

  // One usage row first (when on and known), then the crew band below it.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const wantBand = isOn(options, 'band')
    const wantUsage = isOn(options, 'usageLine')
    if ((!wantBand && !wantUsage) || e.props.hasSurvey) return next(e)
    let tree: RenderElement | undefined
    try {
      const persona = await personaKey($)
      const columns = e.props.bodyColumns
      const bandState = wantBand ? await read($, band) : undefined
      const crewOut = bandState !== undefined && bandState.rows.length > 0
      // with a single row to spare the crew band keeps it
      let usageRow: Line | undefined
      if (wantUsage && !(crewOut && e.props.maxRows < 2)) {
        try {
          usageRow = planUsage({ persona, usage: (await read($, usage)) ?? snapshotUsage(await $.session.usage()), columns })
        } catch {
          usageRow = undefined
        }
      }
      let lines: Line[] = usageRow === undefined ? [] : [usageRow]
      if (bandState !== undefined && crewOut) {
        const latest = await read($, tools)
        lines = [
          ...lines,
          ...planBand({
            persona,
            rows: bandState.rows.map(r => ({ key: r.key, description: r.description, tool: latest[r.id] })),
            frame: bandState.frame,
            columns,
            maxRows: e.props.maxRows - lines.length,
          }),
        ]
      }
      if (lines.length > 0) {
        const { Box, Text } = $.ui.resolve(e)
        tree = <Box flexDirection="column">{lines.map((l, i) => drawLine(Text, l, `band-${i}`))}</Box>
      }
    } catch {
      tree = undefined
    }
    return tree ?? next(e)
  })

  // The prompt hint keeps the engine's line (its pills stay live); the strategist adds a dim line of its own after it.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    if (!isOn(options, 'promptChrome') || e.surface !== 'terminal') return next(e)
    let tail: string | undefined
    try {
      const mine = hintTail(await personaKey($), (await read($, turn)) ?? 0, e.props.isWorking, e.props.isDraft)
      tail = mine === undefined ? undefined : e.props.tail === undefined ? mine : `${e.props.tail} ${mine}`
    } catch {
      tail = undefined
    }
    return tail === undefined ? next(e) : next({ ...e, props: { ...e.props, tail } })
  })

  // Each footer mode keeps its own name; the strategist's label sits beside it and its badge follows.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    if (!isOn(options, 'promptChrome')) return next(e)
    let modes: string[] | undefined
    try {
      modes = themedModes(await personaKey($), e.props.modes)
    } catch {
      modes = undefined
    }
    return modes === undefined ? next(e) : next({ ...e, props: { ...e.props, modes } })
  })

  // /dojo opens the roster pane. Commands can only be registered once an interactive session binds.
  on('session.start', { isInteractive: true }, async ($, e, next) => {
    if (isOn(options, 'rosterPane')) {
      try {
        await $.command.register({ name: 'dojo', description: 'Open the dojo roster: strategist on duty, crew, models and status' })
      } catch {
        // a name taken or refused: the other commands still stand
      }
    }
    return next(e)
  })

  on('command.run', { command: 'dojo' }, async ($, e, next) => {
    if (!isOn(options, 'rosterPane')) return next(e)
    try {
      const opened = await $.ui.open({ id: PANE_ID, title: 'Dojo roster', focus: true, closeOnEscape: true, rows: 22 })
      if (opened.isPlaced) return {}
      return { text: rosterText(await rosterInput($, e.presentation.columns)) }
    } catch {
      return next(e)
    }
  })

  on('ui.render', { component: 'Pane', requestId: 'dojo-roster' }, async ($, e, next) => {
    if (!isOn(options, 'rosterPane')) return next(e)
    let tree: RenderElement | undefined
    try {
      const lines = rosterLines(await rosterInput($, e.props.bodyColumns))
      const { Box, Text, Button } = $.ui.resolve(e)
      tree = (
        <Box flexDirection="column">
          {lines.map((l, i) => drawLine(Text, l, `roster-${i}`))}
          <Box marginTop={1} gap={1}>
            <Button
              key="close"
              label="close"
              hotkey="q"
              onPress={() => {
                $.ui.close({ id: PANE_ID }).catch(() => {})
              }}
            />
            <Text dimColor wrap="truncate-end">
              esc closes
            </Text>
          </Box>
        </Box>
      )
    } catch {
      tree = undefined
    }
    return tree ?? next(e)
  })
}
