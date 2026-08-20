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
