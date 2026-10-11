// Data for visuals/chrome.tsx: extra animation frames, verbs, lines, hints, mode labels, roster facts and sound files.
// Keyed like mods/theme.ts. The base verbs, frames and deploy lines stay in WORDS; everything here extends them.

/** Frames appended to WORDS[key].frames, so the first four stay as they were. Single-width glyphs only. */
export const FRAMES_MORE: Record<string, readonly string[]> = {
  shikamaru: ['◴', '◷', '◶', '◵'],
  lelouch: ['♜', '♞', '♝', '♛'],
  strategist: ['◴', '◷', '◶', '◵'],
  senku: ['⚙', '⌬', '✦', '⚛'],
  sanji: ['≋', '♨', '≋', '∽'],
  l: ['◒', '◐', '◓', '◑'],
  light: ['✍', '✎', '✐', '✑'],
  levi: ['✖', '⟍', '⟋', '⌁'],
  robin: ['❃', '❋', '✺', '❀'],
}

/** Spinner verbs added after WORDS[key].verbs. The first verb of a turn always comes from WORDS; these rotate in later. */
export const VERBS_MORE: Record<string, readonly string[]> = {
  shikamaru: ['Counting the moves', 'Finding the cheap line', 'Watching the clouds', 'Patching the formation', 'Muttering "troublesome"', 'Cutting scope creep'],
  lelouch: ['Issuing commands', 'Naming the sacrifice', 'Checking the last move', 'Moving the Knight', 'Staging the checkmate', 'Naming the contingency'],
  strategist: ['Weighing the plan', 'Splitting the work', 'Checking the last move'],
  senku: ['Measuring everything', 'Running the experiment', 'Crafting from raw materials', 'Reading the data', 'Revival-Fluiding', 'Citing ten billion percent'],
  sanji: ['Trimming the waste', 'Plating the layout', 'Reducing the sauce', 'Setting the table', 'Flambéing', 'Clearing the clutter'],
  l: ['Ranking the witnesses', 'Cross-checking sources', 'Stating the probability', 'Naming the suspect', 'Following a lead'],
  light: ['Picking one source', 'Dating the answer', 'Answering in one line', 'Naming the source', 'Closing the notebook'],
  levi: ['Wiping every surface', 'Grading the dirt', 'Sweeping the edge cases', 'Finding the dirty corner', 'Running the checks'],
  robin: ['Restoring the inscription', 'Recording the history', 'Sprouting extra arms', 'Correcting the record', 'Reading on'],
}

/** Deploy toast lines after WORDS[key].deploy (which is always the first one). */
export const DEPLOY_MORE: Record<string, readonly string[]> = {
  senku: ['Get excited!', "Let's get building.", 'This is exhilarating!', 'Fresh variables!'],
  sanji: ['Order up.', 'Leave the rest to me.', 'The plate will be flawless.', 'Every guest served.'],
  l: ['I have a lead.', "Let's eliminate the suspects.", 'Interesting.', 'Probability pending.'],
  light: ['Naturally.', 'Too easy.', 'A step ahead.', 'One source is enough.'],
  levi: ["Don't waste my time.", 'Tch. Let me see the filth.', 'Wipe it down.', 'Every corner.'],
  robin: ['How interesting.', 'I want to know...', 'Shall we read on?', 'Only what is written.'],
}

/** What a crew member says when it falls, shown beside a fallen member in the roster. */
export const FALL_LINES: Record<string, string> = {
  senku: "Failed experiment. That's data.",
  sanji: 'Spoiled ingredient.',
  l: 'I suspected as much.',
  light: 'An unexpected variable.',
  levi: 'Filthy.',
  robin: 'A forged inscription.',
}

/** Turn-end words for turns of a minute and a half or more, per strategist (WORDS.done covers the rest). */
export const LONG_TURN_MS = 90_000
export const TURN_LONG: Record<string, readonly string[]> = {
  shikamaru: ['Slogged through', 'Dragged through', 'Endured'],
  lelouch: ['Played the long game', 'Won the long game', 'Held the line'],
  strategist: ['Worked through'],
}

/** The band header, `{n}` the number of crew out; `compact` is for narrow bands. */
export const BAND_HEADER: Record<string, { full: string; compact: string }> = {
  shikamaru: { full: 'Shadow formation: {n} deployed', compact: 'Shadows: {n} out' },
  lelouch: { full: 'Black Knights: {n} deployed', compact: 'Knights: {n} out' },
}

/** One dim line after the prompt hint, by what the prompt is doing. */
export const HINTS: Record<string, { idle: readonly string[]; draft: readonly string[]; working: readonly string[] }> = {
  shikamaru: {
    idle: ['What a drag.', 'Number of moves matters.', 'Clouds are nicer than this.', 'Troublesome.'],
    draft: ['Make it three moves, tops.', 'Anyway, go on.', 'Name the cheap line.'],
    working: ['Moves, not effort.', "Don't make me do this twice.", 'Let me think. Quietly.'],
  },
  lelouch: {
    idle: ['Your move.', 'The board is set.', 'All according to plan.', 'I will not lose.'],
    draft: ['State the objective.', 'Name your move.', 'Then I shall adapt.'],
    working: ['Everything proceeds as calculated.', 'The pieces are moving.', 'Stand aside; I have a plan.'],
  },
}

/** Labels shown beside a footer mode: a mode whose name matches `match` gets `label`. */
export const MODE_LABELS: Record<string, readonly { match: RegExp; label: string }[]> = {
  shikamaru: [
    { match: /focus/i, label: 'shadow stance' },
    { match: /memory/i, label: 'clouds drifting' },
  ],
  lelouch: [
    { match: /focus/i, label: 'eyes on the board' },
    { match: /memory/i, label: 'the board is frozen' },
  ],
}

/** Model per agent, copied from roster.mjs (the plugin's roster file is a build-time input, not imported here). */
export const MODELS: Record<string, string> = {
  strategist: 'claude-opus-5-5',
  senku: 'claude-sonnet-5-5',
  sanji: 'claude-sonnet-5-5',
  l: 'claude-haiku-4-5-20251001',
  light: 'claude-haiku-4-5-20251001',
  levi: 'claude-haiku-4-5-20251001',
  robin: 'claude-haiku-4-5-20251001',
}

/** The roster's default voice level (`defaults.voice`). */
export const DEFAULT_VOICE = 'medium'

/** Sound cue files, relative to the plugin folder, and the least gap between two cues. */
export const SOUNDS = {
  deploy: 'assets/sounds/deploy.wav',
  return: 'assets/sounds/return.wav',
  fall: 'assets/sounds/fall.wav',
} as const
export type Cue = keyof typeof SOUNDS
export const CUE_GAP_MS = 500
