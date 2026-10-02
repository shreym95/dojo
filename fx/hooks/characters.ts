// dojo-fx character data: the one place to edit emoji, verbs, frames and toast lines.
// Keys match the dojo roster (`dojo:<key>` agent types; strategists are personas).

export type Character = {
  name: string
  emoji: string
  /** Spinner verbs (present participle), rotated per turn. */
  verbs: readonly string[]
  /** Band animation frames, cycled by the clock. Single-width glyphs. */
  frames: readonly string[]
  /** Toast line on deploy (crew only). */
  deploy: string
  /** TurnDuration past-tense words (strategists only). */
  done?: readonly string[]
}

export const STRATEGISTS: Record<string, Character> = {
  shikamaru: {
    name: 'Shikamaru',
    emoji: '🦌',
    verbs: ['Shadow-possessing', 'Reading the board', 'Sighing strategically', 'Mendokusē-ing', 'Locking scope', 'Binding the last risk'],
    frames: ['◐', '◓', '◑', '◒'],
    deploy: 'Mendokusē.',
    done: ['Outmaneuvered', 'Shadow-bound', 'Sighed through'],
  },
  lelouch: {
    name: 'Lelouch',
    emoji: '♟️',
    verbs: ['Commanding', 'Geass-ing', 'Plotting checkmate', 'Moving the pieces', 'Dispatching the Black Knights', 'Staging the Requiem'],
    frames: ['♙', '♘', '♗', '♖'],
    deploy: 'Kneel, bugs.',
    done: ['Checkmated', 'Commanded', 'Geass-ed'],
  },
}

/** Used when no persona is detected (and DOJO_STRATEGIST is unset). */
export const NEUTRAL: Character = {
  name: 'Strategist',
  emoji: '🎴',
  verbs: ['Strategizing', 'Planning', 'Moving the pieces', 'Reading the board'],
  frames: ['◐', '◓', '◑', '◒'],
  deploy: '',
  done: ['Strategized', 'Outplanned'],
}

export const CREW: Record<string, Character> = {
  senku: {
    name: 'Senku',
    emoji: '🧪',
    verbs: ['Science-ing', 'Ten-billion-percenting', 'Brewing Revival Fluid', 'Building from scratch', 'Getting excited'],
    frames: ['⚗', '⚛', '✧', '⚛'],
    deploy: 'Ten billion percent doable.',
  },
  sanji: {
    name: 'Sanji',
    emoji: '🍳',
    verbs: ['Plating', 'Diable-Jambe-ing', 'Concassé-ing', 'Seasoning', 'Mouton-Shotting'],
    frames: ['♨', '≈', '∿', '≈'],
    deploy: 'Allow me.',
  },
  l: {
    name: 'L',
    emoji: '🍰',
    verbs: ['Deducing', 'Crouching thoughtfully', 'Eliminating suspects', 'Weighing sweets', 'Closing the case'],
    frames: ['◔', '◑', '◕', '●'],
    deploy: 'Hm. A suspect with two alibis.',
  },
  light: {
    name: 'Light',
    emoji: '📓',
    verbs: ['Writing in the notebook', 'Calculating', 'Staying a step ahead', 'Reading the source', 'Smirking'],
    frames: ['✎', '✐', '✑', '✐'],
    deploy: 'Just as planned.',
  },
  levi: {
    name: 'Levi',
    emoji: '🧹',
    verbs: ['Inspecting', 'Scrubbing', 'Wiping it down', 'Checking the corners', 'Tch-ing'],
    frames: ['⚔', '⟋', '⟍', '✕'],
    deploy: 'Chi. Show me the mess.',
  },
  robin: {
    name: 'Robin',
    emoji: '🌸',
    verbs: ['Deciphering', 'Blooming arms', 'Reading the Poneglyph', 'Cien-Fleur-ing', 'Pinning a stale claim'],
    frames: ['❀', '✿', '❁', '✾'],
    deploy: "Fufu. I'll decipher it.",
  },
}

export const FELL_EMOJI = '💀'
