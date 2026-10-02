#!/usr/bin/env node
// SessionStart hook: when the strategist runs as the main-thread agent, announce which persona is on duty.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function readStdin(timeoutMs = 1500) {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve('');
    let data = '';
    const done = () => { clearTimeout(timer); resolve(data); };
    const timer = setTimeout(done, timeoutMs);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => { data += c; });
    process.stdin.on('end', done);
    process.stdin.on('error', done);
  });
}

async function main() {
  const raw = await readStdin();

  if (process.env.DOJO_DEBUG === '1') {
    try {
      const dir = process.env.TMPDIR || '/tmp';
      fs.appendFileSync(path.join(dir, 'dojo-hook-debug.log'), `${raw}\n`);
    } catch {}
  }

  let input;
  try { input = JSON.parse(raw); } catch { return; }
  const agent = input && typeof input.agent_type === 'string' ? input.agent_type : '';
  if (!agent.endsWith('strategist')) return;

  const { default: roster } = await import(new URL('../roster.mjs', import.meta.url).href);
  const personas = roster.agents.strategist.personas;
  const wanted = (process.env.DOJO_STRATEGIST || '').trim().toLowerCase();
  // Stable per session_id so resume/compact (which re-fire SessionStart) keep the same persona.
  const seed = typeof input.session_id === 'string' && input.session_id
    ? [...input.session_id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0)
    : Math.floor(Math.random() * 2 ** 32);
  const key = personas.includes(wanted) ? wanted : personas[seed % personas.length];
  const name = roster.displayNames?.[key] ?? key;

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: `dojo: on duty: ${name}` },
  }));
}

try { await main(); } catch {}
process.exit(0);
