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
