export type FxCrewRow = { id: string; key: string; description: string }
export type FxBand = { frame: number; rows: FxCrewRow[] }

declare module 'claude-code' {
  interface PluginState {
    'dojo-fx': {
      /** Detected strategist persona key (`shikamaru`, `lelouch`) or null. */
      strategist: string | null
      /** Prompts submitted so far; rotates the verb pools. */
      turn: number
      /** Running dojo subagents plus the animation frame. */
      band: FxBand
      /** Latest tool call per subagent id, e.g. `Bash: npm test`. */
      tools: Record<string, string>
    }
  }
}
