import { describe, expect, test } from 'claude-code/testing'

import { TRAILER, bash, core, heredoc } from '../lib/testkit'
import { checkCommitCommand, commitDenyReason, extractCommits } from './commit-gate'

describe('shell and commit parsing', () => {
  const one = (cmd: string) => extractCommits(cmd).map(c => c.messages)

  test('quotes, repeated -m, --message, clusters', () => {
    expect(one('git commit -m "feat: a"')).toEqual([['feat: a']])
    expect(one("git commit -m 'fix: b'")).toEqual([['fix: b']])
    expect(one('git commit -m "feat: a" -m "Co-Authored-By: Claude"')).toEqual([['feat: a', 'Co-Authored-By: Claude']])
    expect(one('git commit --message="docs: c"')).toEqual([['docs: c']])
    expect(one('git commit --message "docs: c" --no-verify')).toEqual([['docs: c']])
    expect(one('git commit -am "chore: d"')).toEqual([['chore: d']])
    expect(one('git commit -m"chore: e"')).toEqual([['chore: e']])
    expect(one("git commit -m 'it'\\''s fine'")).toEqual([["it's fine"]])
  })

  test('heredoc form', () => {
    expect(one(heredoc('feat: add x\n\nCo-Authored-By: Claude'))).toEqual([['feat: add x\n\nCo-Authored-By: Claude']])
    expect(one(`git add . && ${heredoc('fix: y')}`)).toEqual([['fix: y']])
    expect(one(`git commit -m "$(cat <<EOF\nfix: plain delimiter\nEOF\n)"`)).toEqual([['fix: plain delimiter']])
    expect(one(`git commit -m "$(cat <<-'EOF'\n\tfix: tabs\n\tEOF\n)"`)).toEqual([['fix: tabs']])
  })

  test('finds git commit in compound commands and wrappers', () => {
    expect(one('cd app && git add -A && git commit -m "feat: z" && git push')).toEqual([['feat: z']])
    expect(one('git -C /repo commit -m "feat: z"')).toEqual([['feat: z']])
    expect(one('FOO=1 git commit -m "feat: z"')).toEqual([['feat: z']])
    expect(one(`bash -c 'git commit -m "feat: nested"'`)).toEqual([['feat: nested']])
    expect(one('git commit -m "feat: one"; git commit -m "fix: two"')).toEqual([['feat: one'], ['fix: two']])
  })

  test('fails open on what it cannot read', () => {
    expect(one('git commit')).toEqual([])
    expect(one('git commit --amend')).toEqual([])
    expect(one('git commit --amend --no-edit')).toEqual([])
    expect(one('git commit -F msg.txt')).toEqual([])
    expect(one('git commit -F - <<\'EOF\'\nanything\nEOF')).toEqual([])
    expect(one('git commit -C HEAD')).toEqual([])
    expect(one('git commit --fixup HEAD~1')).toEqual([])
    expect(one('git commit -m "$(date)"')).toEqual([])
    expect(one('git commit -m "$MSG"')).toEqual([])
    expect(one('git commit -m')).toEqual([])
    expect(one('git status')).toEqual([])
  })

  test('text that merely mentions git commit is not a commit', () => {
    expect(one('echo "git commit -m bad"')).toEqual([])
    expect(one("cat <<'EOF' > notes.md\ngit commit -m 'bad'\nEOF")).toEqual([])
    expect(one('# git commit -m "bad"')).toEqual([])
  })
})

describe('commit rules', () => {
  const check = (cmd: string, trailer = TRAILER) => checkCommitCommand(cmd, trailer)

  test('a clean commit passes', () => {
    expect(check('git commit -m "feat(api)!: add exports"')).toEqual([])
    expect(check(heredoc(`fix: stream csv\n\n${TRAILER}`))).toEqual([])
    expect(check(`git commit -m "fix: stream csv" -m "${TRAILER}"`)).toEqual([])
    expect(check('git commit -m "revert: bad merge"')).toEqual([])
  })

  test('subject must be Conventional Commits and at most 72 characters', () => {
    expect(check('git commit -m "added stuff"')[0]).toMatch(/not Conventional Commits.*"added stuff"/)
    expect(check('git commit -m "feat:missing space"')).toHaveLength(1)
    expect(check('git commit -m "feature: nope"')).toHaveLength(1)
    const long = `feat: ${'x'.repeat(67)}`
    expect([...long]).toHaveLength(73)
    expect(check(`git commit -m "${long}"`)).toEqual(['the subject is 73 characters; the limit is 72'])
    expect(check(`git commit -m "feat: ${'x'.repeat(66)}"`)).toEqual([])
  })

  test('no body paragraphs', () => {
    const v = check(heredoc('feat: a\n\nThis explains the change in prose.\n\nCo-Authored-By: Claude'))
    expect(v).toHaveLength(1)
    expect(v[0]).toMatch(/has a body \("This explains the change in prose\."\)/)
    expect(check('git commit -m "feat: a" -m "a second paragraph"')[0]).toMatch(/has a body/)
  })

  test('Co-Authored-By naming Claude must equal the trailer', () => {
    const v = check(heredoc('feat: a\n\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>'))
    expect(v).toEqual([`the Co-Authored-By line "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" must be exactly "${TRAILER}"`])
    expect(check(heredoc('feat: a\n\nCo-Authored-By: Someone <s@x.dev>'))).toEqual([])
    expect(check(heredoc('feat: a\n\nco-authored-by: claude'))).toHaveLength(1)
    // a custom trailer is the standard; an empty one switches the check off
    expect(check(heredoc('feat: a\n\nCo-Authored-By: Claude Opus'), 'Co-Authored-By: Claude Opus')).toEqual([])
    expect(check(heredoc('feat: a\n\nCo-Authored-By: Claude Opus'), '')).toEqual([])
  })

  test('no Claude-Session line and no Generated-with text', () => {
    expect(check(heredoc('feat: a\n\nClaude-Session: abc123'))).toEqual(['a "Claude-Session:" line is not allowed'])
    const v = check(heredoc('feat: a\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'))
    expect(v).toEqual(['"Generated with Claude Code" text is not allowed'])
  })

  test('every violation is listed, each once, with the corrected trailer', () => {
    const v = check(heredoc('Added a thing\n\nlong prose\n\nClaude-Session: s1\n\nCo-Authored-By: Claude <x@y.z>'))
    expect(v).toHaveLength(4)
    const reason = commitDenyReason(v, TRAILER)
    expect(reason).toContain('- the subject is not Conventional Commits')
    expect(reason).toContain('- a "Claude-Session:" line is not allowed')
    expect(reason.endsWith(`exactly this line:\n${TRAILER}`)).toBe(true)
    const noTrailer = commitDenyReason(['the subject is bad'], '')
    expect(noTrailer).not.toContain('exactly this line')
    expect(noTrailer).toContain('no Claude-Session')
  })
})

