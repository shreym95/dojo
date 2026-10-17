// The one place that says who each dojo character is. Both visual modules read it; neither owns it.
// Keys match the dojo roster (`dojo:<key>` agent types; strategists are personas).
// Colors are hex: the render path accepts a theme key, a name or hex (^[#a-zA-Z0-9_().,% -]{1,40}$).

export type Theme = {
  key: string
  name: string
  role: string
  emoji: string
  /** Primary color of the character as authored (text, frames, badges); `colorFor` is what gets drawn. */
  color: string
  /** Secondary color as authored (borders, highlights, dim detail); `accentFor` is what gets drawn. */
  accent: string
  /** `color` for light terminal themes: same hue, at least 4.5:1 on white. */
  lightColor: string
  /** `accent` for light terminal themes: same hue, at least 4.5:1 on white. */
  lightAccent: string
}

export const STRATEGISTS: Record<string, Theme> = {
  shikamaru: { key: 'shikamaru', name: 'Shikamaru', role: 'strategist', emoji: '🦌', color: '#5B8C5A', accent: '#A3B18A', lightColor: '#538052', lightAccent: '#6C7B52' },
  lelouch: { key: 'lelouch', name: 'Lelouch', role: 'strategist', emoji: '♟️', color: '#6A0DAD', accent: '#D4AF37', lightColor: '#6A0DAD', lightAccent: '#8C721E' },
}

/** Used when no persona is detected (and DOJO_STRATEGIST is unset). */
export const NEUTRAL: Theme = {
  key: 'strategist',
  name: 'Strategist',
  role: 'strategist',
  emoji: '🎴',
  color: '#94A3B8',
  accent: '#CBD5E1',
  lightColor: '#627793',
  lightAccent: '#5A789D',
}

export const CREW: Record<string, Theme> = {
  senku: { key: 'senku', name: 'Senku', role: 'backend', emoji: '🧪', color: '#8BC34A', accent: '#00BCD4', lightColor: '#59812B', lightAccent: '#008192' },
  sanji: { key: 'sanji', name: 'Sanji', role: 'frontend', emoji: '🍳', color: '#F4C430', accent: '#1E3A8A', lightColor: '#937108', lightAccent: '#1E3A8A' },
  kurisu: { key: 'kurisu', name: 'Kurisu', role: 'architect', emoji: '🔬', color: '#C0522D', accent: '#E8C4A8', lightColor: '#A8441F', lightAccent: '#8F5A3C' },
  jiraiya: { key: 'jiraiya', name: 'Jiraiya', role: 'web research', emoji: '🐸', color: '#2E9E7F', accent: '#D8D0B8', lightColor: '#1F7A5F', lightAccent: '#7A7058' },
  light: { key: 'light', name: 'Light', role: 'quick fact', emoji: '📓', color: '#B22222', accent: '#9CA3AF', lightColor: '#B22222', lightAccent: '#6C7586' },
  levi: { key: 'levi', name: 'Levi', role: 'QA', emoji: '🧹', color: '#708090', accent: '#2F4F4F', lightColor: '#687786', lightAccent: '#2F4F4F' },
  robin: { key: 'robin', name: 'Robin', role: 'docs', emoji: '🌸', color: '#E07AA5', accent: '#4B3B6B', lightColor: '#D13A7A', lightAccent: '#4B3B6B' },
}

export type PaletteMode = 'dark' | 'light'

const everyone = (): Theme[] => [...Object.values(STRATEGISTS), NEUTRAL, ...Object.values(CREW)]

const themeOf = (key: string): Theme => everyone().find(t => t.key === key) ?? NEUTRAL

const channel = (v: number) => {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}

/** The hex lightened toward white until it holds 4.5:1 against a black terminal; light colors come back as given. */
export function legible(hex: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex
  const n = parseInt(hex.slice(1), 16)
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const mixed = rgb.map(c => Math.round(c + (255 - c) * t))
    const out = '#' + mixed.map(c => c.toString(16).padStart(2, '0')).join('').toUpperCase()
    if (luminance(out) >= 0.18) return out
  }
  return '#FFFFFF'
}

/**
 * The primary color of character `key` for `mode`; an unknown key gets the neutral strategist's. Dark is the authored
 * color lifted until it reads at 4.5:1 on black (`legible`); light is the character's own light-terminal color.
 */
export function colorFor(key: string, mode: PaletteMode): string {
  const t = themeOf(key)
  return mode === 'light' ? t.lightColor : legible(t.color)
}

/** The accent color of character `key` for `mode`, lifted for dark the way `colorFor` is; an unknown key gets the neutral strategist's. */
export function accentFor(key: string, mode: PaletteMode): string {
  const t = themeOf(key)
  return mode === 'light' ? t.lightAccent : legible(t.accent)
}

/**
 * The palette to draw with. `setting` is the userConfig `paletteMode` (`auto`, `dark` or `light`); `auto`, or anything
 * else, follows the engine theme: light when its name contains "light", dark otherwise.
 */
export function resolveMode(setting: unknown, engineTheme: unknown): PaletteMode {
  if (setting === 'dark' || setting === 'light') return setting
  return typeof engineTheme === 'string' && engineTheme.toLowerCase().includes('light') ? 'light' : 'dark'
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
  kurisu: {
    verbs: ['Forming a hypothesis', 'Sketching the design', 'Weighing the options', 'Running a thought test', 'Reading the world line'],
    frames: ['◜', '◝', '◞', '◟'],
    deploy: "I'll run the numbers.",
  },
  jiraiya: {
    verbs: ['Gathering intel', 'Working the network', 'Summoning a toad', 'Chasing a lead', 'Verifying the source'],
    frames: ['◔', '◑', '◕', '●'],
    deploy: 'The spy network is moving.',
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
