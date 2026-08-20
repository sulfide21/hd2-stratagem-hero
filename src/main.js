// Composition root: load data, build the game, run the frame loop, wire the UI.
// No game rules live here.

import { createGame, PHASE } from './game.js';
import { loadStratagems, saveStratagems } from './data.js';
import { loadScores, recordScore, isHighScore } from './scores.js';
import { attachInput } from './input.js';
import { queryElements, render } from './render.js';
import { fetchStratagems } from './wiki.js';

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
      game.tick(delta);
      paint();
      if (game.state.phase === PHASE.GAME_OVER) onGameOver();
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

elements.syncButton.addEventListener('click', async () => {
  // A sync must never be able to leave the game unplayable: on any failure we
  // keep the dataset already in play and only report what happened.
  elements.syncButton.disabled = true;
  ui.syncMessage = 'Contacting helldivers.wiki.gg ...';
  ui.syncError = false;
  paint();

  try {
    const { records, skipped } = await fetchStratagems(fetch.bind(globalThis));
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
