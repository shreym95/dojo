import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => JSON.parse(fs.readFileSync(path.join(REPO, rel), 'utf8'));
const plugin = read('.claude-plugin/plugin.json');
const pkg = read('package.json');
const keys = plugin.userConfig;

test('banners is the opt-in Full crew cards setting, off by default', () => {
  assert.deepEqual(keys.banners, {
    type: 'boolean',
    title: 'Full crew cards',
    description: 'Show full ASCII-banner crew cards in the transcript instead of one-line deploy/return lines.',
    default: false,
  });
});

test('promptChrome describes the tag, usageLine the 50% rule, toasts the rank-up', () => {
  assert.match(keys.promptChrome.description, /tag/i);
  assert.doesNotMatch(keys.promptChrome.description, /hint/i);
  assert.ok(keys.usageLine.description.includes('50%'));
  assert.match(keys.toasts.description, /rank/i);
  assert.equal(keys.toasts.default, true);
});

test('every setting has a type, a title and a description; the visual switches are all still there', () => {
  for (const [name, k] of Object.entries(keys)) {
    assert.ok(['boolean', 'string', 'number'].includes(k.type), `${name} type`);
    assert.ok(k.title.length > 0, `${name} title`);
    assert.ok(k.description.length > 0, `${name} description`);
    assert.notEqual(k.default, undefined, `${name} default`);
  }
  for (const name of ['spinners', 'turnFlair', 'band', 'usageLine', 'toasts', 'promptChrome', 'rosterPane', 'sounds', 'rank', 'paletteMode', 'transcriptTheme']) {
    assert.ok(keys[name], name);
  }
});

test('the plugin and the package carry the same version, 0.8.1', () => {
  assert.equal(plugin.version, '0.8.1');
  assert.equal(pkg.version, plugin.version);
});

test('architectGuard is the Architect write guard, on by default', () => {
  assert.equal(keys.architectGuard.type, 'boolean');
  assert.equal(keys.architectGuard.title, 'Architect write guard');
  assert.equal(keys.architectGuard.default, true);
  assert.match(keys.architectGuard.description, /dojo:kurisu/);
});
