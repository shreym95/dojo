import { describe, expect, test } from 'claude-code/testing'

import { CREW, NEUTRAL, STRATEGISTS, WORDS, accentFor, colorFor, legible, resolveMode } from './theme'
import { paint } from './visuals/transcript-lib'

const PALETTE: Record<string, [string, string]> = {
  shikamaru: ['#5B8C5A', '#A3B18A'],
  lelouch: ['#6A0DAD', '#D4AF37'],
  senku: ['#8BC34A', '#00BCD4'],
  sanji: ['#F4C430', '#1E3A8A'],
  l: ['#E0E0E0', '#6B7280'],
  light: ['#B22222', '#9CA3AF'],
  levi: ['#708090', '#2F4F4F'],
  robin: ['#E07AA5', '#4B3B6B'],
  strategist: ['#94A3B8', '#CBD5E1'],
}

const everyone = [...Object.values(STRATEGISTS), NEUTRAL, ...Object.values(CREW)]

describe('theme', () => {
  test('every character has its palette color and accent', () => {
    expect(everyone.map(t => t.key).sort()).toEqual(Object.keys(PALETTE).sort())
    for (const t of everyone) expect([t.color, t.accent]).toEqual(PALETTE[t.key])
  })

  test('colors are hex the render path accepts', () => {
    for (const t of everyone) {
      expect(t.color).toMatch(/^#[0-9A-F]{6}$/)
      expect(t.accent).toMatch(/^#[0-9A-F]{6}$/)
    }
  })

  test('records are keyed by the character key and carry name, role and emoji', () => {
    for (const [key, t] of Object.entries({ ...STRATEGISTS, ...CREW })) expect(t.key).toBe(key)
    for (const t of everyone) {
      expect(t.name).not.toBe('')
      expect(t.role).not.toBe('')
      expect(t.emoji).not.toBe('')
    }
  })

  test('every character has spinner words, frames and a deploy line; strategists have done words', () => {
    for (const t of everyone) {
      const w = WORDS[t.key]
      expect(w?.verbs.length).toBeGreaterThan(0)
      expect(w?.frames.length).toBeGreaterThan(0)
      expect(typeof w?.deploy).toBe('string')
    }
    for (const t of [...Object.values(STRATEGISTS), NEUTRAL]) expect(WORDS[t.key]?.done?.length).toBeGreaterThan(0)
    for (const t of Object.values(CREW)) expect(WORDS[t.key]?.done).toBeUndefined()
  })
})

/** WCAG 2.x contrast ratio between two #RRGGBB colors. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map(i => {
      const v = parseInt(hex.slice(i, i + 2), 16) / 255
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
    }) as [number, number, number]
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

describe('palette modes', () => {
  test('every light color and accent reads at 4.5:1 or better on white', () => {
    for (const t of everyone) {
      expect(t.lightColor).toMatch(/^#[0-9A-F]{6}$/)
      expect(t.lightAccent).toMatch(/^#[0-9A-F]{6}$/)
      expect(contrast(t.lightColor, '#FFFFFF'), `${t.key} lightColor`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(t.lightAccent, '#FFFFFF'), `${t.key} lightAccent`).toBeGreaterThanOrEqual(4.5)
    }
  })

  test('dark returns the authored colors, lifted only where they fail on black; the primary colors that were readable stay readable', () => {
    for (const t of everyone) {
      expect(colorFor(t.key, 'dark')).toBe(contrast(t.color, '#000000') >= 4.5 ? t.color : legible(t.color))
      expect(accentFor(t.key, 'dark')).toBe(contrast(t.accent, '#000000') >= 4.5 ? t.accent : legible(t.accent))
    }
    // Dark values are lifted here, where they are chosen, so the chrome and the transcript draw the same readable color.
    for (const key of ['shikamaru', 'senku', 'sanji', 'l', 'robin', 'levi', 'strategist']) {
      expect(contrast(colorFor(key, 'dark'), '#000000'), `${key} color`).toBeGreaterThanOrEqual(4.5)
    }
  })

  test('light returns the light pair; an unknown key falls back to the neutral strategist', () => {
    for (const t of everyone) {
      expect(colorFor(t.key, 'light')).toBe(t.lightColor)
      expect(accentFor(t.key, 'light')).toBe(t.lightAccent)
    }
    expect(colorFor('nobody', 'light')).toBe(NEUTRAL.lightColor)
    expect(accentFor('nobody', 'light')).toBe(NEUTRAL.lightAccent)
    expect(colorFor('nobody', 'dark')).toBe(NEUTRAL.color)
    expect(accentFor('nobody', 'dark')).toBe(NEUTRAL.accent)
  })

  test('a light color is darker than its dark original (the hue is kept, only the lightness drops)', () => {
    for (const t of everyone) {
      expect(contrast(t.lightColor, '#FFFFFF')).toBeGreaterThanOrEqual(contrast(t.color, '#FFFFFF'))
      expect(contrast(t.lightAccent, '#FFFFFF')).toBeGreaterThanOrEqual(contrast(t.accent, '#FFFFFF'))
    }
  })

  test('resolveMode: an explicit setting wins, auto follows the engine theme name', () => {
    expect(resolveMode('dark', 'light')).toBe('dark')
    expect(resolveMode('light', 'dark')).toBe('light')
    expect(resolveMode('auto', 'light')).toBe('light')
    expect(resolveMode('auto', 'Light-ANSI')).toBe('light')
    expect(resolveMode('auto', 'light-daltonized')).toBe('light')
    expect(resolveMode('auto', 'dark')).toBe('dark')
    expect(resolveMode('auto', 'dark-ansi')).toBe('dark')
    expect(resolveMode(undefined, 'LIGHT')).toBe('light')
    expect(resolveMode(undefined, undefined)).toBe('dark')
    expect(resolveMode('weird', 42)).toBe('dark')
    expect(resolveMode(null, null)).toBe('dark')
  })
})

describe('dark palette on black', () => {
  test('every dark color and accent reads at 4.5:1 or better on #000000', () => {
    for (const t of everyone) {
      expect(colorFor(t.key, 'dark'), `${t.key} color`).toMatch(/^#[0-9A-F]{6}$/)
      expect(accentFor(t.key, 'dark'), `${t.key} accent`).toMatch(/^#[0-9A-F]{6}$/)
      expect(contrast(colorFor(t.key, 'dark'), '#000000'), `${t.key} color`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(accentFor(t.key, 'dark'), '#000000'), `${t.key} accent`).toBeGreaterThanOrEqual(4.5)
    }
    expect(contrast(colorFor('nobody', 'dark'), '#000000')).toBeGreaterThanOrEqual(4.5)
  })

  test('the lift is the legible() of the authored color; what already read stays exactly as authored', () => {
    for (const t of everyone) {
      expect(colorFor(t.key, 'dark')).toBe(legible(t.color))
      expect(accentFor(t.key, 'dark')).toBe(legible(t.accent))
      if (contrast(t.color, '#000000') >= 4.5) expect(colorFor(t.key, 'dark')).toBe(t.color)
      if (contrast(t.accent, '#000000') >= 4.5) expect(accentFor(t.key, 'dark')).toBe(t.accent)
    }
  })

  test('the colors that failed on black are lifted to these values', () => {
    expect(colorFor('lelouch', 'dark')).toBe('#9E62CA')
    expect(colorFor('light', 'dark')).toBe('#C55959')
    expect(accentFor('sanji', 'dark')).toBe('#6275AD')
    expect(accentFor('levi', 'dark')).toBe('#637B7B')
    expect(accentFor('robin', 'dark')).toBe('#817697')
    expect(accentFor('l', 'dark')).toBe('#727986')
  })

  test('legible: lifts toward white in steps, is idempotent, and leaves non-hex values alone', () => {
    for (const t of everyone) {
      for (const hex of [t.color, t.accent]) expect(legible(legible(hex))).toBe(legible(hex))
    }
    expect(legible('#000000')).toMatch(/^#[0-9A-F]{6}$/)
    expect(contrast(legible('#000000'), '#000000')).toBeGreaterThanOrEqual(4.5)
    expect(legible('#FFFFFF')).toBe('#FFFFFF')
    expect(legible('error')).toBe('error')
    expect(legible('#abc')).toBe('#abc')
  })

  test('the transcript paints with the lifted colors, so it reads on black with no lift of its own', () => {
    for (const t of everyone) {
      const painted = paint(t, 'dark')
      expect(painted.color).toBe(colorFor(t.key, 'dark'))
      expect(painted.accent).toBe(accentFor(t.key, 'dark'))
      expect(contrast(painted.color, '#000000'), `${t.key} color`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(painted.accent, '#000000'), `${t.key} accent`).toBeGreaterThanOrEqual(4.5)
    }
  })

  test('light is untouched by the lift', () => {
    for (const t of everyone) {
      expect(colorFor(t.key, 'light')).toBe(t.lightColor)
      expect(accentFor(t.key, 'light')).toBe(t.lightAccent)
    }
  })
})
