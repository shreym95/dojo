import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine } from 'claude-code'

import { isOn } from '../lib/options'
import type { Installer, Options } from '../lib/options'
import { crewKey } from '../lib/persona'
import { summarizeTool } from '../lib/text'
import { CREW, resolveMode } from '../theme'
import type { PaletteMode } from '../theme'
import type { DojoBand, DojoCrewStats, DojoRank, DojoRosterEntry, DojoRun, DojoUsage } from '../state'
import { RANK_STORE_KEY } from '../visuals/chrome-art'
import { addStats, agentTokens, parseSays, snapshotUsage, stepTokens } from '../visuals/chrome-lib'
import type { AgentTokens } from '../visuals/chrome-lib'
import { remember } from '../visuals/transcript-lib'

// The state installer: every hook here records, derives or persists data and draws nothing. The visual modules (chrome,
// transcript) read what lands here through atoms of their own.
//
// The module scan reads an atom only from a const of the file that uses it; the {plugin, key} pair is the shared name.
const band = atom({ plugin: 'dojo', key: 'band' } as const, { frame: 0, rows: [] } as DojoBand)
const tools = atom({ plugin: 'dojo', key: 'tools' } as const, {} as Record<string, string>)
const roster = atom({ plugin: 'dojo', key: 'roster' } as const, {} as Record<string, DojoRosterEntry>)
const runs = atom({ plugin: 'dojo', key: 'runs' } as const, {} as Record<string, DojoRun>)
const usage = atom({ plugin: 'dojo', key: 'usage' } as const, null as DojoUsage | null)
const stats = atom({ plugin: 'dojo', key: 'stats' } as const, {} as Record<string, DojoCrewStats>)
const rank = atom({ plugin: 'dojo', key: 'rank' } as const, null as DojoRank | null)
const paletteMode = atom({ plugin: 'dojo', key: 'paletteMode' } as const, 'dark' as PaletteMode)
/** tool_use_id of a call a subagent made -> its crew key, or `-` for any other subagent. The main thread has no entry. */
const callers = atom({ plugin: 'dojo', key: 'callers' } as const, {} as Record<string, string>)
/** tool_use_id of an Agent call -> the crew key it spawns, or `-` for any other agent type. */
const spawns = atom({ plugin: 'dojo', key: 'spawns' } as const, {} as Record<string, string>)

/** A run no step has counted yet. */
export const NO_TOKENS = { latestInput: 0, cumOutput: 0 }

/** A run the steps never counted takes the usage its turn reports; one they did count keeps its own figures. */
function settleTokens(cur: AgentTokens, usage: unknown): AgentTokens {
  return agentTokens(cur) > 0 ? cur : stepTokens(cur, usage)
}

/** The palette for the engine theme and the `paletteMode` setting; `changed` is a row being written right now. */
async function syncMode($: Engine, options: Options, changed?: { key: string; value: unknown }) {
  let theme: unknown
  let setting: unknown = options.paletteMode
  try {
    const rows = await $.config.list()
    theme = rows.find(r => r.key === 'theme')?.value
    const mine = rows.find(r => r.key === 'dojo.paletteMode')
    if (mine !== undefined) setting = mine.value
  } catch {
    // no config rows to read: the option and the dark default stand
  }
  if (changed !== undefined) {
    if (changed.key === 'theme') theme = changed.value
    else setting = changed.value
  }
  const next = resolveMode(setting, theme)
  await update($, paletteMode, () => next)
}

