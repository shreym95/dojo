import { atom, read, update } from 'claude-code'
import type { ElementConstructor, EngineInterface as Engine, RenderElement, TextProps } from 'claude-code'

import { isOn } from '../lib/options'
import type { Installer, Options } from '../lib/options'
import { crewKey, strategistKey } from '../lib/persona'
import { CREW, NEUTRAL, STRATEGISTS, WORDS } from '../theme'
import type { PaletteMode, Theme, Words } from '../theme'
import type { DojoBand, DojoCrewRow, DojoCrewStats, DojoRank, DojoRosterEntry, DojoRun, DojoUsage } from '../state'
import { NO_TOKENS, pointsOf } from '../state/recorders'
import { CUE_GAP_MS, GALLERY_ORDER, RANK_STORE_KEY, SOUNDS, TOAST_MS } from './chrome-art'
import type { Cue } from './chrome-art'
import {
  addStats,
  agentTokens,
  deployToast,
  fallToast,
  framesOf,
  galleryLines,
  galleryText,
  planBand,
  planModes,
  planUsage,
  rankOf,
  rankUpText,
  recapLines,
  recapText,
  returnToast,
  rosterLines,
  rosterText,
  snapshotUsage,
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
const runs = atom({ plugin: 'dojo', key: 'runs' } as const, {} as Record<string, DojoRun>)
const pulse = atom({ plugin: 'dojo', key: 'pulse' } as const, 0)
const cueAt = atom({ plugin: 'dojo', key: 'cueAt' } as const, null as number | null)
const usage = atom({ plugin: 'dojo', key: 'usage' } as const, null as DojoUsage | null)
const stats = atom({ plugin: 'dojo', key: 'stats' } as const, {} as Record<string, DojoCrewStats>)
const rank = atom({ plugin: 'dojo', key: 'rank' } as const, null as DojoRank | null)
const gallery = atom({ plugin: 'dojo', key: 'gallery' } as const, 0)
// written by the state recorders (session start, theme or setting change), read here and by the transcript module
const paletteMode = atom({ plugin: 'dojo', key: 'paletteMode' } as const, 'dark' as PaletteMode)

const TICK_MS = 250
const PULSE_MS = 400
// the spinner walks on to its next verb every this many pulses
const VERB_EVERY = 12
// pulses with no spinner drawn before the pulse timer stops itself
const PULSE_IDLE = 3
const PANE_ID = 'dojo-roster'
const RECAP_ID = 'dojo-recap'
const GALLERY_ID = 'dojo-gallery'
const COMMANDS = [
  { name: 'dojo', description: 'Open the dojo roster: strategist on duty, crew, models and status' },
  { name: 'dojo-recap', description: 'Open the mission report: who was deployed, what fell, final context and cost, rank' },
  { name: 'dojo-gallery', description: 'Browse the dojo characters: banner, colors, spinner words and lines' },
] as const
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

/** Keeps a start time and a token count for each running crew id: new ids start now, ended ones go. */
async function trackRuns($: Engine, ids: readonly string[]) {
  const held = await read($, runs)
  const live = new Set(ids)
  const isStale = Object.keys(held).some(id => !live.has(id))
  const isFresh = ids.some(id => held[id] === undefined)
  if (!isStale && !isFresh) return
  const now = await $.clock.now()
  await update($, runs, r => {
    const next: Record<string, DojoRun> = {}
    for (const id of ids) next[id] = r[id] ?? { startedAt: now, ...NO_TOKENS }
    return next
  })
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

  if (finished.length > 0 && isOn(options, 'rosterPane')) {
    try {
      await update($, stats, s => finished.reduce((t, f) => addStats(t, f.key, f.ok ? { returned: 1 } : { fell: 1 }), s))
    } catch {
      // the figures are a garnish
    }
  }
  const promoted = await awardRank($, options, finished.filter(f => f.ok).length)

  // one toast per agent that ended; the return that earned a new rank speaks as the rank-up instead
  if (isOn(options, 'toasts')) {
    let wins = 0
    for (const f of finished) {
      if (f.ok) wins += 1
      if (f.ok && promoted !== undefined && wins === promoted.win) {
        $.ui.toast(promoted.text, { timeoutMs: TOAST_MS.rankUp })
        continue
      }
      const nth = table[f.key]?.count ?? 1
      if (f.ok) $.ui.toast(returnToast(f.key, nth, table[f.key]?.says), { timeoutMs: TOAST_MS.return })
      else $.ui.toast(fallToast(f.key, nth), { timeoutMs: TOAST_MS.fall })
    }
  }
  if (finished.length > 0) await cue($, options, finished.some(f => !f.ok) ? 'fall' : 'return')

  if (rows.length === 0) {
    timer?.cancel()
    timer = undefined
  }
  if (!isOn(options, 'band')) return
  await trackRuns($, rows.map(r => r.id))
  await update($, band, b =>
    rows.length === 0 && b.rows.length === 0 ? b : { frame: rows.length === 0 ? 0 : b.frame + 1, rows },
  )
}

/** The rank points: held in state once loaded from the plugin store. Writes state, so never call it while drawing. */
async function loadRank($: Engine): Promise<DojoRank> {
  const held = await read($, rank)
  if (held !== null) return held
  let first: DojoRank
  try {
    first = { points: pointsOf(await $.store.get(RANK_STORE_KEY)), saved: true }
  } catch {
    // no store: the points live in this session only, and say so
    first = { points: 0, saved: false }
  }
  return (await update($, rank, r => r ?? first)) ?? first
}

/** The rank points for a drawing: state when loaded, else read from the store without writing state. */
async function peekRank($: Engine, options: Options): Promise<DojoRank | undefined> {
  if (!isOn(options, 'rank')) return undefined
  const held = await read($, rank)
  if (held !== null) return held
  try {
    return { points: pointsOf(await $.store.get(RANK_STORE_KEY)), saved: true }
  } catch {
    return { points: 0, saved: false }
  }
}

/**
 * Adds `wins` returned crew to the points and saves them. When that reaches a new rung it answers with the rung's
 * toast text in the strategist's voice and `win`, which of the returns (1-based) crossed the line.
 */
async function awardRank($: Engine, options: Options, wins: number): Promise<{ win: number; text: string } | undefined> {
  if (wins <= 0 || !isOn(options, 'rank')) return undefined
  try {
    const before = await loadRank($)
    const grown = (r: DojoRank | null): DojoRank => {
      const cur = r ?? before
      return { points: cur.points + wins, saved: cur.saved }
    }
    const after = (await update($, rank, grown)) ?? grown(null)
    if (after.saved) {
      try {
        await $.store.set(RANK_STORE_KEY, { points: after.points })
      } catch {
        await update($, rank, r => (r === null ? r : { ...r, saved: false }))
      }
    }
    if (isOn(options, 'toasts')) {
      const persona = await personaKey($)
      const now = rankOf(after.points, persona)
      if (now.index > rankOf(after.points - wins, persona).index) {
        let win = wins
        while (win > 1 && rankOf(after.points - wins + win - 1, persona).index === now.index) win -= 1
        return { win, text: rankUpText(now, persona) }
      }
    }
  } catch {
    // the rank is a garnish
  }
  return undefined
}

function ensureTick($: Engine, options: Options) {
  const wanted = ['band', 'toasts', 'sounds', 'rosterPane', 'rank'].some(name => isOn(options, name))
  if (timer !== undefined || !wanted) return
  timer = $.clock.every(TICK_MS, () => {
    tick($, options).catch(() => {})
  })
}

/** What the roster pane (and its text fallback) is drawn from. */
async function rosterInput($: Engine, options: Options, columns: number) {
  const points = await peekRank($, options)
  return {
    persona: await personaKey($),
    voice: await read($, voice),
    entries: await read($, roster),
    frame: (await read($, band)).frame,
    columns,
    mode: await read($, paletteMode),
    stats: await read($, stats),
    ...(points === undefined ? {} : { rank: points }),
  }
}

/** What the mission report is drawn from; the usage atom, or the session's own figures before the first measure. */
async function recapInput($: Engine, options: Options, columns: number) {
  let figures = await read($, usage)
  if (figures === null) {
    try {
      figures = snapshotUsage(await $.session.usage())
    } catch {
      figures = null
    }
  }
  const points = await peekRank($, options)
  return {
    persona: await personaKey($),
    stats: await read($, stats),
    usage: figures,
    columns,
    mode: await read($, paletteMode),
    ...(points === undefined ? {} : { rank: points }),
  }
}

/** Opens a pane for a command; a pane that cannot be placed answers with `text` instead. */
async function openPane($: Engine, spec: { id: string; title: string; rows: number }, text: () => Promise<string>) {
  const opened = await $.ui.open({ ...spec, focus: true, closeOnEscape: true })
  return opened.isPlaced ? {} : { text: await text() }
}

export const installChrome: Installer = (on, options) => {
  // Deploy toast and sound for a dojo subagent that started, and a tick to watch it. The state recorders have written the roster by now.
  on('agent.spawn', { subagentType: /^dojo:(?!strategist$)/ }, async ($, e, next) => {
    const ran = await next(e)
    const key = crewKey(e.subagentType)
    if (ran.deny === undefined && ran.agentId !== undefined && key !== null) {
      try {
        seen.set(ran.agentId, 'running')
        const c = CREW[key]
        let nth = 1
        if (isOn(options, 'rosterPane') || isOn(options, 'toasts')) nth = (await read($, roster))[key]?.count ?? 1
        if (c !== undefined && isOn(options, 'toasts')) $.ui.toast(deployToast(key, nth), { timeoutMs: TOAST_MS.deploy })
        await cue($, options, 'deploy')
        ensureTick($, options)
      } catch {
        // chrome only: the subagent has started either way
      }
    }
    return ran
  })

  // A subagent at work keeps the tick running; the tool it called is recorded by the state recorders.
  on('tool.call', { agentId: /./ }, async ($, e, next) => {
    if (e.agentId !== undefined && isOn(options, 'band')) ensureTick($, options)
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

  // The crew band rows first, so they sit under the engine's own agent line, then one usage row last (when on and known; the state recorders keep its figures), just above the prompt.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const wantBand = isOn(options, 'band')
    const wantUsage = isOn(options, 'usageLine')
    if ((!wantBand && !wantUsage) || e.props.hasSurvey) return next(e)
    let tree: RenderElement | undefined
    try {
      const persona = await personaKey($)
      const mode = await read($, paletteMode)
      const columns = e.props.bodyColumns
      const bandState = wantBand ? await read($, band) : undefined
      const crewOut = bandState !== undefined && bandState.rows.length > 0
      // with a single row to spare the crew band keeps it
      let usageRow: Line | undefined
      if (wantUsage && !(crewOut && e.props.maxRows < 2)) {
        try {
          usageRow = planUsage({ persona, usage: (await read($, usage)) ?? snapshotUsage(await $.session.usage()), columns, mode })
        } catch {
          usageRow = undefined
        }
      }
      let lines: Line[] = []
      if (bandState !== undefined && crewOut) {
        const latest = await read($, tools)
        const held = await read($, runs)
        let now: number | undefined
        try {
          now = await $.clock.now()
        } catch {
          now = undefined
        }
        lines = [
          ...planBand({
            persona,
            rows: bandState.rows.map(r => {
              const run = held[r.id]
              return {
                key: r.key,
                description: r.description,
                tool: latest[r.id],
                ...(run === undefined || now === undefined ? {} : { elapsedMs: Math.max(0, now - run.startedAt) }),
                ...(run === undefined || agentTokens(run) <= 0 ? {} : { tokens: agentTokens(run) }),
              }
            }),
            frame: bandState.frame,
            columns,
            maxRows: e.props.maxRows - (usageRow === undefined ? 0 : 1),
            mode,
          }),
        ]
      }
      if (usageRow !== undefined) lines = [...lines, usageRow]
      if (lines.length > 0) {
        const { Box, Text } = $.ui.resolve(e)
        tree = <Box flexDirection="column">{lines.map((l, i) => drawLine(Text, l, `band-${i}`))}</Box>
      }
    } catch {
      tree = undefined
    }
    return tree ?? next(e)
  })

  // The footer keeps the modes' names, dim, and ends on the strategist's small tag in its color.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    if (!isOn(options, 'promptChrome')) return next(e)
    let tree: RenderElement | undefined
    try {
      const line = planModes(await personaKey($), e.props.modes, await read($, paletteMode))
      if (line !== undefined) tree = drawLine($.ui.resolve(e).Text, line, 'modes')
    } catch {
      tree = undefined
    }
    return tree ?? next(e)
  })

  // /dojo, /dojo-recap and /dojo-gallery open panes. Commands can only be registered once an interactive session binds.
  on('session.start', { isInteractive: true }, async ($, e, next) => {
    if (isOn(options, 'rosterPane')) {
      for (const spec of COMMANDS) {
        try {
          await $.command.register(spec)
        } catch {
          // a name taken or refused: the other commands still stand
        }
      }
    }
    return next(e)
  })

  on('command.run', { command: 'dojo' }, async ($, e, next) => {
    if (!isOn(options, 'rosterPane')) return next(e)
    try {
      return await openPane($, { id: PANE_ID, title: 'Dojo roster', rows: 22 }, async () =>
        rosterText(await rosterInput($, options, e.presentation.columns)),
      )
    } catch {
      return next(e)
    }
  })

  on('command.run', { command: 'dojo-recap' }, async ($, e, next) => {
    if (!isOn(options, 'rosterPane')) return next(e)
    try {
      return await openPane($, { id: RECAP_ID, title: 'Mission report', rows: 18 }, async () =>
        recapText(await recapInput($, options, e.presentation.columns)),
      )
    } catch {
      return next(e)
    }
  })

  on('command.run', { command: 'dojo-gallery' }, async ($, e, next) => {
    if (!isOn(options, 'rosterPane')) return next(e)
    try {
      return await openPane($, { id: GALLERY_ID, title: 'Dojo gallery', rows: 26 }, async () =>
        galleryText({ index: await read($, gallery), columns: e.presentation.columns, mode: await read($, paletteMode) }),
      )
    } catch {
      return next(e)
    }
  })

  // One hook for the three dojo panes: the roster, the mission report and the gallery.
  on('ui.render', { component: 'Pane', requestId: /^dojo-(roster|recap|gallery)$/ }, async ($, e, next) => {
    if (!isOn(options, 'rosterPane')) return next(e)
    let tree: RenderElement | undefined
    try {
      const columns = e.props.bodyColumns
      const mode = await read($, paletteMode)
      const isGallery = e.requestId === GALLERY_ID
      const lines =
        e.requestId === RECAP_ID
          ? recapLines(await recapInput($, options, columns))
          : isGallery
            ? galleryLines({ index: await read($, gallery), columns, mode })
            : rosterLines(await rosterInput($, options, columns))
      const id = e.requestId
      const { Box, Text, Button } = $.ui.resolve(e)
      const closePane = () => {
        $.ui.close({ id }).catch(() => {})
      }
      const close = <Button key="close" label="close" hotkey="q" onPress={closePane} />
      const step = (by: number) => {
        update($, gallery, n => (((n + by) % GALLERY_ORDER.length) + GALLERY_ORDER.length) % GALLERY_ORDER.length).catch(() => {})
      }
      const note = (text: string) => (
        <Text dimColor wrap="truncate-end">
          {text}
        </Text>
      )
      // the gallery page is taller than the pane: its keys sit on top, the arrows scroll the rest
      tree = isGallery ? (
        <Box flexDirection="column">
          {lines.slice(0, 1).map((l, i) => drawLine(Text, l, `pane-${i}`))}
          <Box gap={1}>
            <Button key="prev" label="< prev (p)" hotkey="p" onPress={() => step(-1)} />
            <Button key="next" label="next (n)" hotkey="n" onPress={() => step(1)} />
            <Button key="close" label="close (q)" hotkey="q" onPress={closePane} />
            {note('↑↓ scroll')}
          </Box>
          {lines.slice(1).map((l, i) => drawLine(Text, l, `pane-${i + 1}`))}
        </Box>
      ) : (
        <Box flexDirection="column">
          {lines.map((l, i) => drawLine(Text, l, `pane-${i}`))}
          <Box marginTop={1} gap={1}>
            {close}
            {note('esc closes')}
          </Box>
        </Box>
      )
    } catch {
      tree = undefined
    }
    return tree ?? next(e)
  })
}
