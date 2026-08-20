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
