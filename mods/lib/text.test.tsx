import { describe, expect, test } from 'claude-code/testing'

import { pick, summarizeTool, truncate } from './text'

describe('helpers', () => {
  test('summarizeTool', () => {
    expect(summarizeTool('Bash', { command: 'npm  test\n' })).toBe('Bash: npm test')
    expect(summarizeTool('Read', { file_path: '/a/b.ts' })).toBe('Read: /a/b.ts')
    expect(summarizeTool('Weird', {})).toBe('Weird')
  })
  test('truncate cuts to the width with an ellipsis', () => {
    expect(truncate('abcdef', 4)).toBe('abc…')
    expect(truncate('abc', 3)).toBe('abc')
    expect(truncate('abc', 0)).toBe('')
  })
  test('pick rotates per turn and per salt', () => {
    expect([0, 1, 2, 3].map(n => pick(['a', 'b', 'c'], n))).toEqual(['a', 'b', 'c', 'a'])
    expect(pick(['a', 'b', 'c'], 0, 'x')).toBe(pick(['a', 'b', 'c'], 0, 'x'))
  })
})
