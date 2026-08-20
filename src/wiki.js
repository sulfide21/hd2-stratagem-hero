// Parses Helldivers 2 stratagem data out of helldivers.wiki.gg wikitext.
//
// Two wiki quirks drive the regexes here, both confirmed against live pages:
//   1. The code template is spelled BOTH "Stratagem_code" and "Stratagem code".
//   2. The icon lives in "stratagem_image" on some infoboxes and plain "image"
//      on others, so we match on the filename convention instead of the field.

const DIRECTIONS = new Set(['up', 'down', 'left', 'right']);

const CODE_RE = /\{\{Stratagem[ _]code\|([^}]+)\}\}/i;
const SOURCE_RE = /^\s*\|?\s*source\s*=\s*(.+)$/im;
const TYPE_RE = /^\s*\|?\s*stratagem_type\s*=\s*(.+)$/im;
const ICON_RE = /=\s*([^=\n|]*Stratagem Icon Background\.svg)\s*$/im;

export function parseCode(wikitext) {
  const match = CODE_RE.exec(wikitext);
  if (!match) return null;

  // No filter(Boolean) here: a dangling pipe (e.g. "up|") produces an empty
  // token, and an empty token is not a valid direction, so it falls through
  // to the DIRECTIONS check below and rejects the whole code — same as an
  // unrecognized direction word would. Silently dropping empty tokens would
  // let malformed wiki markup produce a plausible-looking but wrong code.
  const parts = match[1].split('|').map((p) => p.trim().toLowerCase());
  if (parts.length === 0) return null;
  if (!parts.every((p) => DIRECTIONS.has(p))) return null;

  return parts;
}

// "[[Page#Anchor|Label]]" -> "Label";  "[[Hangar]]" -> "Hangar"; strips stray
// HTML (e.g. "<small></small>") and wiki markup left over in infobox fields.
function cleanCategoryField(raw) {
  return raw
    .replace(/<[^>]+>/g, '')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/'''?/g, '')
    .trim();
}

export function parseCategory(wikitext) {
  // Prefer the explicit "source" field (e.g. a warbond or store name). Some
  // pages (Aquifer Drill, Eagle Rearm, ...) have no source but do carry
  // "stratagem_type" (e.g. "Objective", "Ship") — a real label worth showing
  // rather than falling straight through to "Unknown".
  const sourceMatch = SOURCE_RE.exec(wikitext);
  if (sourceMatch) {
    const cleaned = cleanCategoryField(sourceMatch[1]);
    if (cleaned) return cleaned;
  }

  const typeMatch = TYPE_RE.exec(wikitext);
  if (typeMatch) {
    const cleaned = cleanCategoryField(typeMatch[1]);
    if (cleaned) return cleaned;
  }

  return 'Unknown';
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
    // April Fools/* pages are joke subpages of Category:Stratagems, not real
    // stratagems — they carry implausible codes (e.g. 17 arrows) that would
    // be unplayable inside the game's round timer. Skip them like any other
    // non-stratagem page rather than trying to parse them.
    if (page.title.startsWith('April Fools/')) {
      skipped.push(page.title);
      continue;
    }

    const record = parseStratagem(page.title, page.wikitext);
    if (record) records.push(record);
    else skipped.push(page.title);
  }

  records.sort((a, b) => a.name.localeCompare(b.name));
  return { records, skipped };
}

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
