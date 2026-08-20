# Stratagem Hero — Design

**Date:** 2026-08-20
**Status:** Approved
**Scope:** A browser clone of the Stratagem Hero arcade minigame from Helldivers 2.

## 1. Goal

Reproduce the Stratagem Hero arcade loop in the browser: rounds of stratagems, each with a directional code the player enters against a countdown timer. Score, round progression, and a local high-score table. Nothing else.

The game runs from a local `index.html` with no build step and no package manager. It works offline.

## 2. Decisions

| Decision | Choice |
|---|---|
| Platform | Browser, vanilla HTML/CSS/JS, ES modules, no build step |
| Scope | Arcade mode only — no practice mode, no per-stratagem stats |
| Data | Bundled `data/stratagems.json`, refreshable from helldivers.wiki.gg |
| Updater | Both an in-game SYNC button and a Node regeneration script |
| Visuals | Faithful Helldivers 2 styling in CSS, with real stratagem icons from the wiki |
| Audio | Out of scope |

## 3. Verified game rules

Confirmed against The Helldivers Wiki (`helldivers.wiki.gg/wiki/Stratagem_Hero`):

- Round 1 presents **6 stratagems**. Each subsequent round adds one.
- The count **caps at 16** from round 11 onward.
- A countdown timer runs per round. Completing a stratagem correctly replenishes some time.
- A round ends when every stratagem is entered correctly, or the timer reaches zero.
- A wrong input resets entry of the current stratagem to its first arrow and penalises that stratagem's score.
- Score depends on code complexity, entry speed, and error count.

The game is played with the four directions only. Unlike in-mission stratagem calls, no modifier key is held.

## 4. Invented rules

The real scoring formula is not published. The wiki gives no numbers, and the most-used community clone states it invented its own. Ours is therefore a deliberate approximation, and every constant lives in `src/config.js` so it can be tuned without touching game logic.

```js
export const CONFIG = {
  FIRST_ROUND_SIZE: 6,
  MAX_ROUND_SIZE: 16,
  ROUND_TIME: 10.0,          // seconds, fresh at the start of each round
  TIME_PER_CORRECT: 1.0,     // seconds added per completed stratagem
  BASE_POINTS: 100,          // multiplied by the round number
  POINTS_PER_ARROW: 20,      // longer codes are worth more
  SPEED_BONUS_MAX: 1.0,      // fast entry scales the base toward 2x
  SPEED_WINDOW: 3.0,         // seconds; entry faster than this earns full bonus
  ERROR_PENALTY: 25,         // per wrong arrow, per-stratagem score floored at 0
  PERFECT_ROUND_BONUS: 1000, // multiplied by the round number
  TIME_BONUS_PER_SECOND: 50,
};
```

Per-stratagem score:

```
raw   = (BASE_POINTS + POINTS_PER_ARROW * code.length) * round
speed = raw * SPEED_BONUS_MAX * clamp(1 - elapsed / SPEED_WINDOW, 0, 1)
score = max(0, raw + speed - errors * ERROR_PENALTY)
```

`code.length` is what makes the score depend on code complexity, as the verified
rules require: an eight-arrow stratagem is worth more than a three-arrow one.

Round-end score, awarded only when every stratagem in the round was entered:

```
bonus = (errors === 0 ? PERFECT_ROUND_BONUS * round : 0)
      + floor(timeRemaining) * TIME_BONUS_PER_SECOND
```

## 5. Architecture

Game logic is a pure state machine with no DOM access. The renderer reads state and paints. This keeps the rules testable under `node --test` and lets the scoring constants be retuned without manual play-testing.

```
index.html
styles.css
data/stratagems.json          generated, committed
src/config.js                 all tunable constants
src/data.js                   load: localStorage override, else bundled JSON
src/wiki.js                   wiki fetch + parse, shared by browser and Node
src/game.js                   pure state machine, no DOM
src/input.js                  keydown -> 'up' | 'down' | 'left' | 'right'
src/render.js                 state -> DOM
src/scores.js                 localStorage top-10
tools/update-stratagems.mjs   Node script, imports src/wiki.js
tests/game.test.mjs           node --test
```

### Module contracts

