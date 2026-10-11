export type DojoBudget = { files: string[]; lookups: number }

// Chrome (spinner, turn flair, band, toasts) state.
export type DojoCrewRow = { id: string; key: string; description: string }
export type DojoBand = { frame: number; rows: DojoCrewRow[] }
export type DojoRosterEntry = { status: 'running' | 'returned' | 'fell'; count: number; task: string; says?: string }

declare module 'claude-code' {
  interface PluginState {
    dojo: {
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
      /** Crew status per character key (`levi`), for the /dojo roster pane and the toast line rotation. */
      roster: Record<string, DojoRosterEntry>
      /** Spinner animation counter; it only advances while a spinner is on screen. */
      pulse: number
      /** When the last sound cue played (ms on the plugin clock), or null. */
      cueAt: number | null

      // --- visuals/transcript.tsx: add its state keys below this line ---
      /** tool_use_id of a call a subagent made -> its crew key (`-` for a subagent that is no dojo crew). */
      callers: Record<string, string>
      /** tool_use_id of an Agent call -> the crew key it spawns (`-` for any other agent type). */
      spawns: Record<string, string>
    }
  }
}
