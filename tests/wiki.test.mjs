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

import { fetchAllPages, resolveIconUrls, fetchStratagems, MIN_STRATAGEMS } from '../src/wiki.js';

// A fake fetch that replays canned MediaWiki responses, so tests never touch the network.
function fakeFetch(responsesByMarker) {
  return async (url) => {
    for (const [marker, body] of Object.entries(responsesByMarker)) {
      if (url.includes(marker)) {
        return { ok: true, json: async () => body };
      }
    }
    throw new Error(`unexpected url: ${url}`);
  };
}

function pageBatch(pages, cont) {
  const body = { query: { pages } };
  if (cont) body.continue = { gcmcontinue: cont };
  return body;
}

function wikiPage(title, code) {
  return { title, revisions: [{ slots: { main: { content: `{{Stratagem_code|${code.join('|')}}}` } } }] };
}

test('fetchAllPages follows continuation until exhausted', async () => {
  let call = 0;
  const impl = async () => {
    call += 1;
    const body = call === 1
      ? pageBatch([wikiPage('Alpha', ['up'])], 'MORE')
      : pageBatch([wikiPage('Beta', ['down'])]);
    return { ok: true, json: async () => body };
  };

  const pages = await fetchAllPages(impl);
  assert.equal(call, 2);
  assert.deepEqual(pages.map((p) => p.title), ['Alpha', 'Beta']);
});

test('fetchAllPages throws on a non-ok response', async () => {
  const impl = async () => ({ ok: false, status: 503 });
  await assert.rejects(() => fetchAllPages(impl), /503/);
});

test('resolveIconUrls turns filenames into absolute urls', async () => {
  const impl = fakeFetch({
    'imageinfo': {
      query: {
        pages: [{
          title: 'File:Machine Gun Stratagem Icon Background.svg',
          imageinfo: [{ url: 'https://helldivers.wiki.gg/images/MG.svg' }],
        }],
      },
    },
  });

  const records = [{ name: 'MG', category: 'X', code: ['up'], icon: 'Machine Gun Stratagem Icon Background.svg' }];
  const resolved = await resolveIconUrls(records, impl);
  assert.equal(resolved[0].icon, 'https://helldivers.wiki.gg/images/MG.svg');
});

test('resolveIconUrls leaves icon null when the file is unknown', async () => {
  const impl = fakeFetch({ 'imageinfo': { query: { pages: [] } } });
  const records = [{ name: 'MG', category: 'X', code: ['up'], icon: 'Missing.svg' }];
  const resolved = await resolveIconUrls(records, impl);
  assert.equal(resolved[0].icon, null);
});

test('resolveIconUrls skips records that had no icon filename', async () => {
  const impl = async () => { throw new Error('should not fetch'); };
  const records = [{ name: 'MG', category: 'X', code: ['up'], icon: null }];
  const resolved = await resolveIconUrls(records, impl);
  assert.equal(resolved[0].icon, null);
});

test('fetchStratagems rejects a dataset below the sanity gate', async () => {
  const impl = async () => ({ ok: true, json: async () => pageBatch([wikiPage('Alpha', ['up'])]) });
  await assert.rejects(() => fetchStratagems(impl), /only 1 .*expected at least 40/i);
});

test('MIN_STRATAGEMS is the documented sanity gate', () => {
  assert.equal(MIN_STRATAGEMS, 40);
});
