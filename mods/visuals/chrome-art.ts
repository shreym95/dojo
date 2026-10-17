// Data for visuals/chrome.tsx: extra animation frames, verbs, toast lines, roster facts and sound files.
// Keyed like mods/theme.ts. The base verbs, frames and deploy lines stay in WORDS; everything here extends them.

/** Frames appended to WORDS[key].frames, so the first four stay as they were. Single-width glyphs only. */
export const FRAMES_MORE: Record<string, readonly string[]> = {
  shikamaru: ['◴', '◷', '◶', '◵'],
  lelouch: ['♜', '♞', '♝', '♛'],
  strategist: ['◴', '◷', '◶', '◵'],
  senku: ['⚙', '⌬', '✦', '⚛'],
  sanji: ['≋', '♨', '≋', '∽'],
  kurisu: ['⊙', '⊚', '⊛', '⊚'],
  jiraiya: ['◒', '◐', '◓', '◑'],
  light: ['✍', '✎', '✐', '✑'],
  levi: ['✖', '⟍', '⟋', '⌁'],
  robin: ['❃', '❋', '✺', '❀'],
}

/** Most terminal cells a spinner verb may take, so the line it sits on is never pushed. */
export const VERB_CELLS = 22

/** Spinner verbs added after WORDS[key].verbs. The first verb of a turn always comes from WORDS; these rotate in later. */
export const VERBS_MORE: Record<string, readonly string[]> = {
  shikamaru: ['Counting the moves', 'Finding the cheap line', 'Watching the clouds', 'Patching the formation', 'Muttering "drag"', 'Cutting scope creep'],
  lelouch: ['Issuing commands', 'Naming the sacrifice', 'Checking the last move', 'Moving the Knight', 'Staging the checkmate', 'Naming the contingency'],
  strategist: ['Weighing the plan', 'Splitting the work', 'Checking the last move'],
  senku: ['Measuring everything', 'Running the experiment', 'Crafting from scratch', 'Reading the data', 'Revival-Fluiding', 'Ten billion percent!'],
  sanji: ['Trimming the waste', 'Plating the layout', 'Reducing the sauce', 'Setting the table', 'Flambéing', 'Clearing the clutter'],
  kurisu: ['Stating the premise', 'Drafting the diagram', 'Comparing the options', 'Proposing a POC', 'Testing the hypothesis', 'Listing the tradeoffs'],
  jiraiya: ['Cross-checking sources', 'Naming the source', 'Dating the intel', 'Tailing a rumor', 'Reading the rumor mill', 'Sending out a toad'],
  light: ['Picking one source', 'Dating the answer', 'Answering in one line', 'Naming the source', 'Closing the notebook'],
  levi: ['Wiping every surface', 'Grading the dirt', 'Sweeping edge cases', 'Hunting dirty corners', 'Running the checks'],
  robin: ['Restoring inscriptions', 'Recording the history', 'Sprouting extra arms', 'Correcting the record', 'Reading on'],
}

/** Deploy toast lines after WORDS[key].deploy (which is always the first one). */
export const DEPLOY_MORE: Record<string, readonly string[]> = {
  senku: ['Get excited!', "Let's get building.", 'This is exhilarating!', 'Fresh variables!', 'Sosoru ze, kore wa!'],
  sanji: ['Order up.', 'Leave the rest to me.', 'The plate will be flawless.', 'Every guest served.', 'Hmph. Not on my watch.'],
  kurisu: ['Hypothesis first.', "Don't call me Christina.", "I'm not your assistant.", "Let's design this properly.", 'El Psy Kongroo.'],
  jiraiya: ['Gallant, as always.', 'My network never sleeps.', 'Sources first.', 'Leave the digging to me.', 'Gama-sennin, reporting.'],
  light: ['Naturally.', 'Too easy.', 'A step ahead.', 'One source is enough.', 'Keikaku dōri.'],
  levi: ["Don't waste my time.", 'Tch. Let me see the filth.', 'Wipe it down.', 'Every corner.', 'Rittai Kidō Sōchi.'],
  robin: ['How interesting.', 'I want to know...', 'Shall we read on?', 'Only what is written.', 'Cien Fleur.'],
}