export const pointsOf = (stored: unknown): number => {
  const p = typeof stored === 'object' && stored !== null ? (stored as { points?: unknown }).points : undefined
  return typeof p === 'number' && Number.isFinite(p) && p > 0 ? Math.floor(p) : 0
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

export const installRecorders: Installer = (on, options) => {
  // Roster, stats, start time and band row for a dojo subagent that started.
  on('agent.spawn', { subagentType: /^dojo:(?!strategist$)/ }, async ($, e, next) => {
    const ran = await next(e)
    const key = crewKey(e.subagentType)
    if (ran.deny === undefined && ran.agentId !== undefined && key !== null) {
      try {
        if (isOn(options, 'rosterPane') || isOn(options, 'toasts')) {
          await update($, roster, r => ({
            ...r,
            [key]: { status: 'running' as const, count: (r[key]?.count ?? 0) + 1, task: e.description },
          }))
        }
        if (isOn(options, 'rosterPane')) await update($, stats, s => addStats(s, key, { runs: 1 }))
        if (isOn(options, 'band')) {
          const id = ran.agentId
          try {
            const startedAt = await $.clock.now()
            await update($, runs, r => ({ ...r, [id]: { startedAt, ...NO_TOKENS } }))
          } catch {
            // no start time: the row shows no elapsed figure until the tick notes one
          }
          await update($, band, b => ({
            ...b,
            rows: [...b.rows.filter(r => r.id !== id), { id, key, description: e.description }],
          }))
        }
      } catch {
        // bookkeeping only: the subagent has started either way
      }
    }
    return ran
  })

  // What a crew member said last: the `Says:` line of its report.
  on('turn.complete', { reason: 'answer' }, async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId !== undefined && isOn(options, 'band')) {
      try {
        const id = e.agentId
        await update($, runs, r => {
          const cur = r[id]
          const settled = cur === undefined ? undefined : settleTokens(cur, e.usage)
          return cur === undefined || settled === cur ? r : { ...r, [id]: { ...cur, ...settled } }
        })
      } catch {
        // the token figure is a garnish
      }
    }
    if (e.agentId !== undefined && (isOn(options, 'rosterPane') || isOn(options, 'toasts'))) {
      try {
        const says = parseSays(e.answer)
        const id = e.agentId
        const agent = (await $.agent.list()).find(a => a.id === id)
        const key = agent === undefined ? null : crewKey(agent.type)
        if (key !== null && CREW[key] !== undefined && isOn(options, 'rosterPane')) {
          const ms = Number.isFinite(e.durationMs) && e.durationMs > 0 ? e.durationMs : 0
          const tokens = agentTokens(settleTokens((await read($, runs))[id] ?? NO_TOKENS, e.usage))
          if (ms > 0 || tokens > 0 || says !== undefined) await update($, stats, s => addStats(s, key, { ms, tokens, ...(says === undefined ? {} : { says }) }))
        }
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

  // Latest tool call per subagent, for the band's tool column.
  on('tool.call', async ($, e, next) => {
    if (e.agentId !== undefined && isOn(options, 'band')) {
      const id = e.agentId
      const line = summarizeTool(String(e.tool), e as unknown as Record<string, unknown>)
      await update($, tools, t => ({ ...t, [id]: line }))
    }
    return next(e)
  })

  // Remember which subagent made each tool call, so a row can be marked by the crew member behind it.
  on('tool.call', { agentId: /./ }, async ($, e, next) => {
    if (isOn(options, 'transcriptTheme')) {
      try {
        const id = String(e.tool_use_id)
        const loop = String(e.agentId)
        const found = (await $.agent.list()).find(a => a.id === loop)
        const key = found === undefined ? null : crewKey(found.type)
        await update($, callers, table => remember(table, id, key ?? '-'))
      } catch {
        // bookkeeping only
      }
    }
    return next(e)
  })

  // Remember which agent type each Agent call spawns, so its result can be drawn as that character's return.
  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    if (isOn(options, 'transcriptTheme')) {
      try {
        const type = (e as unknown as { subagent_type?: unknown }).subagent_type
        const key = typeof type === 'string' ? crewKey(type) : null
        await update($, spawns, table => remember(table, String(e.tool_use_id), key ?? '-'))
      } catch {
        // bookkeeping only
      }
    }
    return next(e)
  })

  // What a crew member has spent so far: each model request replaces the run's latest input and adds its output (Claude Code's own per-agent figure). The main loop passes.
  on('turn.step', async function* ($, e, next) {
    const out = yield* next(e)
    if (e.agentId !== undefined && isOn(options, 'band')) {
      try {
        const id = e.agentId
        await update($, runs, r => {
          const cur = r[id]
          return cur === undefined ? r : { ...r, [id]: { ...cur, ...stepTokens(cur, out.usage) } }
        })
      } catch {
        // the token figure is a garnish
      }
    }
    return out
  })

  // The latest session figures for the usage line; the engine pushes them, the chrome band hook draws them.
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

  // The palette and the rank points, set once an interactive session binds.
  on('session.start', { isInteractive: true }, async ($, e, next) => {
    try {
      await syncMode($, options)
      if (isOn(options, 'rank')) await loadRank($)
    } catch {
      // the dark palette and a rank loaded on first use stand
    }
    return next(e)
  })

  // The palette follows the engine theme (and the setting): re-resolved when either is written.
  on('config.set', { key: ['theme', 'dojo.paletteMode'] }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined) {
      try {
        await syncMode($, options, { key: e.key, value: e.value })
      } catch {
        // the palette stays as it was
      }
    }
    return ran
  })
}
