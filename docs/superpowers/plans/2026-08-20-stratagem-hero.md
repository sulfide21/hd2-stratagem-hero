# Stratagem Hero Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser clone of the Helldivers 2 Stratagem Hero arcade minigame that runs from a local `index.html` with no build step, and refreshes its stratagem list from helldivers.wiki.gg on demand.

**Architecture:** A pure state machine (`src/game.js`) holds every rule and never touches the DOM; a thin renderer paints from that state. Stratagem data is generated into a committed JSON file by a Node script, and the same parsing module powers an in-game SYNC button that caches a fresh dataset to localStorage.

**Tech Stack:** Vanilla ES modules, no dependencies, no bundler. Node's built-in `node --test` for tests. MediaWiki API at `helldivers.wiki.gg` for data.

**Spec:** `docs/superpowers/specs/2026-08-20-stratagem-hero-design.md`

## Global Constraints

- **Zero dependencies.** No `npm install`, no `package-lock.json`, no bundler. `package.json` exists only to set `"type": "module"` and declare the two scripts.
- **Node >= 18** required for `node --test` and global `fetch`. Verified present: v24.15.0.
- **ES modules everywhere.** Browser files load via `<script type="module">`; Node files use `.mjs` or inherit `"type": "module"`.
- **Directions are exactly** the lowercase strings `'up'`, `'down'`, `'left'`, `'right'`. Verified: the wiki uses no other token.
- **Template name has two spellings.** Every regex over stratagem codes MUST accept both `{{Stratagem_code|...}}` and `{{Stratagem code|...}}`. Verified: both appear in the live wiki, roughly 18 underscore to 29 space in a 50-page sample. Matching only one silently loses most of the dataset.
- **Sanity gate:** a sync producing fewer than 40 records is rejected wholesale. Expected real yield is roughly 100.
- **No game assets committed.** Store icon URLs pointing at wiki.gg; never download the images into the repo.
- **All tunable numbers live in `src/config.js`.** No magic numbers in `game.js`, `render.js`, or tests — tests import `CONFIG` or pass their own.

### Deviations from the spec, and one clarification

1. The spec's file list in §5 has no composition root. This plan adds **`src/main.js`**, which wires modules together and owns the `requestAnimationFrame` loop. It contains no game rules.
2. The spec's file list names `tests/game.test.mjs` only. This plan uses **three** test files (`wiki.test.mjs`, `game.test.mjs`, `data.test.mjs`) so each module's tests can be run alone.
3. The spec does not say whether `TIME_PER_CORRECT` can push the timer above `ROUND_TIME`. **Clarified here: it cannot.** `timeRemaining` is clamped to `ROUND_TIME`, matching the wiki's wording that a correct entry "slightly replenishes" the timer.

---

## File Structure

| File | Responsibility |
|---|---|
| `package.json` | Sets `"type": "module"`, declares `test` and `update-data` scripts. No dependencies. |
| `src/config.js` | Every tunable constant. Nothing else. |
| `src/wiki.js` | Parse wikitext into stratagem records; fetch them via an injected fetch. No DOM, no filesystem. |
| `src/game.js` | Pure state machine and scoring. No DOM, no clock, no randomness of its own. |
| `src/data.js` | Choose between the localStorage dataset and the bundled JSON; validate both. |
| `src/scores.js` | Top-10 high scores in localStorage. |
| `src/input.js` | Keyboard events to direction strings. |
| `src/render.js` | State to DOM. No rules. |
| `src/main.js` | Composition root: load data, build game, run the frame loop, wire the SYNC button. |
| `tools/update-stratagems.mjs` | Node CLI that regenerates `data/stratagems.json`. |
| `data/stratagems.json` | Generated, committed dataset. |
| `index.html`, `styles.css` | Markup and the Helldivers 2 visual treatment. |
| `tests/*.test.mjs` | Node test files, one per tested module. |
| `tests/fixtures/` | Real wikitext saved from the live wiki, so parser tests never hit the network. |

---

## Task 1: Wiki parser

Pure text-to-record parsing, with fixtures captured from the live wiki. No network in the tests.

**Files:**
- Create: `package.json`
- Create: `src/wiki.js`
- Create: `tests/fixtures/machine-gun.txt`
- Create: `tests/fixtures/eagle-airstrike.txt`
- Test: `tests/wiki.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `parseCode(wikitext) -> string[] | null` — directions, or `null` if the page has no code.
  - `parseCategory(wikitext) -> string` — the `source` field with wikilinks stripped; `'Unknown'` if absent.
  - `parseIconFile(wikitext) -> string | null` — the icon filename, or `null`.
  - `parseStratagem(title, wikitext) -> {name, category, code, icon} | null` — `icon` is the filename here, resolved to a URL in Task 2.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "hd2-stratagem-hero",
  "version": "1.0.0",
  "description": "Helldivers 2 Stratagem Hero arcade minigame, in the browser",
  "type": "module",
  "private": true,
  "scripts": {
    "test": "node --test tests/",
    "update-data": "node tools/update-stratagems.mjs"
  }
}
```

- [ ] **Step 2: Capture two real fixtures from the live wiki**

These are captured rather than hand-written so the parser is tested against the wiki's actual formatting. `machine-gun.txt` uses the underscore template spelling and the `stratagem_image` field; `eagle-airstrike.txt` uses the space spelling and the plain `image` field. Both spellings must pass.

```bash
mkdir -p tests/fixtures src tools data
curl -s "https://helldivers.wiki.gg/api.php?action=parse&page=MG-43%20Machine%20Gun&prop=wikitext&format=json&formatversion=2" \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(JSON.parse(s).parse.wikitext))" \
  > tests/fixtures/machine-gun.txt
curl -s "https://helldivers.wiki.gg/api.php?action=parse&page=Eagle%20Airstrike&prop=wikitext&format=json&formatversion=2" \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(JSON.parse(s).parse.wikitext))" \
  > tests/fixtures/eagle-airstrike.txt
```

Verify both files are non-empty and contain a code, then confirm the two spellings really differ:

```bash
grep -o "{{Stratagem[ _]code|[^}]*}}" tests/fixtures/*.txt
```

Expected: two matches, one containing `Stratagem_code` and one containing `Stratagem code`. If both use the same spelling, pick a different second page from `Category:Stratagems` until you have one of each — the two-spelling case is the whole point of this fixture pair.

- [ ] **Step 3: Write the failing tests**

`tests/wiki.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCode, parseCategory, parseIconFile, parseStratagem, buildDataset } from '../src/wiki.js';

const machineGun = readFileSync(new URL('./fixtures/machine-gun.txt', import.meta.url), 'utf8');
const eagleAirstrike = readFileSync(new URL('./fixtures/eagle-airstrike.txt', import.meta.url), 'utf8');

test('parseCode reads the underscore template spelling', () => {
  assert.deepEqual(parseCode(machineGun), ['down', 'left', 'down', 'up', 'right']);
});

test('parseCode reads the space template spelling', () => {
  const code = parseCode(eagleAirstrike);
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
  assert.match(parseIconFile(eagleAirstrike), /Stratagem Icon Background\.svg$/);
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
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `node --test tests/wiki.test.mjs`
Expected: FAIL — `Cannot find module '../src/wiki.js'`.

- [ ] **Step 5: Write `src/wiki.js` (parsing half only)**

```js
// Parses Helldivers 2 stratagem data out of helldivers.wiki.gg wikitext.
//
// Two wiki quirks drive the regexes here, both confirmed against live pages:
//   1. The code template is spelled BOTH "Stratagem_code" and "Stratagem code".
//   2. The icon lives in "stratagem_image" on some infoboxes and plain "image"
//      on others, so we match on the filename convention instead of the field.

const DIRECTIONS = new Set(['up', 'down', 'left', 'right']);

