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

// paint() runs on every animation frame, so the arrow row and icon renderers
// below cache what they last drew and skip the DOM work when nothing that
// affects them has changed. This is a rendering-cost optimisation only - it
// makes no decision about game state.

let arrowCache = { stratagem: null, progress: null };

function renderArrows(elements, stratagem, progress) {
  if (arrowCache.stratagem === stratagem && arrowCache.progress === progress) return;
  arrowCache = { stratagem, progress };

  elements.arrowRow.replaceChildren(
    ...stratagem.code.map((direction, i) => {
      const cell = document.createElement('div');
      cell.className = i < progress ? 'arrow done' : 'arrow';
      cell.textContent = GLYPHS[direction];
      return cell;
    })
  );
}

// Tracks the icon URL currently loaded (or attempted) into the <img>, and
// whether that attempt failed, so a same-stratagem re-paint neither restarts
// the image load nor un-hides an icon that already 404'd.
let iconState = { url: null, failed: false };

function renderIcon(elements, stratagem) {
  if (!stratagem.icon) {
    iconState = { url: null, failed: false };
    elements.icon.hidden = true;
    return;
  }

  if (iconState.url !== stratagem.icon) {
    iconState = { url: stratagem.icon, failed: false };
    elements.icon.alt = '';
    // A dead wiki URL must not leave a broken-image box on screen.
    elements.icon.onerror = () => {
      iconState.failed = true;
      elements.icon.hidden = true;
    };
    elements.icon.src = stratagem.icon;
  }

  elements.icon.hidden = iconState.failed;
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
    elements.timerBar.style.width = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
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
