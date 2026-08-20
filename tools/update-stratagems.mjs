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