/** What a crew member says when it falls, shown beside a fallen member in the roster. */
export const FALL_LINES: Record<string, string> = {
  senku: "Failed experiment. That's data.",
  sanji: 'Spoiled ingredient.',
  kurisu: 'The model was wrong.',
  jiraiya: 'The trail went cold.',
  light: 'An unexpected variable.',
  levi: 'Filthy.',
  robin: 'A forged inscription.',
}

/** Fall toast lines after FALL_LINES[key] (which is always the first one). */
export const FALL_MORE: Record<string, readonly string[]> = {
  senku: ["That's data, not a failure.", 'Science does not care.'],
  sanji: ["I'll remake it.", 'A sloppy plate.'],
  kurisu: ['Revising the hypothesis.', 'Wrong world line.'],
  jiraiya: ['The source dried up.', 'Even a sage slips.'],
  light: ['Noted, and corrected.', 'Predictable.'],
  levi: ['Clean it up.', 'Disgusting.'],
  robin: ['A worn inscription.', 'I will correct it.'],
}

/** Return toast lines for a report with no `Says:` line, by character. They say the crew member is back, not how the work went. */
export const RETURN_TOAST: Record<string, readonly string[]> = {
  senku: ['Experiment succeeded.', 'Science wins.', 'Hypothesis confirmed!', 'Kagaku Ōkoku!'],
  sanji: ['Served.', 'Bon appetit.', 'Flawless.', 'Order up.', 'Now that is a clean plate.', 'Merorin~'],
  kurisu: ['The design holds.', 'Hypothesis stated.', 'Options laid out.', 'It is only logical.', 'El Psy Kongroo.'],
  jiraiya: ['Intel secured.', 'Sources confirmed.', 'The network delivered.', 'Gallant work.'],
  light: ['Done. Cleanly.', 'Exactly as expected.', 'Keikaku dōri.', 'As I calculated.'],
  levi: ['Inspection done.', 'Tch. Report is in.', 'Wiped it down.', 'Every corner checked.'],
  robin: ['The record stands.', 'The record is complete.', 'Fufu. Read and recorded.', 'How interesting.'],
}

/** How long each toast stays (ms); the lines that carry a report or a promotion stay longer than a deploy. */
export const TOAST_MS = { deploy: 3000, return: 5000, fall: 6000, rankUp: 7000 } as const
/** Widest a toast line may be, in terminal cells. */
export const TOAST_CELLS = 60

/** Turn-end words for turns of a minute and a half or more, per strategist (WORDS.done covers the rest). */
export const LONG_TURN_MS = 90_000
export const TURN_LONG: Record<string, readonly string[]> = {
  shikamaru: ['Slogged through', 'Dragged through', 'Endured'],
  lelouch: ['Played the long game', 'Won the long game', 'Held the line'],
  strategist: ['Worked through'],
}

