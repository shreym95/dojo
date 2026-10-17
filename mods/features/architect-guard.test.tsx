import { describe, expect, test } from 'claude-code/testing'

import { agent, core, edit } from '../lib/testkit'
import { architectDenyReason, isArchitectPath, normalizePath, writeTarget } from './architect-guard'

const KURISU = 'ag-kurisu'
const asKurisu = (call: unknown) => ({ ...(call as object), agentId: KURISU }) as never
const write = (file_path: string, extra: object = {}) => ({ tool: 'Write', file_path, content: 'x', ...extra }) as never
const notebook = (notebook_path: string) => ({ tool: 'NotebookEdit', notebook_path, new_source: 'x' }) as never

function crew(on: Parameters<typeof core>[0]) {
  on('agent.list', () => ({
    value: [agent(KURISU, 'dojo:kurisu'), agent('ag-senku', 'dojo:senku'), agent('ag-x', 'general-purpose')],
  }))
}

describe('architect paths', () => {
  test('writeTarget reads file_path, or notebook_path for NotebookEdit', () => {
    expect(writeTarget('Edit', { file_path: '/a.ts' })).toBe('/a.ts')
    expect(writeTarget('Write', { file_path: '/a.ts' })).toBe('/a.ts')
    expect(writeTarget('NotebookEdit', { notebook_path: '/n.ipynb', file_path: '/ignored' })).toBe('/n.ipynb')
    expect(writeTarget('Edit', {})).toBeNull()
    expect(writeTarget('Edit', { file_path: '' })).toBeNull()
  })

  test('normalizePath resolves dots and doubled slashes', () => {
    expect(normalizePath('/tmp/../home/x.ts')).toBe('/home/x.ts')
    expect(normalizePath('/a//b/./c')).toBe('/a/b/c')
    expect(normalizePath('/../../x')).toBe('/x')
    expect(normalizePath('../x')).toBe('../x')
  })

  test('scratch space and isolated worktrees are allowed', () => {
    expect(isArchitectPath('/tmp/poc/a.ts')).toBe(true)
    expect(isArchitectPath('/var/folders/ab/T/a.ts')).toBe(true)
    expect(isArchitectPath('/work/.claude/scratchpad/a.ts')).toBe(true)
    expect(isArchitectPath('/custom/tmp/a.ts', ['/custom/tmp'])).toBe(true)
    expect(isArchitectPath('/home/u/app/.claude/worktrees/agent-a1b2c3d4e5f60718/src/a.ts')).toBe(true)
  })

  test('the main working tree is not', () => {
    expect(isArchitectPath('/home/u/app/src/a.ts')).toBe(false)
    expect(isArchitectPath('/home/u/app/.claude/worktrees')).toBe(false)
    expect(isArchitectPath('/home/u/app/.claude/worktrees/agent-a1')).toBe(false)
    expect(isArchitectPath('/home/u/app/.claude/settings.json')).toBe(false)
    expect(isArchitectPath('relative/a.ts')).toBe(false)
  })

  test('a path that climbs out of scratch space is not scratch space', () => {
    expect(isArchitectPath('/tmp/../home/u/app/a.ts')).toBe(false)
    expect(isArchitectPath('/work/.claude/scratchpad/../../src/a.ts')).toBe(false)
    expect(isArchitectPath('/home/u/app/.claude/worktrees/agent-a1/../../../src/a.ts')).toBe(false)
  })

  test('the deny reason says why and where to go', () => {
    const reason = architectDenyReason('/app/a.ts')
    expect(reason).toContain('/app/a.ts')
    expect(reason).toMatch(/main working tree are not the architect's job/)
    expect(reason).toMatch(/scratchpad.*isolated worktree/)
    expect(reason).toMatch(/dojo:senku or dojo:sanji via the strategist/)
  })
})

describe('architect guard', () => {
  test('denies the architect writing to the main working tree, with a toast in Kurisu voice', async ($, on) => {
    const { ran, toasts } = core(on)
    crew(on)
    for (const call of [edit('/home/u/app/a.ts'), write('/home/u/app/b.ts'), notebook('/home/u/app/n.ipynb')]) {
      const r = await $.tool.call(asKurisu(call))
      expect(r.deny).toMatch(/main working tree are not the architect's job/)
    }
    expect(ran).toEqual([])
    expect(toasts).toHaveLength(3)
    expect(toasts[0]).toBe('🔬 Kurisu: "Writing to the main tree isn\'t my job. POCs go in the scratchpad; builders build."')
  })

  test('allows scratch space and isolated worktrees', async ($, on) => {
    const { ran, toasts } = core(on)
    crew(on)
    const ok = [
      edit('/tmp/poc/a.ts'),
      write('/work/.claude/scratchpad/poc/b.ts'),
      notebook('/tmp/n.ipynb'),
      write('/home/u/app/.claude/worktrees/agent-a1b2c3d4e5f60718/src/c.ts'),
    ]
    for (const call of ok) expect((await $.tool.call(asKurisu(call))).deny).toBeUndefined()
    expect(ran).toHaveLength(4)
    expect(toasts).toEqual([])
  })

  test('allows $TMPDIR', async ($, on) => {
    core(on, { TMPDIR: '/custom/tmp' })
    crew(on)
    expect((await $.tool.call(asKurisu(write('/custom/tmp/a.ts')))).deny).toBeUndefined()
  })

  test('denies a traversal out of scratch space', async ($, on) => {
    core(on)
    crew(on)
    expect((await $.tool.call(asKurisu(write('/tmp/../home/u/app/a.ts')))).deny).toBeDefined()
  })

  test('other agents and the main thread are never touched', async ($, on) => {
    const { ran, toasts } = core(on)
    crew(on)
    expect((await $.tool.call({ ...(edit('/home/u/app/a.ts') as object), agentId: 'ag-senku' } as never)).deny).toBeUndefined()
    expect((await $.tool.call({ ...(edit('/home/u/app/a.ts') as object), agentId: 'ag-x' } as never)).deny).toBeUndefined()
    expect((await $.tool.call({ ...(edit('/home/u/app/a.ts') as object), agentId: 'ag-unknown' } as never)).deny).toBeUndefined()
    expect((await $.tool.call(edit('/home/u/app/a.ts'))).deny).toBeUndefined()
    expect(ran).toHaveLength(4)
    expect(toasts).toEqual([])
  })

  test('other tools are not checked', async ($, on) => {
    const { ran } = core(on)
    crew(on)
    for (const call of [{ tool: 'Read', file_path: '/home/u/app/a.ts' }, { tool: 'Bash', command: 'echo x > /home/u/app/a.ts' }]) {
      expect((await $.tool.call(asKurisu(call))).deny).toBeUndefined()
    }
    expect(ran).toHaveLength(2)
  })

  test('architectGuard off', { options: { architectGuard: false } }, async ($, on) => {
    core(on)
    crew(on)
    expect((await $.tool.call(asKurisu(edit('/home/u/app/a.ts')))).deny).toBeUndefined()
  })

  test('fails open when the agent list cannot be read', async ($, on) => {
    const { ran } = core(on)
    on('agent.list', () => {
      throw new Error('boom')
    })
    expect((await $.tool.call(asKurisu(edit('/home/u/app/a.ts')))).deny).toBeUndefined()
    expect(ran).toHaveLength(1)
  })

  test('a core refusal still comes through for an allowed path', async ($, on) => {
    core(on, {}, { call: { deny: 'user said no' } })
    crew(on)
    expect((await $.tool.call(asKurisu(write('/tmp/a.ts')))).deny).toBe('user said no')
  })
})