**`src/game.js`** — exports `createGame(stratagems, config)` returning an object with `state` (plain data), `input(direction)`, and `tick(deltaSeconds)`. Never reads the clock or the DOM itself; time arrives through `tick`. The shuffle function is passed in rather than calling `Math.random`
internally, so tests can supply a fixed order and get deterministic runs.

**`src/wiki.js`** — exports `fetchStratagems(fetchImpl)`. Takes a fetch function so the Node script and the browser share one implementation. Returns a validated array or throws.

**`src/render.js`** — exports `render(state)`. Reads state, writes DOM. Holds no game rules.

**`src/input.js`** — maps both arrow keys and WASD to directions, and dispatches them to the game. Prevents default scrolling on arrow keys.

### State machine

```
TITLE -> PLAYING -> ROUND_COMPLETE -> PLAYING
            |                         (next round)
            v
        GAME_OVER -> HIGHSCORE_ENTRY -> TITLE
```

`PLAYING` ends in `ROUND_COMPLETE` when the round's last stratagem is entered, or in `GAME_OVER` when the timer reaches zero.

### Data flow

```
tools/update-stratagems.mjs --> data/stratagems.json --> src/data.js --> game
in-game SYNC button --------> localStorage ----------------^
```

`src/data.js` prefers a valid localStorage dataset over the bundled file, and falls back to the bundled file whenever the stored one is missing or fails validation.

## 6. Stratagem data

Source: the MediaWiki API at `helldivers.wiki.gg`, which sends `access-control-allow-origin: *`, so the browser can call it directly with no proxy and no server.

Extraction, verified by hand against `MG-43 Machine Gun`:

1. List pages in `Category:Stratagems` via `action=query&list=categorymembers`.
2. Fetch each page's wikitext via `action=parse&prop=wikitext`.
3. Read the infobox fields:
   - `stratagem_code = {{Stratagem_code|down|left|down|up|right}}` → the code
   - `source = Patriotic Administration Center` → the category
   - `stratagem_image = Machine Gun Stratagem Icon Background.svg` → the icon
4. Resolve each icon filename to a URL via `action=query&prop=imageinfo`.

Record shape:

```json
{
  "name": "MG-43 Machine Gun",
  "category": "Patriotic Administration Center",
  "code": ["down", "left", "down", "up", "right"],
  "icon": "https://helldivers.wiki.gg/images/Machine_Gun_Stratagem_Icon_Background.svg"
}
```

### Asset policy

Icon URLs are stored; icon files are not committed. The artwork stays on wiki.gg's servers and is referenced, not redistributed. All other visuals — palette, typography, arrows, scanlines — are written as CSS and SVG rather than taken from the game.

## 7. Error handling

| Failure | Behaviour |
|---|---|
| Sync request fails or times out | Keep the existing dataset, show an on-screen error, game stays playable |
| Fewer than 40 stratagems parse | Reject the entire sync as a template change, keep existing data |
| A single page fails to parse | Skip that stratagem, count it in a warning, continue |
| Stored dataset is malformed | Discard it, fall back to bundled JSON |
| Bundled JSON missing or empty | Refuse to start, show an explicit message rather than an empty round |
| An icon fails to load | Render the stratagem name as text in its place |

The sanity gate in row two is the important one: it is what stops a future wiki template change from silently emptying the game.

## 8. Testing

Test-driven, against `src/game.js` and `src/wiki.js`, run with `node --test tests/`. No dependencies to install.

Cases:

- Round sizing: round 1 gives 6, round 5 gives 10, round 11 onward gives 16.
- A correct full code advances to the next stratagem and adds `TIME_PER_CORRECT`.
- A wrong arrow resets progress on the current stratagem to index 0, increments its error count, and does not advance.
- The timer reaching zero mid-round produces `GAME_OVER`, not `ROUND_COMPLETE`.
- A zero-error round awards `PERFECT_ROUND_BONUS * round`; a round with any error awards none.
- Per-stratagem score never goes below zero regardless of error count.
- `wiki.js` parses a known-good wikitext fixture into the expected record.
- `wiki.js` rejects a fixture list shorter than the sanity threshold.

`render.js`, `input.js`, and the CSS are verified by playing the game, not by automated tests.

## 9. Out of scope

Practice mode, per-stratagem accuracy stats, audio, online leaderboards, accounts, mobile touch controls, and gamepad input. Any of these is a separate spec.
