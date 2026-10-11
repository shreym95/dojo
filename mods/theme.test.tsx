import { describe, expect, test } from 'claude-code/testing'

import { CREW, NEUTRAL, STRATEGISTS, WORDS } from './theme'

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
