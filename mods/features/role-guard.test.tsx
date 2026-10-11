import { describe, expect, test } from 'claude-code/testing'

import { DOJO, core, edit, submit } from '../lib/testkit'
import { charge, countLines, delegateFor, isExemptPath, refund, roleCall } from './role-guard'
import type { Budget } from './role-guard'

describe('role guard budgets', () => {
  const limits = { files: 2, lines: 6, lookups: 3 }
  const empty: Budget = { files: [], lookups: 0 }
  const call = (tool: string, args: Record<string, unknown>) => roleCall(tool, args) as NonNullable<ReturnType<typeof roleCall>>

  test('metered calls', () => {
    expect(roleCall('Edit', { file_path: '/a.ts', new_string: 'a\nb\n' })).toEqual({ kind: 'edit', file: '/a.ts', lines: 2 })
    expect(roleCall('Write', { file_path: '/a.ts', content: 'a' })).toEqual({ kind: 'edit', file: '/a.ts', lines: null })
    expect(roleCall('NotebookEdit', { notebook_path: '/n.ipynb', new_source: 'a' })).toEqual({ kind: 'edit', file: '/n.ipynb', lines: null })
    expect(roleCall('WebSearch', { query: 'x' })).toEqual({ kind: 'lookup' })
    expect(roleCall('WebFetch', { url: 'u' })).toEqual({ kind: 'lookup' })
    expect(roleCall('Read', { file_path: '/a.ts' })).toBeNull()
    expect(roleCall('Bash', { command: 'ls' })).toBeNull()
    expect(countLines('')).toBe(0)
    expect(countLines('a')).toBe(1)
    expect(countLines('a\nb\n')).toBe(2)
  })

  test('third distinct file is over budget; the same file again is not', () => {
    let b = charge(empty, call('Edit', { file_path: '/a.ts' }), limits).budget
    b = charge(b, call('Edit', { file_path: '/b.ts' }), limits).budget
    expect(charge(b, call('Edit', { file_path: '/a.ts' }), limits).denied).toBeNull()
    const over = charge(b, call('Write', { file_path: '/c.ts' }), limits)
    expect(over.denied?.reason).toMatch(/Inline edit budget reached: 2 distinct files.*\(limit 2\).*dojo:senku/)
    expect(over.budget).toBe(b)
  })

  test('delegate by path', () => {
    expect(delegateFor('/app/src/Cart.tsx')).toBe('dojo:sanji')
    for (const ext of ['jsx', 'vue', 'svelte', 'css', 'scss', 'sass', 'less', 'html']) expect(delegateFor(`/app/x.${ext}`)).toBe('dojo:sanji')
    for (const f of ['/app/api.ts', '/app/x.py', '/app/README.md', '/app/styles.css.map']) expect(delegateFor(f)).toBe('dojo:senku')
  })

  test('a long Edit is over budget on its own', () => {
    const six = charge(empty, call('Edit', { file_path: '/a.ts', new_string: '1\n2\n3\n4\n5\n6' }), limits)
    expect(six.denied).toBeNull()
    const seven = charge(empty, call('Edit', { file_path: '/a.tsx', new_string: '1\n2\n3\n4\n5\n6\n7' }), limits)
    expect(seven.denied?.reason).toMatch(/writes 7 lines \(inline limit 6\).*dojo:sanji/)
    expect(seven.denied?.toast).toBe('frontend')
  })

  test('lookups: the fourth is over budget and points at the researchers', () => {
    let b = empty
    for (let n = 0; n < 3; n++) b = charge(b, call('WebSearch', { query: 'q' }), limits).budget
    const over = charge(b, call('WebFetch', { url: 'u' }), limits)
    expect(over.denied?.reason).toMatch(/dojo:l.*dojo:light/)
    expect(over.denied?.toast).toBe('lookups')
  })

  test('scratch space is exempt', () => {
    expect(isExemptPath('/tmp/x.ts')).toBe(true)
    expect(isExemptPath('/var/folders/ab/T/x.ts')).toBe(true)
    expect(isExemptPath('/work/.claude/scratchpad/x.ts')).toBe(true)
    expect(isExemptPath('/custom/tmp/x.ts', ['/custom/tmp'])).toBe(true)
    expect(isExemptPath('/home/u/app/tmp/x.ts')).toBe(false)
    const b = { files: ['/a.ts', '/b.ts'], lookups: 0 }
    expect(charge(b, call('Write', { file_path: '/tmp/big.ts' }), limits).denied).toBeNull()
  })

  test('refund gives back only what was spent', () => {
    const spent = charge(empty, call('Edit', { file_path: '/a.ts' }), limits)
    expect(refund(spent.budget, call('Edit', { file_path: '/a.ts' }))).toEqual(empty)
    const look = charge(empty, call('WebSearch', { query: 'q' }), limits)
    expect(refund(look.budget, call('WebSearch', { query: 'q' }))).toEqual(empty)
  })
})

