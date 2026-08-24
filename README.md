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

On Windows, double-clicking `play.bat` does both steps for you.

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