const CODE_RE = /\{\{Stratagem[ _]code\|([^}]+)\}\}/i;
const SOURCE_RE = /^\s*\|?\s*source\s*=\s*(.+)$/im;
const ICON_RE = /=\s*([^=\n|]*Stratagem Icon Background\.svg)\s*$/im;

export function parseCode(wikitext) {
  const match = CODE_RE.exec(wikitext);
  if (!match) return null;

  const parts = match[1].split('|').map((p) => p.trim().toLowerCase()).filter(Boolean);
  if (parts.length === 0) return null;
  if (!parts.every((p) => DIRECTIONS.has(p))) return null;

  return parts;
}

export function parseCategory(wikitext) {
  const match = SOURCE_RE.exec(wikitext);
  if (!match) return 'Unknown';

  // "[[Page#Anchor|Label]]" -> "Label";  "[[Hangar]]" -> "Hangar"
  const cleaned = match[1]
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/'''?/g, '')
    .trim();

  return cleaned || 'Unknown';
}

export function parseIconFile(wikitext) {
  const match = ICON_RE.exec(wikitext);
  return match ? match[1].trim() : null;
}

export function parseStratagem(title, wikitext) {
  const code = parseCode(wikitext);
  if (!code) return null;

  return {
    name: title,
    category: parseCategory(wikitext),
    code,
    icon: parseIconFile(wikitext),
  };
}

export function buildDataset(pages) {
  const records = [];
  const skipped = [];

  for (const page of pages) {
    const record = parseStratagem(page.title, page.wikitext);
    if (record) records.push(record);
    else skipped.push(page.title);
  }

  records.sort((a, b) => a.name.localeCompare(b.name));
  return { records, skipped };
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node --test tests/wiki.test.mjs`
Expected: PASS, 15 tests.

If `parseCategory(machineGun)` fails, print the fixture's source line with
`grep -n "source" tests/fixtures/machine-gun.txt` and adjust `SOURCE_RE` to the real formatting rather than editing the fixture.

- [ ] **Step 7: Commit**

```bash
git add package.json src/wiki.js tests/wiki.test.mjs tests/fixtures/
git commit -m "feat: parse stratagem records from wiki wikitext"
```

---

## Task 2: Wiki fetch and the Node updater

Turns the parser into a real dataset. Ends with `data/stratagems.json` committed.

**Files:**
- Modify: `src/wiki.js` (append the fetching half)
- Create: `tools/update-stratagems.mjs`
- Create: `data/stratagems.json` (generated)
- Test: `tests/wiki.test.mjs` (append)

**Interfaces:**
- Consumes: `buildDataset`, `parseStratagem` from Task 1.
- Produces:
  - `MIN_STRATAGEMS = 40` — the sanity gate constant.
  - `fetchAllPages(fetchImpl) -> Promise<Array<{title, wikitext}>>`
  - `resolveIconUrls(records, fetchImpl) -> Promise<records>` — replaces each `icon` filename with an absolute URL, or `null` when it cannot be resolved.
  - `fetchStratagems(fetchImpl) -> Promise<{records, skipped}>` — the full pipeline, throwing if the sanity gate fails.

- [ ] **Step 1: Write the failing tests**

Append to `tests/wiki.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/wiki.test.mjs`
Expected: FAIL — `fetchAllPages is not a function` (or an import error).

- [ ] **Step 3: Append the fetching half to `src/wiki.js`**

```js
const API = 'https://helldivers.wiki.gg/api.php';
const BATCH_SIZE = 50;

// A dataset smaller than this means the wiki changed its templates and our
// parser silently stopped matching. Reject the whole sync rather than ship it.
export const MIN_STRATAGEMS = 40;

function apiUrl(params) {
  const query = new URLSearchParams({ format: 'json', formatversion: '2', origin: '*', ...params });
  return `${API}?${query}`;
}

async function getJson(fetchImpl, params) {
  const response = await fetchImpl(apiUrl(params));
  if (!response.ok) throw new Error(`wiki request failed: ${response.status}`);
  return response.json();
}

export async function fetchAllPages(fetchImpl) {
  const pages = [];
  let cont;

  do {
    const body = await getJson(fetchImpl, {
      action: 'query',
      generator: 'categorymembers',
      gcmtitle: 'Category:Stratagems',
      gcmtype: 'page',
      gcmlimit: String(BATCH_SIZE),
      prop: 'revisions',
      rvprop: 'content',
      rvslots: 'main',
      ...(cont ? { gcmcontinue: cont } : {}),
    });

    for (const page of body.query?.pages ?? []) {
      const wikitext = page.revisions?.[0]?.slots?.main?.content ?? '';
      pages.push({ title: page.title, wikitext });
    }

    cont = body.continue?.gcmcontinue;
  } while (cont);

  return pages;
}

export async function resolveIconUrls(records, fetchImpl) {
  const filenames = [...new Set(records.map((r) => r.icon).filter(Boolean))];
  const urlByFile = new Map();

  for (let i = 0; i < filenames.length; i += BATCH_SIZE) {
    const slice = filenames.slice(i, i + BATCH_SIZE);
    const body = await getJson(fetchImpl, {
      action: 'query',
      titles: slice.map((f) => `File:${f}`).join('|'),
      prop: 'imageinfo',
      iiprop: 'url',
    });

    for (const page of body.query?.pages ?? []) {
      const url = page.imageinfo?.[0]?.url;
      if (url) urlByFile.set(page.title.replace(/^File:/, ''), url);
    }
  }

  return records.map((r) => ({ ...r, icon: r.icon ? urlByFile.get(r.icon) ?? null : null }));
}

export async function fetchStratagems(fetchImpl = fetch) {
  const pages = await fetchAllPages(fetchImpl);
  const { records, skipped } = buildDataset(pages);

  if (records.length < MIN_STRATAGEMS) {
    throw new Error(
      `sanity gate failed: parsed only ${records.length} stratagems, expected at least ${MIN_STRATAGEMS}. ` +
        'The wiki templates have probably changed.'
    );
  }

  return { records: await resolveIconUrls(records, fetchImpl), skipped };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/wiki.test.mjs`
Expected: PASS, 22 tests.

- [ ] **Step 5: Write `tools/update-stratagems.mjs`**

```js
#!/usr/bin/env node
// Regenerates data/stratagems.json from helldivers.wiki.gg.
// Run with: npm run update-data

import { writeFileSync } from 'node:fs';
import { fetchStratagems } from '../src/wiki.js';

const OUTPUT = new URL('../data/stratagems.json', import.meta.url);

try {
  console.log('Fetching stratagems from helldivers.wiki.gg ...');
  const { records, skipped } = await fetchStratagems(fetch);

  const payload = {
    updatedAt: new Date().toISOString(),
    source: 'https://helldivers.wiki.gg/wiki/Category:Stratagems',
    stratagems: records,
  };

  writeFileSync(OUTPUT, `${JSON.stringify(payload, null, 2)}\n`);

  const withoutIcon = records.filter((r) => !r.icon).length;
  console.log(`Wrote ${records.length} stratagems to data/stratagems.json`);
  console.log(`  ${skipped.length} pages skipped (no stratagem code)`);
  if (withoutIcon > 0) console.log(`  ${withoutIcon} stratagems have no icon and will render as text`);
} catch (error) {
  console.error(`Update failed: ${error.message}`);
  console.error('data/stratagems.json was left unchanged.');
  process.exit(1);
}
```

- [ ] **Step 6: Run it for real and check the output**

```bash
npm run update-data
node -e "const d=require('fs').readFileSync('data/stratagems.json','utf8');const j=JSON.parse(d);console.log('count:',j.stratagems.length);console.log('no icon:',j.stratagems.filter(s=>!s.icon).length);console.log(JSON.stringify(j.stratagems[0],null,2));"
```

Expected: a count near 100 and well above the gate of 40, and a first record with a `name`, a `category`, a `code` array of 3-8 lowercase directions, and an `icon` URL on `helldivers.wiki.gg`.

If the count comes back under 40 the run will have already failed with the sanity-gate message. That means the wiki changed its templates: re-check the live formatting with `curl` before touching the regexes, and update the fixtures alongside them.

- [ ] **Step 7: Commit**

```bash
git add src/wiki.js tools/update-stratagems.mjs tests/wiki.test.mjs data/stratagems.json
git commit -m "feat: fetch stratagem dataset from the wiki and generate data/stratagems.json"
```

---

## Task 3: Config and the game state machine

The rules, in one pure module. No DOM, no clock, no randomness.

**Files:**
- Create: `src/config.js`
- Create: `src/game.js`
- Test: `tests/game.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `CONFIG` — the constants object from spec §4, plus `POINTS_PER_ARROW`.
  - `PHASE` — `{TITLE, ROUND_INTRO, PLAYING, ROUND_COMPLETE, GAME_OVER}`.
  - `roundSize(round, config) -> number`
  - `stratagemScore({codeLength, round, elapsed, errors}, config) -> number`
  - `roundBonus({round, errors, timeRemaining}, config) -> number`
  - `createGame(stratagems, {config, shuffle}) -> game` with `game.state`, `game.start()`, `game.input(direction)`, `game.tick(deltaSeconds)`, `game.nextRound()`.
  - `game.state` shape: `{phase, round, score, timeRemaining, sequence, index, progress, stratagemErrors, roundErrors, lastRoundBonus, wrongFlash}`.

- [ ] **Step 1: Write `src/config.js`**

This is data, not logic, so it needs no test of its own — the game tests read from it.

```js
// Every tunable number lives here.
//
// The real Stratagem Hero scoring formula has never been published: the wiki
// gives no numbers and the best-known community clone states it invented its
// own. These values are a deliberate approximation. Tune them here; game.js
// must never hardcode a number.
export const CONFIG = {
  FIRST_ROUND_SIZE: 6,
  MAX_ROUND_SIZE: 16,
  ROUND_TIME: 10.0,
  TIME_PER_CORRECT: 1.0,
  BASE_POINTS: 100,
  POINTS_PER_ARROW: 20,
  SPEED_BONUS_MAX: 1.0,
  SPEED_WINDOW: 3.0,
  ERROR_PENALTY: 25,
  PERFECT_ROUND_BONUS: 1000,
  TIME_BONUS_PER_SECOND: 50,
};
```

- [ ] **Step 2: Write the failing tests**

`tests/game.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { createGame, roundSize, stratagemScore, roundBonus, PHASE } from '../src/game.js';

// A deterministic stratagem pool: every code is [up, down] so tests can drive
// the machine without tracking which stratagem came up.
const pool = Array.from({ length: 20 }, (_, i) => ({
  name: `Stratagem ${i}`,
  category: 'Test',
  code: ['up', 'down'],
  icon: null,
}));

const noShuffle = (items) => items;
const newGame = (overrides = {}) => createGame(pool, { config: CONFIG, shuffle: noShuffle, ...overrides });

function enterCurrentCode(game) {
  for (const direction of game.state.sequence[game.state.index].code) {
    game.input(direction);
  }
}

test('roundSize starts at 6 and grows by one per round', () => {
  assert.equal(roundSize(1, CONFIG), 6);
  assert.equal(roundSize(2, CONFIG), 7);
  assert.equal(roundSize(5, CONFIG), 10);
});

test('roundSize caps at 16 from round 11 onward', () => {
  assert.equal(roundSize(11, CONFIG), 16);
  assert.equal(roundSize(12, CONFIG), 16);
  assert.equal(roundSize(50, CONFIG), 16);
});

test('start moves from TITLE to PLAYING with a full timer', () => {
  const game = newGame();
  assert.equal(game.state.phase, PHASE.TITLE);
  game.start();
  assert.equal(game.state.phase, PHASE.PLAYING);
  assert.equal(game.state.round, 1);
  assert.equal(game.state.sequence.length, 6);
  assert.equal(game.state.timeRemaining, CONFIG.ROUND_TIME);
});

test('a correct arrow advances progress without advancing the stratagem', () => {
  const game = newGame();
  game.start();
  game.input('up');
  assert.equal(game.state.progress, 1);
  assert.equal(game.state.index, 0);
});

test('completing a code advances to the next stratagem and resets progress', () => {
  const game = newGame();
  game.start();
  enterCurrentCode(game);
  assert.equal(game.state.index, 1);
  assert.equal(game.state.progress, 0);
});

test('completing a code adds time, clamped to the round maximum', () => {
  const game = newGame();
  game.start();
  game.tick(4);
  assert.equal(game.state.timeRemaining, CONFIG.ROUND_TIME - 4);
  enterCurrentCode(game);
  assert.equal(game.state.timeRemaining, CONFIG.ROUND_TIME - 4 + CONFIG.TIME_PER_CORRECT);
});

test('time never exceeds ROUND_TIME', () => {
  const game = newGame();
  game.start();
  game.tick(0.1);
  enterCurrentCode(game);
  assert.equal(game.state.timeRemaining, CONFIG.ROUND_TIME);
});

test('a wrong arrow resets progress to zero and counts an error', () => {
  const game = newGame();
  game.start();
  game.input('up');
  game.input('left');
  assert.equal(game.state.progress, 0);
  assert.equal(game.state.index, 0);
  assert.equal(game.state.stratagemErrors, 1);
  assert.equal(game.state.roundErrors, 1);
  assert.equal(game.state.wrongFlash, true);
});

test('a wrong arrow does not lose time beyond the normal countdown', () => {
  const game = newGame();
  game.start();
  const before = game.state.timeRemaining;
  game.input('left');
  assert.equal(game.state.timeRemaining, before);
});

test('finishing every stratagem ends the round in ROUND_COMPLETE', () => {
  const game = newGame();
  game.start();
  for (let i = 0; i < 6; i += 1) enterCurrentCode(game);
  assert.equal(game.state.phase, PHASE.ROUND_COMPLETE);
});

test('the timer reaching zero mid-round ends in GAME_OVER', () => {
  const game = newGame();
  game.start();
  game.tick(CONFIG.ROUND_TIME);
  assert.equal(game.state.phase, PHASE.GAME_OVER);
});

test('the timer never goes below zero', () => {
  const game = newGame();
  game.start();
  game.tick(999);
  assert.equal(game.state.timeRemaining, 0);
});

test('input is ignored once the game is over', () => {
  const game = newGame();
  game.start();
  game.tick(999);
  game.input('up');
  assert.equal(game.state.progress, 0);
});

test('nextRound advances the round and refills the timer', () => {
  const game = newGame();
  game.start();
  for (let i = 0; i < 6; i += 1) enterCurrentCode(game);
  game.nextRound();
  assert.equal(game.state.phase, PHASE.PLAYING);
  assert.equal(game.state.round, 2);
  assert.equal(game.state.sequence.length, 7);
  assert.equal(game.state.timeRemaining, CONFIG.ROUND_TIME);
  assert.equal(game.state.roundErrors, 0);
});

test('stratagemScore scales with code length', () => {
  const short = stratagemScore({ codeLength: 3, round: 1, elapsed: 99, errors: 0 }, CONFIG);
  const long = stratagemScore({ codeLength: 8, round: 1, elapsed: 99, errors: 0 }, CONFIG);
  assert.ok(long > short, `expected ${long} > ${short}`);
});

test('stratagemScore scales with the round number', () => {
  const early = stratagemScore({ codeLength: 5, round: 1, elapsed: 99, errors: 0 }, CONFIG);
  const late = stratagemScore({ codeLength: 5, round: 4, elapsed: 99, errors: 0 }, CONFIG);
  assert.equal(late, early * 4);
});

test('stratagemScore pays a full speed bonus for instant entry', () => {
  const instant = stratagemScore({ codeLength: 5, round: 1, elapsed: 0, errors: 0 }, CONFIG);
  const slow = stratagemScore({ codeLength: 5, round: 1, elapsed: CONFIG.SPEED_WINDOW, errors: 0 }, CONFIG);
  assert.equal(instant, slow * 2);
});

test('stratagemScore never returns a negative number', () => {
  assert.equal(stratagemScore({ codeLength: 3, round: 1, elapsed: 99, errors: 500 }, CONFIG), 0);
});

test('roundBonus pays the perfect bonus only with zero errors', () => {
  assert.equal(roundBonus({ round: 3, errors: 0, timeRemaining: 0 }, CONFIG), CONFIG.PERFECT_ROUND_BONUS * 3);
  assert.equal(roundBonus({ round: 3, errors: 1, timeRemaining: 0 }, CONFIG), 0);
});

test('roundBonus pays for whole leftover seconds', () => {
  assert.equal(roundBonus({ round: 1, errors: 1, timeRemaining: 4.9 }, CONFIG), 4 * CONFIG.TIME_BONUS_PER_SECOND);
});

test('a perfect round adds its bonus to the running score', () => {
  const game = newGame();
  game.start();
  const before = game.state.score;
  for (let i = 0; i < 6; i += 1) enterCurrentCode(game);
  assert.ok(game.state.lastRoundBonus >= CONFIG.PERFECT_ROUND_BONUS);
  assert.equal(game.state.score, before + game.state.roundScoreTotal + game.state.lastRoundBonus);
});

test('the game refuses to start with an empty stratagem pool', () => {
  assert.throws(() => createGame([], { config: CONFIG, shuffle: noShuffle }), /no stratagems/i);
});

test('the sequence is drawn using the injected shuffle', () => {
  const reversed = (items) => [...items].reverse();
  const game = createGame(pool, { config: CONFIG, shuffle: reversed });
  game.start();
  assert.equal(game.state.sequence[0].name, pool[pool.length - 1].name);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test tests/game.test.mjs`
Expected: FAIL — `Cannot find module '../src/game.js'`.

- [ ] **Step 4: Write `src/game.js`**

```js
// The rules of Stratagem Hero, as a pure state machine.
//
// This module never reads the clock, never touches the DOM, and never calls
// Math.random. Time arrives through tick(), randomness through an injected
// shuffle. That is what makes the whole thing testable under node --test.

import { CONFIG as DEFAULT_CONFIG } from './config.js';

export const PHASE = {
  TITLE: 'TITLE',
  ROUND_INTRO: 'ROUND_INTRO',
  PLAYING: 'PLAYING',
  ROUND_COMPLETE: 'ROUND_COMPLETE',
  GAME_OVER: 'GAME_OVER',
};

export function roundSize(round, config = DEFAULT_CONFIG) {
  return Math.min(config.FIRST_ROUND_SIZE + (round - 1), config.MAX_ROUND_SIZE);
}

export function stratagemScore({ codeLength, round, elapsed, errors }, config = DEFAULT_CONFIG) {
  const raw = (config.BASE_POINTS + config.POINTS_PER_ARROW * codeLength) * round;
  const speedFactor = Math.max(0, Math.min(1, 1 - elapsed / config.SPEED_WINDOW));
  const speed = raw * config.SPEED_BONUS_MAX * speedFactor;
  return Math.max(0, Math.round(raw + speed - errors * config.ERROR_PENALTY));
}

export function roundBonus({ round, errors, timeRemaining }, config = DEFAULT_CONFIG) {
  const perfect = errors === 0 ? config.PERFECT_ROUND_BONUS * round : 0;
  return perfect + Math.floor(timeRemaining) * config.TIME_BONUS_PER_SECOND;
}

function defaultShuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function createGame(stratagems, { config = DEFAULT_CONFIG, shuffle = defaultShuffle } = {}) {
  if (!Array.isArray(stratagems) || stratagems.length === 0) {
    throw new Error('createGame: no stratagems available');
  }

  const state = {
    phase: PHASE.TITLE,
    round: 0,
    score: 0,
    roundScoreTotal: 0,
    lastRoundBonus: 0,
    timeRemaining: 0,
    sequence: [],
    index: 0,
    progress: 0,
    stratagemErrors: 0,
    roundErrors: 0,
    wrongFlash: false,
  };

  let stratagemElapsed = 0;

  function drawSequence(round) {
    const wanted = roundSize(round, config);
    const drawn = [];
    // The pool can be smaller than the round, so keep reshuffling until full.
    while (drawn.length < wanted) {
      drawn.push(...shuffle(stratagems));
    }
    return drawn.slice(0, wanted);
  }

  function beginRound(round) {
    state.phase = PHASE.PLAYING;
    state.round = round;
    state.sequence = drawSequence(round);
    state.index = 0;
    state.progress = 0;
    state.stratagemErrors = 0;
    state.roundErrors = 0;
    state.roundScoreTotal = 0;
    state.lastRoundBonus = 0;
    state.timeRemaining = config.ROUND_TIME;
    state.wrongFlash = false;
    stratagemElapsed = 0;
  }

  function completeStratagem() {
    const current = state.sequence[state.index];
    state.roundScoreTotal += stratagemScore(
      { codeLength: current.code.length, round: state.round, elapsed: stratagemElapsed, errors: state.stratagemErrors },
      config
    );

    state.timeRemaining = Math.min(config.ROUND_TIME, state.timeRemaining + config.TIME_PER_CORRECT);
    state.index += 1;
    state.progress = 0;
    state.stratagemErrors = 0;
    stratagemElapsed = 0;

    if (state.index >= state.sequence.length) completeRound();
  }

  function completeRound() {
    state.lastRoundBonus = roundBonus(
      { round: state.round, errors: state.roundErrors, timeRemaining: state.timeRemaining },
      config
    );
    state.score += state.roundScoreTotal + state.lastRoundBonus;
    state.phase = PHASE.ROUND_COMPLETE;
  }

  return {
    state,

    start() {
      state.score = 0;
      beginRound(1);
    },

    nextRound() {
      const carried = state.score;
      beginRound(state.round + 1);
      state.score = carried;
    },

    input(direction) {
      if (state.phase !== PHASE.PLAYING) return;

      const expected = state.sequence[state.index].code[state.progress];
      if (direction === expected) {
        state.wrongFlash = false;
        state.progress += 1;
        if (state.progress >= state.sequence[state.index].code.length) completeStratagem();
      } else {
        state.progress = 0;
        state.stratagemErrors += 1;
        state.roundErrors += 1;
        state.wrongFlash = true;
      }
    },

    tick(deltaSeconds) {
      if (state.phase !== PHASE.PLAYING) return;

      stratagemElapsed += deltaSeconds;
      state.timeRemaining = Math.max(0, state.timeRemaining - deltaSeconds);
      if (state.timeRemaining === 0) state.phase = PHASE.GAME_OVER;
    },
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test tests/game.test.mjs`
Expected: PASS, 23 tests.

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: PASS, 45 tests across both files.

- [ ] **Step 7: Commit**

```bash
git add src/config.js src/game.js tests/game.test.mjs
git commit -m "feat: add the stratagem hero game state machine and scoring"
```

---

## Task 4: Dataset loading and high scores

The two localStorage-backed modules, both tested against a fake storage object.

**Files:**
- Create: `src/data.js`
- Create: `src/scores.js`
- Test: `tests/data.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `STORAGE_KEY = 'hd2sh.stratagems'`, `SCORES_KEY = 'hd2sh.scores'`
  - `validateDataset(value) -> boolean`
  - `pickDataset(stored, bundled) -> {stratagems, source}` where `source` is `'synced'` or `'bundled'`; throws when neither is usable.
  - `loadStratagems(bundled, storage) -> {stratagems, source}`
  - `saveStratagems(records, storage) -> void`
  - `loadScores(storage) -> Array<{name, score, round}>`
  - `recordScore(entry, storage) -> Array` — inserts, sorts descending, truncates to 10.
  - `isHighScore(score, storage) -> boolean`

- [ ] **Step 1: Write the failing tests**

`tests/data.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDataset, pickDataset, loadStratagems, saveStratagems, STORAGE_KEY } from '../src/data.js';
import { loadScores, recordScore, isHighScore, SCORES_KEY } from '../src/scores.js';

// Minimal stand-in for window.localStorage.
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

const good = [{ name: 'A', category: 'X', code: ['up', 'down'], icon: null }];

test('validateDataset accepts a well-formed array', () => {
  assert.equal(validateDataset(good), true);
});

test('validateDataset rejects non-arrays and empty arrays', () => {
  assert.equal(validateDataset(null), false);
  assert.equal(validateDataset({}), false);
  assert.equal(validateDataset([]), false);
});

test('validateDataset rejects a record with no name', () => {
  assert.equal(validateDataset([{ category: 'X', code: ['up'] }]), false);
});

test('validateDataset rejects a record with an empty code', () => {
  assert.equal(validateDataset([{ name: 'A', category: 'X', code: [] }]), false);
});

test('validateDataset rejects an unknown direction', () => {
  assert.equal(validateDataset([{ name: 'A', category: 'X', code: ['diagonal'] }]), false);
});

test('pickDataset prefers a valid stored dataset', () => {
  const stored = [{ name: 'Stored', category: 'X', code: ['up'] }];
  const result = pickDataset(stored, good);
  assert.equal(result.source, 'synced');
  assert.equal(result.stratagems[0].name, 'Stored');
});

test('pickDataset falls back when the stored dataset is malformed', () => {
  const result = pickDataset([{ broken: true }], good);
  assert.equal(result.source, 'bundled');
  assert.equal(result.stratagems[0].name, 'A');
});

test('pickDataset throws when neither dataset is usable', () => {
  assert.throws(() => pickDataset(null, []), /no stratagem data/i);
});

test('loadStratagems reads and parses the stored dataset', () => {
  const storage = fakeStorage({ [STORAGE_KEY]: JSON.stringify([{ name: 'S', category: 'X', code: ['up'] }]) });
  const result = loadStratagems(good, storage);
  assert.equal(result.source, 'synced');
  assert.equal(result.stratagems[0].name, 'S');
});

test('loadStratagems survives unparseable JSON in storage', () => {
  const storage = fakeStorage({ [STORAGE_KEY]: 'not json{{{' });
  const result = loadStratagems(good, storage);
  assert.equal(result.source, 'bundled');
});

test('saveStratagems round-trips through storage', () => {
  const storage = fakeStorage();
  saveStratagems(good, storage);
  assert.equal(loadStratagems([], storage).source, 'synced');
});

test('saveStratagems refuses to store an invalid dataset', () => {
  const storage = fakeStorage();
  assert.throws(() => saveStratagems([{ broken: true }], storage), /invalid/i);
  assert.equal(storage.getItem(STORAGE_KEY), null);
});

test('loadScores returns an empty list when nothing is stored', () => {
  assert.deepEqual(loadScores(fakeStorage()), []);
});

test('loadScores survives unparseable JSON', () => {
  assert.deepEqual(loadScores(fakeStorage({ [SCORES_KEY]: 'broken' })), []);
});

test('recordScore sorts descending', () => {
  const storage = fakeStorage();
  recordScore({ name: 'AAA', score: 100, round: 2 }, storage);
  recordScore({ name: 'BBB', score: 500, round: 5 }, storage);
  assert.deepEqual(loadScores(storage).map((s) => s.name), ['BBB', 'AAA']);
});

test('recordScore keeps only the top ten', () => {
  const storage = fakeStorage();
  for (let i = 1; i <= 15; i += 1) recordScore({ name: `P${i}`, score: i * 10, round: 1 }, storage);
  const scores = loadScores(storage);
  assert.equal(scores.length, 10);
  assert.equal(scores[0].score, 150);
  assert.equal(scores[9].score, 60);
});

test('isHighScore is true while the table has room', () => {
  const storage = fakeStorage();
  assert.equal(isHighScore(1, storage), true);
});

test('isHighScore is false for a score below a full table', () => {
  const storage = fakeStorage();
  for (let i = 1; i <= 10; i += 1) recordScore({ name: `P${i}`, score: i * 100, round: 1 }, storage);
  assert.equal(isHighScore(50, storage), false);
  assert.equal(isHighScore(5000, storage), true);
});

test('isHighScore rejects a zero score', () => {
  assert.equal(isHighScore(0, fakeStorage()), false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/data.test.mjs`
Expected: FAIL — `Cannot find module '../src/data.js'`.

- [ ] **Step 3: Write `src/data.js`**

```js
// Chooses which stratagem dataset the game plays with.
//
// A dataset synced from the wiki into localStorage wins over the bundled file,
// but only if it validates. Anything malformed is discarded silently in favour
// of the bundled copy, so a bad sync can never leave the game unplayable.

export const STORAGE_KEY = 'hd2sh.stratagems';

const DIRECTIONS = new Set(['up', 'down', 'left', 'right']);

export function validateDataset(value) {
  if (!Array.isArray(value) || value.length === 0) return false;

  return value.every(
    (record) =>
      record &&
      typeof record.name === 'string' &&
      record.name.length > 0 &&
      Array.isArray(record.code) &&
      record.code.length > 0 &&
      record.code.every((d) => DIRECTIONS.has(d))
  );
}

export function pickDataset(stored, bundled) {
  if (validateDataset(stored)) return { stratagems: stored, source: 'synced' };
  if (validateDataset(bundled)) return { stratagems: bundled, source: 'bundled' };
  throw new Error('no stratagem data available: both the synced and bundled datasets are unusable');
}

export function loadStratagems(bundled, storage = globalThis.localStorage) {
  let stored = null;
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (raw) stored = JSON.parse(raw);
  } catch {
    stored = null;
  }
  return pickDataset(stored, bundled);
}

export function saveStratagems(records, storage = globalThis.localStorage) {
  if (!validateDataset(records)) throw new Error('refusing to save an invalid stratagem dataset');
  storage.setItem(STORAGE_KEY, JSON.stringify(records));
}
```

- [ ] **Step 4: Write `src/scores.js`**

```js
// Local top-ten high scores. No server, no accounts.

export const SCORES_KEY = 'hd2sh.scores';
export const MAX_SCORES = 10;

export function loadScores(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(SCORES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function recordScore(entry, storage = globalThis.localStorage) {
  const scores = [...loadScores(storage), entry]
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SCORES);

  storage.setItem(SCORES_KEY, JSON.stringify(scores));
  return scores;
}

export function isHighScore(score, storage = globalThis.localStorage) {
  if (score <= 0) return false;

  const scores = loadScores(storage);
  if (scores.length < MAX_SCORES) return true;
  return score > scores[scores.length - 1].score;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test tests/data.test.mjs`
Expected: PASS, 19 tests.

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: PASS, 64 tests across three files.

- [ ] **Step 7: Commit**

```bash
git add src/data.js src/scores.js tests/data.test.mjs
git commit -m "feat: add dataset loading with fallback and local high scores"
```

---

## Task 5: Playable game — markup, styling, rendering, input

The first task with a visible result. Ends with a game you can actually play.

**Files:**
- Create: `index.html`
- Create: `styles.css`
- Create: `src/input.js`
- Create: `src/render.js`
- Create: `src/main.js`

**Interfaces:**
- Consumes: `createGame`, `PHASE`, `roundSize` (Task 3); `loadStratagems` (Task 4); `loadScores`, `recordScore`, `isHighScore` (Task 4); `CONFIG` (Task 3).
- Produces:
  - `attachInput(handler) -> () => void` — returns a detach function.
  - `render(state, elements, extras)` — `extras` is `{scores, dataSource, syncMessage}`.
  - `queryElements() -> object` — the cached DOM handles `render` needs.

- [ ] **Step 1: Write `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Stratagem Hero</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@600;700&display=swap"
      rel="stylesheet"
    />
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <main class="cabinet">
      <div class="scanlines" aria-hidden="true"></div>

      <header class="hud">
        <div class="hud-cell"><span class="hud-label">Round</span><span id="hud-round">1</span></div>
        <div class="hud-cell"><span class="hud-label">Score</span><span id="hud-score">0</span></div>
        <div class="hud-cell"><span class="hud-label">High</span><span id="hud-high">0</span></div>
      </header>

      <section id="screen-title" class="screen">
        <h1 class="title">Stratagem Hero</h1>
        <p class="subtitle">Enter the codes. Serve democracy.</p>
        <p class="hint">Press <kbd>Enter</kbd> to begin</p>
        <ol id="score-table" class="score-table"></ol>
        <div class="sync-row">
          <button id="sync-button" type="button" class="sync-button">Sync stratagems from wiki</button>
          <p id="sync-status" class="sync-status" role="status"></p>
        </div>
      </section>

      <section id="screen-playing" class="screen" hidden>
        <div class="timer-track"><div id="timer-bar" class="timer-bar"></div></div>

        <div class="stratagem">
          <img id="stratagem-icon" class="stratagem-icon" alt="" hidden />
          <h2 id="stratagem-name" class="stratagem-name"></h2>
          <p id="stratagem-category" class="stratagem-category"></p>
        </div>

        <div id="arrow-row" class="arrow-row"></div>
        <p id="queue-count" class="queue-count"></p>
      </section>

      <section id="screen-round-complete" class="screen" hidden>
        <h2 class="banner">Round <span id="complete-round"></span> complete</h2>
        <p id="complete-bonus" class="banner-detail"></p>
        <p class="hint">Press <kbd>Enter</kbd> to continue</p>
      </section>

      <section id="screen-game-over" class="screen" hidden>
        <h2 class="banner banner-fail">Game over</h2>
        <p id="final-score" class="banner-detail"></p>
        <form id="highscore-form" class="highscore-form" hidden>
          <label for="highscore-name">New high score. Name:</label>
          <input id="highscore-name" maxlength="12" autocomplete="off" />
          <button type="submit">Submit</button>
        </form>
        <p class="hint">Press <kbd>Enter</kbd> for the title screen</p>
      </section>
    </main>

    <script type="module" src="src/main.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Write `styles.css`**

```css
/* Helldivers 2 arcade treatment: Super Earth yellow on black, hard edges,
   heavy uppercase type. Every visual here is CSS or SVG - no ripped assets. */

:root {
  --yellow: #ffe20a;
  --yellow-dim: #8a7b06;
  --black: #0a0a0a;
  --panel: #141414;
  --red: #ff3b30;
  --text: #f5f5f5;
  --muted: #8b8b8b;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: var(--black);
  color: var(--text);
  font-family: 'Chakra Petch', 'Segoe UI', system-ui, sans-serif;
  text-transform: uppercase;
  overflow: hidden;
}

.cabinet {
  position: relative;
  width: min(920px, 96vw);
  min-height: min(640px, 92vh);
  padding: 1.5rem;
  background: var(--panel);
  border: 3px solid var(--yellow);
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  overflow: hidden;
}

.scanlines {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: repeating-linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0) 0 2px,
    rgba(0, 0, 0, 0.28) 2px 4px
  );
  z-index: 5;
}

.hud {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
  border-bottom: 2px solid var(--yellow-dim);
  padding-bottom: 0.75rem;
  font-size: 1.25rem;
  letter-spacing: 0.08em;
}

.hud-cell { display: flex; flex-direction: column; align-items: center; }
.hud-label { font-size: 0.7rem; color: var(--muted); letter-spacing: 0.2em; }

.screen {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  text-align: center;
}

.screen[hidden] { display: none; }

.title { margin: 0; font-size: clamp(2rem, 7vw, 4rem); color: var(--yellow); letter-spacing: 0.1em; }
.subtitle { margin: 0; color: var(--muted); letter-spacing: 0.2em; font-size: 0.85rem; }
.hint { color: var(--muted); font-size: 0.8rem; letter-spacing: 0.15em; }

kbd {
  background: var(--yellow);
  color: var(--black);
  padding: 0.1rem 0.4rem;
  font-family: inherit;
  font-weight: 700;
}

.timer-track { width: 100%; height: 14px; background: #000; border: 2px solid var(--yellow-dim); }
.timer-bar { height: 100%; width: 100%; background: var(--yellow); transition: width 80ms linear; }
.timer-bar.critical { background: var(--red); }

.stratagem { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; }
.stratagem-icon { width: 88px; height: 88px; background: var(--yellow); padding: 6px; }
.stratagem-name { margin: 0; font-size: clamp(1.25rem, 4vw, 2.25rem); color: var(--yellow); }
.stratagem-category { margin: 0; color: var(--muted); font-size: 0.75rem; letter-spacing: 0.2em; }

.arrow-row { display: flex; gap: 0.6rem; flex-wrap: wrap; justify-content: center; }

.arrow {
  width: 54px;
  height: 54px;
  display: grid;
  place-items: center;
  border: 2px solid var(--yellow-dim);
  color: var(--yellow-dim);
  font-size: 1.6rem;
  line-height: 1;
}

.arrow.done { background: var(--yellow); color: var(--black); border-color: var(--yellow); }

.queue-count { color: var(--muted); font-size: 0.75rem; letter-spacing: 0.2em; }

.banner { margin: 0; font-size: clamp(1.5rem, 5vw, 3rem); color: var(--yellow); }
.banner-fail { color: var(--red); }
.banner-detail { color: var(--text); letter-spacing: 0.1em; }

.score-table { list-style: none; margin: 1rem 0 0; padding: 0; width: min(340px, 80%); font-size: 0.85rem; }
.score-table li { display: flex; justify-content: space-between; border-bottom: 1px solid #262626; padding: 0.2rem 0; }
.score-table li span:last-child { color: var(--yellow); }

.sync-row { display: flex; flex-direction: column; align-items: center; gap: 0.4rem; margin-top: 0.5rem; }

.sync-button {
  font: inherit;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  background: transparent;
  color: var(--yellow);
  border: 2px solid var(--yellow);
  padding: 0.5rem 1.1rem;
  cursor: pointer;
}

.sync-button:hover:not(:disabled) { background: var(--yellow); color: var(--black); }
.sync-button:disabled { opacity: 0.5; cursor: progress; }

.sync-status { margin: 0; font-size: 0.7rem; letter-spacing: 0.15em; color: var(--muted); min-height: 1rem; }
.sync-status.error { color: var(--red); }

.highscore-form { display: flex; gap: 0.5rem; align-items: center; }
.highscore-form input { font: inherit; text-transform: uppercase; background: #000; color: var(--yellow); border: 2px solid var(--yellow); padding: 0.35rem 0.5rem; width: 8ch; }
.highscore-form button { font: inherit; text-transform: uppercase; background: var(--yellow); color: var(--black); border: 0; padding: 0.4rem 0.9rem; cursor: pointer; }

/* Error feedback: a red shake on the whole cabinet. */
.cabinet.wrong { animation: shake 180ms ease-in-out; }
.cabinet.wrong .arrow { border-color: var(--red); color: var(--red); }

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-9px); }
  75% { transform: translateX(9px); }
}

@media (prefers-reduced-motion: reduce) {
  .cabinet.wrong { animation: none; }
  .timer-bar { transition: none; }
}
```

- [ ] **Step 3: Write `src/input.js`**

```js
// Keyboard to direction. Both WASD and the arrow keys, because the real game
// accepts both and muscle memory splits between them.

const KEY_MAP = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
};

export function attachInput(handler) {
  function onKeyDown(event) {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;

    // Never hijack typing in the high-score name field.
    if (event.target instanceof HTMLInputElement) return;

    if (event.code === 'Enter' || event.code === 'NumpadEnter') {
      event.preventDefault();
      handler('confirm');
      return;
    }

    const direction = KEY_MAP[event.code];
    if (!direction) return;

    event.preventDefault(); // stop arrow keys scrolling the page
    handler(direction);
  }

  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}
```

- [ ] **Step 4: Write `src/render.js`**

```js
// State to DOM. Contains no rules - if a number is decided here, it belongs
// in config.js and game.js instead.

import { PHASE } from './game.js';
import { CONFIG } from './config.js';

const GLYPHS = { up: '↑', down: '↓', left: '←', right: '→' };
const CRITICAL_FRACTION = 0.25;

export function queryElements() {
  const id = (name) => document.getElementById(name);
  return {
    cabinet: document.querySelector('.cabinet'),
    screens: {
      [PHASE.TITLE]: id('screen-title'),
      [PHASE.PLAYING]: id('screen-playing'),
      [PHASE.ROUND_COMPLETE]: id('screen-round-complete'),
      [PHASE.GAME_OVER]: id('screen-game-over'),
    },
    round: id('hud-round'),
    score: id('hud-score'),
    high: id('hud-high'),
    timerBar: id('timer-bar'),
    icon: id('stratagem-icon'),
    name: id('stratagem-name'),
    category: id('stratagem-category'),
    arrowRow: id('arrow-row'),
    queueCount: id('queue-count'),
    completeRound: id('complete-round'),
    completeBonus: id('complete-bonus'),
    finalScore: id('final-score'),
    scoreTable: id('score-table'),
    syncButton: id('sync-button'),
    syncStatus: id('sync-status'),
    highscoreForm: id('highscore-form'),
    highscoreName: id('highscore-name'),
  };
}

function showScreen(elements, phase) {
  const visible = phase === PHASE.ROUND_INTRO ? PHASE.PLAYING : phase;
  for (const [key, element] of Object.entries(elements.screens)) {
    element.hidden = key !== visible;
  }
}

function renderArrows(elements, stratagem, progress) {
  elements.arrowRow.replaceChildren(
    ...stratagem.code.map((direction, i) => {
      const cell = document.createElement('div');
      cell.className = i < progress ? 'arrow done' : 'arrow';
      cell.textContent = GLYPHS[direction];
      return cell;
    })
  );
}

function renderIcon(elements, stratagem) {
  if (!stratagem.icon) {
    elements.icon.hidden = true;
    return;
  }
  elements.icon.hidden = false;
  elements.icon.src = stratagem.icon;
  elements.icon.alt = '';
  // A dead wiki URL must not leave a broken-image box on screen.
  elements.icon.onerror = () => { elements.icon.hidden = true; };
}

function renderScoreTable(elements, scores) {
  if (scores.length === 0) {
    elements.scoreTable.replaceChildren();
    return;
  }

  elements.scoreTable.replaceChildren(
    ...scores.map((entry, i) => {
      const row = document.createElement('li');
      const left = document.createElement('span');
      const right = document.createElement('span');
      left.textContent = `${i + 1}. ${entry.name}`;
      right.textContent = entry.score.toLocaleString('en-US');
      row.append(left, right);
      return row;
    })
  );
}

export function render(state, elements, { scores = [], syncMessage = null, syncError = false } = {}) {
  showScreen(elements, state.phase);

  elements.round.textContent = String(Math.max(1, state.round));
  elements.score.textContent = state.score.toLocaleString('en-US');
  elements.high.textContent = (scores[0]?.score ?? 0).toLocaleString('en-US');

  if (state.phase === PHASE.PLAYING) {
    const fraction = state.timeRemaining / CONFIG.ROUND_TIME;
    elements.timerBar.style.width = `${Math.max(0, fraction) * 100}%`;
    elements.timerBar.classList.toggle('critical', fraction <= CRITICAL_FRACTION);

    const current = state.sequence[state.index];
    if (current) {
      elements.name.textContent = current.name;
      elements.category.textContent = current.category ?? '';
      renderIcon(elements, current);
      renderArrows(elements, current, state.progress);
      elements.queueCount.textContent = `${state.index + 1} / ${state.sequence.length}`;
    }
  }

  if (state.phase === PHASE.ROUND_COMPLETE) {
    elements.completeRound.textContent = String(state.round);
    const perfect = state.roundErrors === 0 ? 'Perfect round. ' : '';
    elements.completeBonus.textContent = `${perfect}Bonus ${state.lastRoundBonus.toLocaleString('en-US')}`;
  }

  if (state.phase === PHASE.GAME_OVER) {
    elements.finalScore.textContent = `Final score ${state.score.toLocaleString('en-US')} on round ${state.round}`;
  }

  if (state.phase === PHASE.TITLE) {
    renderScoreTable(elements, scores);
  }

  elements.syncStatus.textContent = syncMessage ?? '';
  elements.syncStatus.classList.toggle('error', Boolean(syncError));

  elements.cabinet.classList.toggle('wrong', Boolean(state.wrongFlash));
}
```

- [ ] **Step 5: Write `src/main.js` (without sync — that arrives in Task 6)**

```js
// Composition root: load data, build the game, run the frame loop, wire the UI.
// No game rules live here.

import { createGame, PHASE } from './game.js';
import { loadStratagems } from './data.js';
import { loadScores, recordScore, isHighScore } from './scores.js';
import { attachInput } from './input.js';
import { queryElements, render } from './render.js';

const elements = queryElements();
const ui = { scores: loadScores(), syncMessage: null, syncError: false };

let game;

async function loadBundled() {
  const response = await fetch('./data/stratagems.json');
  if (!response.ok) throw new Error(`could not load data/stratagems.json (${response.status})`);
  const payload = await response.json();
  return payload.stratagems ?? [];
}

function paint() {
  render(game.state, elements, ui);
}

function onInput(action) {
  const { phase } = game.state;

  if (action === 'confirm') {
    if (phase === PHASE.TITLE) game.start();
    else if (phase === PHASE.ROUND_COMPLETE) game.nextRound();
    else if (phase === PHASE.GAME_OVER) returnToTitle();
    paint();
    return;
  }

  game.input(action);
  paint();

  if (game.state.wrongFlash) {
    // Clear the shake after the animation so the next paint is clean.
    setTimeout(() => {
      game.state.wrongFlash = false;
      paint();
    }, 200);
  }

  if (game.state.phase === PHASE.GAME_OVER) onGameOver();
}

function returnToTitle() {
  game.state.phase = PHASE.TITLE;
  ui.scores = loadScores();
  elements.highscoreForm.hidden = true;
  paint();
}

function onGameOver() {
  elements.highscoreForm.hidden = !isHighScore(game.state.score);
  if (!elements.highscoreForm.hidden) elements.highscoreName.focus();
  paint();
}

elements.highscoreForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = (elements.highscoreName.value || 'HELLDIVER').trim().toUpperCase().slice(0, 12);
  ui.scores = recordScore({ name, score: game.state.score, round: game.state.round });
  elements.highscoreName.value = '';
  elements.highscoreForm.hidden = true;
  paint();
});

function startLoop() {
  let last = performance.now();

  function frame(now) {
    const delta = Math.min((now - last) / 1000, 0.25); // ignore huge gaps from a backgrounded tab
    last = now;

    if (game.state.phase === PHASE.PLAYING) {
      const wasPlaying = true;
      game.tick(delta);
      paint();
      if (wasPlaying && game.state.phase === PHASE.GAME_OVER) onGameOver();
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

async function boot() {
  try {
    const bundled = await loadBundled();
    const { stratagems } = loadStratagems(bundled);
    game = createGame(stratagems);
    attachInput(onInput);
    paint();
    startLoop();
  } catch (error) {
    document.querySelector('.cabinet').innerHTML =
      `<p style="color:#ff3b30;padding:2rem;text-align:center">Failed to start: ${error.message}</p>`;
  }
}

boot();
```

- [ ] **Step 6: Play it**

The page uses ES modules and `fetch`, so it must be served over HTTP — opening the file directly will fail on CORS.

```bash
node --run-if-present serve 2>/dev/null || npx --yes serve . -l 8000
```

If `npx` is unavailable, use Python: `python -m http.server 8000`.

Open `http://localhost:8000`, then check each item:

1. The title screen shows, with the score table empty.
2. Enter starts round 1 with six stratagems and a full timer bar.
3. Entering the shown code correctly advances to the next stratagem and nudges the timer bar up.
4. A wrong arrow shakes the cabinet, turns the arrows red, and resets the filled arrows to none.
5. Letting the timer run out shows Game over with a final score.
6. Completing all six shows Round 1 complete with a bonus, and Enter starts round 2 with seven.
7. Icons appear for most stratagems; any that fail to load leave no broken-image box.
8. Arrow keys do not scroll the page.

- [ ] **Step 7: Commit**

```bash
git add index.html styles.css src/input.js src/render.js src/main.js
git commit -m "feat: playable stratagem hero UI with keyboard input and rendering"
```

---

## Task 6: In-game sync, plus a README

Wires the SYNC button to the wiki fetcher, surfaces every failure mode from spec §7, and documents the project.

**Files:**
- Modify: `src/main.js`
- Create: `README.md`

**Interfaces:**
- Consumes: `fetchStratagems` (Task 2), `saveStratagems` (Task 4), the `ui` object and `paint` (Task 5).
- Produces: nothing that later tasks depend on.

- [ ] **Step 1: Add the sync handler to `src/main.js`**

Add these imports to the existing import block:

```js
import { fetchStratagems } from './wiki.js';
import { saveStratagems } from './data.js';
```

Note `saveStratagems` joins the existing `loadStratagems` import from `./data.js` — merge them into one import statement rather than adding a second line for the same module.

Then add this block above `boot()`:

```js
elements.syncButton.addEventListener('click', async () => {
  // A sync must never be able to leave the game unplayable: on any failure we
  // keep the dataset already in play and only report what happened.
  elements.syncButton.disabled = true;
  ui.syncMessage = 'Contacting helldivers.wiki.gg ...';
  ui.syncError = false;
  paint();

  try {
    const { records, skipped } = await fetchStratagems(fetch);
    saveStratagems(records);

    game = createGame(records);
    ui.syncMessage = `Synced ${records.length} stratagems (${skipped.length} pages skipped)`;
    ui.syncError = false;
  } catch (error) {
    ui.syncMessage = `Sync failed: ${error.message}`;
    ui.syncError = true;
  } finally {
    elements.syncButton.disabled = false;
    paint();
  }
});
```

- [ ] **Step 2: Verify the success path**

Reload `http://localhost:8000`, click **Sync stratagems from wiki**, and confirm:

1. The status line shows the contacting message while it runs and the button is disabled.
2. It finishes with `Synced N stratagems`, where N is near 100 and at least 40.
3. `localStorage.getItem('hd2sh.stratagems')` in the browser console returns a JSON array.
4. Pressing Enter starts a normal game using the freshly synced data.

- [ ] **Step 3: Verify the three failure paths**

These are the spec §7 rows that matter, and each has to be provoked deliberately.

**Network failure.** Open DevTools, set the network to Offline, click Sync. Expected: a red `Sync failed: ...` line, the button re-enabled, and the game still playable on Enter.

**Corrupt stored dataset.** In the console:

```js
localStorage.setItem('hd2sh.stratagems', 'not json at all');
location.reload();
```

Expected: the game boots normally from the bundled file. Confirm the fallback really happened rather than the corrupt value being read:

```js
localStorage.removeItem('hd2sh.stratagems');
```

**Sanity gate.** In the console:

```js
localStorage.setItem('hd2sh.stratagems', JSON.stringify([{ name: 'X', category: 'Y', code: ['sideways'] }]));
location.reload();
```

Expected: the invalid direction fails validation, the game falls back to the bundled dataset and starts normally. Clean up with `localStorage.removeItem('hd2sh.stratagems')`.

- [ ] **Step 4: Write `README.md`**

````markdown
# Stratagem Hero

A browser clone of the Stratagem Hero arcade minigame from Helldivers 2.
No build step, no dependencies — open it and play.

## Play

The game uses ES modules and `fetch`, so it needs to be served over HTTP
rather than opened as a file:

```bash
python -m http.server 8000
# then open http://localhost:8000
```

Arrow keys or WASD to enter codes. Enter to start, advance, and restart.

## Rules

Round 1 has 6 stratagems; each round adds one, capping at 16 from round 11.
One countdown runs per round, a correct entry adds a little time back, and a
wrong arrow restarts the current code. The round ends when you clear it or the
timer hits zero.

Scoring rewards longer codes, faster entry, later rounds, clean rounds, and
leftover time. **The real game's formula has never been published** — the wiki
gives no numbers — so ours is a deliberate approximation. Every constant lives
in `src/config.js`; change them there.

## Updating the stratagem list

Data comes from [The Helldivers Wiki](https://helldivers.wiki.gg). Two ways to
refresh it:

- **In-game:** press *Sync stratagems from wiki* on the title screen. The result
  is cached in your browser only.
- **In the repo:** `npm run update-data` rewrites `data/stratagems.json` so the
  change can be committed.

A sync that yields fewer than 40 stratagems is rejected outright — that means
the wiki changed its templates and the parser needs updating, not that the list
shrank.

## Tests

```bash
npm test
```

Runs on Node's built-in test runner. No install step.

## Notes

Stratagem icons are loaded from wiki.gg by URL; no game assets are stored in
this repository. Helldivers 2 is a trademark of Arrowhead Game Studios. This is
an unaffiliated fan project.
````

- [ ] **Step 5: Run the full suite one more time**

Run: `npm test`
Expected: PASS, 64 tests. No test should have started passing or failing as a result of Tasks 5 and 6, which touched only untested UI files.

- [ ] **Step 6: Commit**

```bash
git add src/main.js README.md
git commit -m "feat: add in-game wiki sync with failure handling, and a README"
```

---

## Self-Review

**Spec coverage.** Every spec section maps to a task:

| Spec section | Task |
|---|---|
| §2 decisions (no build step, arcade only) | Task 1 `package.json`; Task 5 `index.html` |
| §3 verified rules (6→16, timer, error reset) | Task 3 |
| §4 invented scoring (incl. `POINTS_PER_ARROW`) | Task 3 `config.js`, `stratagemScore`, `roundBonus` |
| §5 module contracts and state machine | Tasks 1, 3, 4, 5 |
| §5 data flow (localStorage over bundled) | Task 4 `pickDataset`; Task 6 sync handler |
| §6 wiki extraction and record shape | Tasks 1 and 2 |
| §6 asset policy (URLs, never files) | Task 2 `resolveIconUrls`; Task 6 README note |
| §7 all six error-handling rows | Task 2 sanity gate; Task 4 validation; Task 5 icon `onerror` and boot failure; Task 6 manual verification |
| §8 all eight test cases | Tasks 1–4 |
| §9 out of scope | Nothing implements audio, practice mode, or leaderboards |

**Placeholder scan.** No "TBD", no "add error handling", no "similar to Task N". Every code step carries runnable code; every verification step names the command and the expected result.

**Type consistency.** Checked across tasks: `parseStratagem` returns `{name, category, code, icon}` where `icon` is a *filename* in Task 1 and is replaced by a *URL* in Task 2 by `resolveIconUrls` — this transition is stated in both tasks' Interfaces blocks. `createGame(stratagems, {config, shuffle})` is called with the options object in Tasks 3, 5, and 6 consistently. `state.roundScoreTotal` is asserted in a Task 3 test and defined in the Task 3 state object. `render(state, elements, extras)` is called as `render(game.state, elements, ui)` in Task 5, and `ui` carries exactly the `{scores, syncMessage, syncError}` keys `render` destructures.

One gap found and closed during review: the Task 5 `ui` object originally lacked `syncError`, which `render` reads — added at its declaration so Task 5 works before Task 6 exists.