describe('commit gate: attribution.text', () => {
  test('commit text is the configured trailer', async ($, on) => {
    core(on)
    on('attribution.text', (_$, e) => ({ text: `core:${e.kind}` }))
    expect(await $.attribution.text({ kind: 'commit', text: 'core' })).toEqual({ text: TRAILER })
  })

  test('other kinds are left to core', async ($, on) => {
    core(on)
    on('attribution.text', (_$, e) => ({ text: `core:${e.kind}` }))
    for (const kind of ['pr', 'exemption', 'remedy'] as const) {
      expect(await $.attribution.text({ kind, text: 'x' })).toEqual({ text: `core:${kind}` })
    }
  })

  test('a custom trailer is used', { options: { commitTrailer: 'Co-Authored-By: Claude Opus' } }, async ($, on) => {
    core(on)
    on('attribution.text', () => ({ text: 'core' }))
    expect(await $.attribution.text({ kind: 'commit', text: 'core' })).toEqual({ text: 'Co-Authored-By: Claude Opus' })
  })

  test('an empty trailer passes core through', { options: { commitTrailer: '' } }, async ($, on) => {
    core(on)
    on('attribution.text', () => ({ text: 'core text' }))
    expect(await $.attribution.text({ kind: 'commit', text: 'core' })).toEqual({ text: 'core text' })
  })

  test('commitGate off passes core through', { options: { commitGate: false } }, async ($, on) => {
    core(on)
    on('attribution.text', () => ({ text: 'core text' }))
    expect(await $.attribution.text({ kind: 'commit', text: 'core' })).toEqual({ text: 'core text' })
  })
})

describe('commit gate: tool.check', () => {
  test('denies a bad message with every violation and the corrected trailer; toasts in Levi voice', async ($, on) => {
    const { toasts } = core(on)
    const r = await $.tool.check(bash(heredoc('Added a thing\n\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>')))
    expect(r.decision).toBe('deny')
    expect(r.reason).toContain('- the subject is not Conventional Commits')
    expect(r.reason).toContain('- the Co-Authored-By line')
    expect(r.reason).toContain(`exactly this line:\n${TRAILER}`)
    expect(toasts).toEqual(['🧹 Levi: "Filthy commit message. Rejected."'])
  })

  test('lets a clean commit through to core', async ($, on) => {
    const { toasts } = core(on)
    expect((await $.tool.check(bash(heredoc(`feat: add exports\n\n${TRAILER}`)))).decision).toBe('allow')
    expect((await $.tool.check(bash('git commit -m "fix: x" -m "Co-Authored-By: Claude"'))).decision).toBe('allow')
    expect(toasts).toEqual([])
  })

  test('applies outside a dojo session', async ($, on) => {
    core(on, {})
    expect((await $.tool.check(bash('git commit -m "wip"'))).decision).toBe('deny')
  })

  test('fails open on commits it cannot read', async ($, on) => {
    core(on)
    for (const cmd of ['git commit -F msg.txt', 'git commit --amend', 'git commit', 'git commit -m "$(make msg)"', 'npm test -- x']) {
      expect((await $.tool.check(bash(cmd))).decision).toBe('allow')
    }
  })

  test("never weakens core's deny", async ($, on) => {
    core(on, {}, { check: { decision: 'deny', reason: 'core says no', rule: 'Bash(git commit:*)' } })
    const good = await $.tool.check(bash('git commit -m "feat: ok"'))
    expect(good).toEqual({ decision: 'deny', reason: 'core says no', rule: 'Bash(git commit:*)' })
    const bad = await $.tool.check(bash('git commit -m "wip"'))
    expect(bad).toEqual({ decision: 'deny', reason: 'core says no', rule: 'Bash(git commit:*)' })
  })

  test('commitGate off passes everything', { options: { commitGate: false } }, async ($, on) => {
    core(on)
    expect((await $.tool.check(bash('git commit -m "wip"'))).decision).toBe('allow')
  })

  test('a custom trailer is enforced', { options: { commitTrailer: 'Co-Authored-By: Claude Opus' } }, async ($, on) => {
    core(on)
    expect((await $.tool.check(bash(heredoc('feat: a\n\nCo-Authored-By: Claude Opus')))).decision).toBe('allow')
    expect((await $.tool.check(bash(heredoc(`feat: a\n\n${TRAILER}`)))).decision).toBe('deny')
  })
})
