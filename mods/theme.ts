// The one place that says who each dojo character is. Both visual modules read it; neither owns it.
// Keys match the dojo roster (`dojo:<key>` agent types; strategists are personas).
// Colors are hex: the render path accepts a theme key, a name or hex (^[#a-zA-Z0-9_().,% -]{1,40}$).

export type Theme = {
  key: string
  name: string
  role: string
  emoji: string
  /** Primary color of the character: text, frames, badges. */
  color: string
  /** Secondary color: borders, highlights, dim detail. */
  accent: string
}

export const STRATEGISTS: Record<string, Theme> = {
  shikamaru: { key: 'shikamaru', name: 'Shikamaru', role: 'strategist', emoji: '🦌', color: '#5B8C5A', accent: '#A3B18A' },
  lelouch: { key: 'lelouch', name: 'Lelouch', role: 'strategist', emoji: '♟️', color: '#6A0DAD', accent: '#D4AF37' },
}

/** Used when no persona is detected (and DOJO_STRATEGIST is unset). */
export const NEUTRAL: Theme = {
  key: 'strategist',
  name: 'Strategist',
  role: 'strategist',
  emoji: '🎴',
  color: '#94A3B8',
  accent: '#CBD5E1',
}

export const CREW: Record<string, Theme> = {
  senku: { key: 'senku', name: 'Senku', role: 'backend', emoji: '🧪', color: '#8BC34A', accent: '#00BCD4' },
  sanji: { key: 'sanji', name: 'Sanji', role: 'frontend', emoji: '🍳', color: '#F4C430', accent: '#1E3A8A' },
  l: { key: 'l', name: 'L', role: 'deep research', emoji: '🍰', color: '#E0E0E0', accent: '#6B7280' },
  light: { key: 'light', name: 'Light', role: 'quick fact', emoji: '📓', color: '#B22222', accent: '#9CA3AF' },
  levi: { key: 'levi', name: 'Levi', role: 'QA', emoji: '🧹', color: '#708090', accent: '#2F4F4F' },
  robin: { key: 'robin', name: 'Robin', role: 'docs', emoji: '🌸', color: '#E07AA5', accent: '#4B3B6B' },
}

export const FELL_EMOJI = '💀'

/** Spinner, band and toast wording for one character, keyed like the themes above. */
export type Words = {
  /** Spinner verbs (present participle), rotated per turn. */
  verbs: readonly string[]
  /** Band animation frames, cycled by the clock. Single-width glyphs. */
  frames: readonly string[]
  /** Toast line on deploy (crew only). */
  deploy: string
  /** TurnDuration past-tense words (strategists only). */
  done?: readonly string[]
}

export const WORDS: Record<string, Words> = {
  shikamaru: {
    verbs: ['Shadow-possessing', 'Reading the board', 'Sighing strategically', 'Mendokusē-ing', 'Locking scope', 'Binding the last risk'],
    frames: ['◐', '◓', '◑', '◒'],
    deploy: 'Mendokusē.',
    done: ['Outmaneuvered', 'Shadow-bound', 'Sighed through'],
  },
  lelouch: {
    verbs: ['Commanding', 'Geass-ing', 'Plotting checkmate', 'Moving the pieces', 'Dispatching the Black Knights', 'Staging the Requiem'],
    frames: ['♙', '♘', '♗', '♖'],
    deploy: 'Kneel, bugs.',
    done: ['Checkmated', 'Commanded', 'Geass-ed'],
  },
  strategist: {
    verbs: ['Strategizing', 'Planning', 'Moving the pieces', 'Reading the board'],
    frames: ['◐', '◓', '◑', '◒'],
    deploy: '',
    done: ['Strategized', 'Outplanned'],
  },
  senku: {
    verbs: ['Science-ing', 'Ten-billion-percenting', 'Brewing Revival Fluid', 'Building from scratch', 'Getting excited'],
    frames: ['⚗', '⚛', '✧', '⚛'],
    deploy: 'Ten billion percent doable.',
  },
  sanji: {
    verbs: ['Plating', 'Diable-Jambe-ing', 'Concassé-ing', 'Seasoning', 'Mouton-Shotting'],
    frames: ['♨', '≈', '∿', '≈'],
    deploy: 'Allow me.',
  },
  l: {
    verbs: ['Deducing', 'Crouching thoughtfully', 'Eliminating suspects', 'Weighing sweets', 'Closing the case'],
    frames: ['◔', '◑', '◕', '●'],
    deploy: 'Hm. A suspect with two alibis.',
  },
  light: {
    verbs: ['Writing in the notebook', 'Calculating', 'Staying a step ahead', 'Reading the source', 'Smirking'],
    frames: ['✎', '✐', '✑', '✐'],
    deploy: 'Just as planned.',
  },
  levi: {
    verbs: ['Inspecting', 'Scrubbing', 'Wiping it down', 'Checking the corners', 'Tch-ing'],
    frames: ['⚔', '⟋', '⟍', '✕'],
    deploy: 'Chi. Show me the mess.',
  },
  robin: {
    verbs: ['Deciphering', 'Blooming arms', 'Reading the Poneglyph', 'Cien-Fleur-ing', 'Pinning a stale claim'],
    frames: ['❀', '✿', '❁', '✾'],
    deploy: "Fufu. I'll decipher it.",
  },
}