describe('role guard', () => {
  test('third distinct file is denied, naming the right agent; toast in the agent voice', async ($, on) => {
    const { toasts, ran } = core(on, DOJO)
    expect((await $.tool.call(edit('/app/a.ts'))).deny).toBeUndefined()
    expect((await $.tool.call(edit('/app/b.ts'))).deny).toBeUndefined()
    expect((await $.tool.call(edit('/app/a.ts'))).deny).toBeUndefined()
    const backend = await $.tool.call(edit('/app/c.py'))
    expect(backend.deny).toMatch(/Inline edit budget reached.*dojo:senku/)
    const frontend = await $.tool.call(edit('/app/Cart.tsx'))
    expect(frontend.deny).toMatch(/dojo:sanji/)
    expect(ran).toHaveLength(3)
    expect(toasts).toEqual([
      '🧪 Senku: "That is a lab job. Hand it over, and get excited."',
      '🍳 Sanji: "The kitchen is mine. Allow me to plate that."',
    ])
  })

  test('Write and NotebookEdit count as files', async ($, on) => {
    core(on, DOJO)
    expect((await $.tool.call({ tool: 'Write', file_path: '/app/a.ts', content: 'x' } as never)).deny).toBeUndefined()
    expect((await $.tool.call({ tool: 'NotebookEdit', notebook_path: '/app/n.ipynb', new_source: 'x' } as never)).deny).toBeUndefined()
    expect((await $.tool.call({ tool: 'Write', file_path: '/app/b.ts', content: 'x' } as never)).deny).toMatch(/dojo:senku/)
  })

  test('a long Edit is denied', async ($, on) => {
    core(on, DOJO)
    expect((await $.tool.call(edit('/app/a.ts', '1\n2\n3\n4\n5\n6'))).deny).toBeUndefined()
    expect((await $.tool.call(edit('/app/b.css', '1\n2\n3\n4\n5\n6\n7'))).deny).toMatch(/7 lines \(inline limit 6\).*dojo:sanji/)
  })

  test('budgets come from options', { options: { inlineEditFiles: 1, inlineEditLines: 2, inlineLookups: 1 } }, async ($, on) => {
    core(on, DOJO)
    expect((await $.tool.call(edit('/app/a.ts', '1\n2'))).deny).toBeUndefined()
    expect((await $.tool.call(edit('/app/b.ts'))).deny).toMatch(/limit 1/)
    expect((await $.tool.call(edit('/app/a.ts', '1\n2\n3'))).deny).toMatch(/3 lines \(inline limit 2\)/)
    expect((await $.tool.call({ tool: 'WebSearch', query: 'a' } as never)).deny).toBeUndefined()
    expect((await $.tool.call({ tool: 'WebSearch', query: 'b' } as never)).deny).toMatch(/limit 1/)
  })

  test('scratch paths are exempt', async ($, on) => {
    core(on, DOJO)
    for (const f of ['/tmp/a.ts', '/tmp/b.ts', '/tmp/c.ts', '/work/scratchpad/d.ts']) {
      expect((await $.tool.call(edit(f, '1\n2\n3\n4\n5\n6\n7\n8'))).deny).toBeUndefined()
    }
    expect((await $.tool.call(edit('/app/a.ts'))).deny).toBeUndefined()
    expect((await $.tool.call(edit('/app/b.ts'))).deny).toBeUndefined()
  })

  test('a new prompt resets the budget', async ($, on) => {
    core(on, DOJO)
    await $.tool.call(edit('/app/a.ts'))
    await $.tool.call(edit('/app/b.ts'))
    expect((await $.tool.call(edit('/app/c.ts'))).deny).toBeDefined()
    await $.prompt.submit(submit)
    expect((await $.tool.call(edit('/app/c.ts'))).deny).toBeUndefined()
  })

  test('lookups: the fourth is denied toward dojo:l and dojo:light; toast in L voice', async ($, on) => {
    const { toasts } = core(on, DOJO)
    for (const tool of ['WebSearch', 'WebFetch', 'WebSearch']) expect((await $.tool.call({ tool } as never)).deny).toBeUndefined()
    const r = await $.tool.call({ tool: 'WebFetch', url: 'u', prompt: 'p' } as never)
    expect(r.deny).toMatch(/dojo:l\b.*dojo:light/)
    expect(toasts).toEqual(['🍰 L: "Hm. Too many searches for one head. Delegate the investigation."'])
  })

  test('a call core refuses gives its budget back', async ($, on) => {
    core(on, DOJO, { call: { deny: 'user said no' } })
    for (const f of ['/app/a.ts', '/app/b.ts', '/app/c.ts', '/app/d.ts']) {
      expect((await $.tool.call(edit(f))).deny).toBe('user said no')
    }
    for (let n = 0; n < 5; n++) expect((await $.tool.call({ tool: 'WebSearch', query: 'q' } as never)).deny).toBe('user said no')
  })

  test('subagent calls are never touched', async ($, on) => {
    const { ran, toasts } = core(on, DOJO)
    for (const f of ['/a.ts', '/b.ts', '/c.ts', '/d.tsx']) {
      expect((await $.tool.call({ ...(edit(f, '1\n2\n3\n4\n5\n6\n7\n8') as object), agentId: 'ag-1' } as never)).deny).toBeUndefined()
    }
    for (let n = 0; n < 5; n++) expect((await $.tool.call({ tool: 'WebSearch', query: 'q', agentId: 'ag-1' } as never)).deny).toBeUndefined()
    expect(ran).toHaveLength(9)
    expect(toasts).toEqual([])
    // and they spend nothing from the main thread's budget
    expect((await $.tool.call(edit('/app/a.ts'))).deny).toBeUndefined()
    expect((await $.tool.call(edit('/app/b.ts'))).deny).toBeUndefined()
  })

  test('outside a dojo session nothing is metered', async ($, on) => {
    const { ran } = core(on, {})
    for (const f of ['/a.ts', '/b.ts', '/c.ts', '/d.ts']) expect((await $.tool.call(edit(f, '1\n2\n3\n4\n5\n6\n7\n8'))).deny).toBeUndefined()
    for (let n = 0; n < 5; n++) await $.tool.call({ tool: 'WebSearch', query: 'q' } as never)
    expect(ran).toHaveLength(9)
  })

  test('roleGuard off', { options: { roleGuard: false } }, async ($, on) => {
    core(on, DOJO)
    for (const f of ['/a.ts', '/b.ts', '/c.ts']) expect((await $.tool.call(edit(f))).deny).toBeUndefined()
  })

  test('other tools are not metered', async ($, on) => {
    core(on, DOJO)
    for (let n = 0; n < 6; n++) {
      expect((await $.tool.call({ tool: 'Read', file_path: `/app/${n}.ts` } as never)).deny).toBeUndefined()
      expect((await $.tool.call({ tool: 'Bash', command: 'ls' } as never)).deny).toBeUndefined()
    }
  })
})
