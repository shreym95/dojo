export type DojoBudget = { files: string[]; lookups: number }

// Chrome (spinner, turn flair, band, toasts) state.
export type DojoCrewRow = { id: string; key: string; description: string }
export type DojoBand = { frame: number; rows: DojoCrewRow[] }
/** A running crew member's start (ms on the plugin clock) and the tokens its model requests have spent so far. */
export type DojoRun = { startedAt: number; tokens: number }
export type DojoRosterEntry = { status: 'running' | 'returned' | 'fell'; count: number; task: string; says?: string }
/** The figures the usage line draws: context fill percent, the most-used rate-limit window, session cost in US dollars. */
export type DojoUsage = {
  percent: number | null
  limit: { kind: string; percent: number } | null
  usd: number | null
}
/** What one crew member did this session: runs started, how they ended, wall time and tokens of the runs that reported, and the last `Says:` line it gave. */
export type DojoCrewStats = { runs: number; returned: number; fell: number; ms: number; tokens: number; says?: string }
/** Cumulative rank points (dojo crew that returned successfully); `saved` is false when the plugin store was unavailable. */
export type DojoRank = { points: number; saved: boolean }

declare module 'claude-code' {
  interface PluginState {
    dojo: {
      // --- shared across visual modules (written by visuals/chrome.tsx, read by the rest) ---
      /** The palette in force: `light` darkens the dojo colors for light terminal themes. */
      paletteMode: 'dark' | 'light'

      // --- persona detection and commands (mods/lib, mods/features) ---
      /** Detected or commanded strategist persona key (`shikamaru`, `lelouch`) or null. */
      strategist: string | null
      /** The persona a /dojo-duty command picked; later automatic on-duty lines yield to it. */
      chosen: string | null
      /** Voice level set by /dojo-voice (`subtle`, `medium`, `full`) or null for the roster default. */
      voice: string | null
      /** Prompts submitted so far. */
      turn: number
      /** What the main thread has spent this turn. */
      budget: DojoBudget
      /** The prompt number `budget` belongs to. */
      budgetTurn: number

      // --- visuals/chrome.tsx ---
      /** Running dojo subagents plus the animation frame. */
      band: DojoBand
      /** Latest tool call per subagent id, e.g. `Bash: npm test`. */
      tools: Record<string, string>
      /** Per running subagent id: when it started and the tokens spent so far, for the band's right column. */
      runs: Record<string, DojoRun>
      /** Crew status per character key (`levi`), for the /dojo roster pane and the toast line rotation. */
      roster: Record<string, DojoRosterEntry>
      /** Spinner animation counter; it only advances while a spinner is on screen. */
      pulse: number
      /** When the last sound cue played (ms on the plugin clock), or null. */
      cueAt: number | null
      /** Latest session.measure figures for the usage line, or null before the first measurement. */
      usage: DojoUsage | null
      /** Per crew key (`levi`): runs, outcomes, run time and tokens this session, for the /dojo pane and the recap. */
      stats: Record<string, DojoCrewStats>
      /** Rank points, loaded from the plugin store on first use; null before that. */
      rank: DojoRank | null
      /** Index of the character the /dojo-gallery pane shows. */
      gallery: number

      // --- visuals/transcript.tsx: add its state keys below this line ---
      /** tool_use_id of a call a subagent made -> its crew key (`-` for a subagent that is no dojo crew). */
      callers: Record<string, string>
      /** tool_use_id of an Agent call -> the crew key it spawns (`-` for any other agent type). */
      spawns: Record<string, string>
    }
  }
}
