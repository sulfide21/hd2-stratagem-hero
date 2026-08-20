import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCode, parseCategory, parseIconFile, parseStratagem, buildDataset } from '../src/wiki.js';

// machine-gun.txt: MG-43 Machine Gun page, uses the underscore template spelling.
// eagle-cluster-bomb.txt: Eagle Cluster Bomb page, chosen because it uses the
// space-spelled {{Stratagem code|...}} template and the plain `image` field —
// the whole reason this fixture pair exists is to cover both spellings/fields.
const machineGun = readFileSync(new URL('./fixtures/machine-gun.txt', import.meta.url), 'utf8');
const eagleClusterBomb = readFileSync(new URL('./fixtures/eagle-cluster-bomb.txt', import.meta.url), 'utf8');

test('parseCode reads the underscore template spelling', () => {
  assert.deepEqual(parseCode(machineGun), ['down', 'left', 'down', 'up', 'right']);
});

test('parseCode reads the space template spelling', () => {
  const code = parseCode(eagleClusterBomb);
  assert.ok(Array.isArray(code), 'expected an array of directions');
  assert.ok(code.length >= 3, 'expected at least three arrows');
});

test('parseCode accepts both spellings on synthetic input', () => {
  assert.deepEqual(parseCode('| stratagem_code = {{Stratagem_code|up|down}}'), ['up', 'down']);
  assert.deepEqual(parseCode('| stratagem_code = {{Stratagem code|up|down}}'), ['up', 'down']);
});

test('parseCode returns null for a page with no code', () => {
  assert.equal(parseCode('Some prose about stratagems in general.'), null);
});

test('parseCode rejects a code containing an unknown direction', () => {
  assert.equal(parseCode('{{Stratagem_code|up|sideways}}'), null);
});

test('parseCode rejects a dangling pipe instead of dropping the empty token', () => {
  assert.equal(parseCode('{{Stratagem_code|up|}}'), null);
});

test('parseCategory reads a plain source field', () => {
  assert.equal(parseCategory(machineGun), 'Patriotic Administration Center');
});

test('parseCategory strips wikilink markup', () => {
  const text = '| source = [[Urban Legends Premium Warbond#Page 3|Urban Legends Premium Warbond]]';
  assert.equal(parseCategory(text), 'Urban Legends Premium Warbond');
});

test('parseCategory strips a wikilink with no pipe', () => {
  assert.equal(parseCategory('| source = [[Hangar]]'), 'Hangar');
});

test('parseCategory falls back to Unknown', () => {
  assert.equal(parseCategory('no source field here'), 'Unknown');
});

test('parseIconFile finds the stratagem_image field', () => {
  assert.match(parseIconFile(machineGun), /Stratagem Icon Background\.svg$/);
});

test('parseIconFile finds the plain image field', () => {
  assert.match(parseIconFile(eagleClusterBomb), /Stratagem Icon Background\.svg$/);
});

test('parseIconFile ignores non-icon images', () => {
  const text = '| weapon_image = MG-43 Machine Gun Support Render.png';
  assert.equal(parseIconFile(text), null);
});

test('parseStratagem builds a full record', () => {
  const record = parseStratagem('MG-43 Machine Gun', machineGun);
  assert.equal(record.name, 'MG-43 Machine Gun');
  assert.equal(record.category, 'Patriotic Administration Center');
  assert.deepEqual(record.code, ['down', 'left', 'down', 'up', 'right']);
  assert.match(record.icon, /\.svg$/);
});

test('parseStratagem returns null for a page with no code', () => {
  assert.equal(parseStratagem('Stratagems', 'General prose page.'), null);
});

test('buildDataset drops pages without codes and sorts by name', () => {
  const pages = [
    { title: 'Zeta', wikitext: '{{Stratagem_code|up|up}}' },
    { title: 'Prose', wikitext: 'nothing here' },
    { title: 'Alpha', wikitext: '{{Stratagem code|down|down}}' },
  ];
  const { records, skipped } = buildDataset(pages);
  assert.deepEqual(records.map((r) => r.name), ['Alpha', 'Zeta']);
  assert.deepEqual(skipped, ['Prose']);
});
