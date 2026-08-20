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