/** Model per agent, copied from roster.mjs (the plugin's roster file is a build-time input, not imported here). */
export const MODELS: Record<string, string> = {
  strategist: 'claude-opus-5-5',
  kurisu: 'claude-sonnet-5-5',
  senku: 'claude-haiku-5-5',
  sanji: 'claude-haiku-5-5',
  jiraiya: 'claude-haiku-5-5',
  light: 'claude-haiku-5-5',
  levi: 'claude-haiku-5-5',
  robin: 'claude-haiku-5-5',
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

/** The usage line: labels, bar glyphs and the percentages where the color turns. Same for every persona. */
export const USAGE_LABELS = { context: 'Chakra', stamina: 'Stamina', cost: '両' } as const
export const USAGE_BAR = { full: '▰', empty: '▱', cells: 10, compactCells: 4 } as const
/**
 * Bar glyphs per persona key (`strategist` is the neutral set). Every glyph is one cell wide in text presentation:
 * none is a CJK or emoji code point, and the chess pawn (U+265F, which many fonts draw as a two-cell emoji) is
 * avoided for the knight (U+265E).
 */
export const USAGE_BARS: Record<string, { full: string; empty: string }> = {
  strategist: { full: USAGE_BAR.full, empty: USAGE_BAR.empty },
  shikamaru: { full: '≋', empty: '∙' },
  lelouch: { full: '♞', empty: '⋅' },
}
/** The busiest rate-limit window (Stamina) is drawn only from this percent up. */
export const USAGE_STAMINA_AT = 25
export const USAGE_WARN_AT = 60
export const USAGE_HOT_AT = 85
/** Rate-limit window kind -> the short label drawn beside Stamina. */
export const WINDOW_LABELS: Record<string, string> = { five_hour: '5h', seven_day: '7d', spend_limit: 'spend' }

/** One short line at the hot threshold, by what is running out; `strategist` is for no persona on duty. */
export const USAGE_HOT_LINES: Record<string, { context: string; stamina: string }> = {
  shikamaru: { context: 'Mendokusē… compact soon', stamina: 'Mendokusē… ease off' },
  lelouch: { context: 'The board narrows. Compact.', stamina: 'The clock runs short.' },
  strategist: { context: 'Compact soon', stamina: 'Ease off' },
}

// --- rank ----------------------------------------------------------------------------------------------------------

/** Points (crew that returned successfully, cumulative) at which each rung of a ladder starts. */
export const RANK_STEPS = [0, 25, 100, 300] as const
/** Ladder per persona key; `strategist` is the neutral one and shares the Shikamaru names. */
export const RANK_LADDERS: Record<string, readonly string[]> = {
  shikamaru: ['Genin', 'Chūnin', 'Jōnin', 'Kage'],
  lelouch: ['Pawn', 'Knight', 'Rook', 'King'],
  strategist: ['Genin', 'Chūnin', 'Jōnin', 'Kage'],
}
/** Toast text on reaching rung 1, 2 or 3 (index 0 is never used), per persona key. */
export const RANK_UP_LINES: Record<string, readonly string[]> = {
  shikamaru: ['', 'More responsibility. What a drag.', 'More paperwork. Mendokusē.', 'The village is in order. Naps, finally.'],
  lelouch: ['', 'The board tilts my way.', 'No line holds against me.', 'The board is mine.'],
  strategist: ['', 'Crew record growing.', 'A steady record.', 'Top of the ladder.'],
}
/** Where the persistent points live in the plugin store. */
export const RANK_STORE_KEY = 'rank'

// --- recap ---------------------------------------------------------------------------------------------------------

/** The strategist's closing line of the mission report: all clear, some fell, or nothing deployed. */
export const RECAP_SIGNOFFS: Record<string, { clean: string; rough: string; empty: string }> = {
  shikamaru: { clean: 'Move made. Your turn.', rough: 'Not clean, but it holds. What a drag.', empty: 'Nothing deployed. The best kind of day.' },
  lelouch: { clean: 'Checkmate.', rough: 'A sacrifice was made. The board stands.', empty: 'No piece has moved. The board waits.' },
  strategist: { clean: 'All crew accounted for.', rough: 'Some of the crew fell. Check their reports.', empty: 'No crew deployed this session.' },
}

// --- gallery -------------------------------------------------------------------------------------------------------

/** Pages of /dojo-gallery, in order: the strategists, the neutral one, then the crew. */
export const GALLERY_ORDER = ['shikamaru', 'lelouch', 'strategist', 'senku', 'sanji', 'kurisu', 'jiraiya', 'light', 'levi', 'robin'] as const

/** A sample `Says:` line per character, for the gallery's speech bubble (the persona files' own examples). */
export const SAYS_SAMPLES: Record<string, string> = {
  shikamaru: 'Move made. Your turn.',
  lelouch: 'Checkmate.',
  strategist: 'Plan set. Crew deployed.',
  senku: 'Hypothesis confirmed. Get excited!',
  sanji: 'Served. Merorin~ (swooning)',
  kurisu: "The design holds. Don't call me Christina.",
  jiraiya: 'Sources confirmed. Gallant work.',
  light: 'Exactly as expected. Done. Cleanly.',
  levi: 'Mostly clean. Fix the corner I marked.',
  robin: 'The record stands. History as it was.',
}
