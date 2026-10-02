import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HOOK = path.join(path.dirname(fileURLToPath(import.meta.url)), '../hooks/strategist-pick.mjs');

function runHook(input, env = {}) {
  const e = { ...process.env, ...env };
  delete e.DOJO_STRATEGIST;
  Object.assign(e, env);
  return spawnSync('node', [HOOK], { input, encoding: 'utf8', env: e });
}
const names = ['Shikamaru', 'Lelouch'];

test('strategist session emits valid additionalContext', () => {
  const seen = new Set();
  for (const agent_type of ['dojo:strategist', 'strategist']) {
    const r = runHook(JSON.stringify({ hook_event_name: 'SessionStart', agent_type }));
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout);
    assert.equal(out.hookSpecificOutput.hookEventName, 'SessionStart');
    const m = out.hookSpecificOutput.additionalContext.match(/^dojo: on duty: (\w+)$/);
    assert.ok(m && names.includes(m[1]));
    seen.add(m[1]);
  }
});

test('random pick eventually yields both personas', () => {
  const seen = new Set();
  for (let i = 0; i < 40 && seen.size < 2; i++) {
    const r = runHook(JSON.stringify({ agent_type: 'dojo:strategist' }));
    seen.add(JSON.parse(r.stdout).hookSpecificOutput.additionalContext);
  }
  assert.equal(seen.size, 2);
});

test('same session_id keeps the same persona across resume/compact; different ids vary', () => {
  const pick = (session_id, source) =>
    JSON.parse(runHook(JSON.stringify({ agent_type: 'dojo:strategist', session_id, source })).stdout)
      .hookSpecificOutput.additionalContext;
  const first = pick('sess-abc', 'startup');
  for (const source of ['resume', 'compact', 'clear', 'resume']) assert.equal(pick('sess-abc', source), first);
  const seen = new Set();
  for (let i = 0; i < 40 && seen.size < 2; i++) seen.add(pick(`sess-${i}`, 'startup'));
  assert.equal(seen.size, 2);
});

test('DOJO_STRATEGIST pins persona, case-insensitive; invalid falls back to a valid one', () => {
  for (const v of ['lelouch', 'LELOUCH']) {
    const r = runHook(JSON.stringify({ agent_type: 'dojo:strategist' }), { DOJO_STRATEGIST: v });
    assert.equal(JSON.parse(r.stdout).hookSpecificOutput.additionalContext, 'dojo: on duty: Lelouch');
  }
  const r = runHook(JSON.stringify({ agent_type: 'dojo:strategist' }), { DOJO_STRATEGIST: 'bogus' });
  assert.ok(names.some((n) => r.stdout.includes(n)));
});

test('absent or other agent_type prints nothing', () => {
  for (const input of [{}, { agent_type: 'dojo:senku' }, { agent_type: 'general-purpose' }, { agent_type: 5 }]) {
    const r = runHook(JSON.stringify(input));
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  }
});

test('empty, whitespace and invalid stdin exit 0 silently', () => {
  for (const input of ['', '  \n', 'not json']) {
    const r = runHook(input);
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  }
});

test('DOJO_DEBUG=1 appends raw stdin to the log', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dojo-hook-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const payload = JSON.stringify({ agent_type: 'other', marker: 'xyz' });
  runHook(payload, { DOJO_DEBUG: '1', TMPDIR: tmp });
  assert.ok(fs.readFileSync(path.join(tmp, 'dojo-hook-debug.log'), 'utf8').includes(payload));
});
