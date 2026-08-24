// State to DOM. Contains no rules - if a number is decided here, it belongs
// in config.js and game.js instead.

import { PHASE } from './game.js';
import { CONFIG } from './config.js';

// Directions are drawn as one block-arrow path rotated per direction, rather
// than as text glyphs: font arrows render thin and vary by fallback font, which
// made them hard to read against the cabinet at a glance. The shape copies the
// in-game one - a broad head over a short stem, no box around it.
const SVG_NS = 'http://www.w3.org/2000/svg';
const ARROW_PATH = 'M50 4 L94 56 L65 56 L65 92 L35 92 L35 56 L6 56 Z';
const ROTATION = { up: 0, right: 90, down: 180, left: 270 };
const CRITICAL_FRACTION = 0.25;

// How many stratagems past the current one the queue previews. The round can
// hold fewer than this, in which case the row simply ends early.
const QUEUE_PREVIEW = 10;

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
    queue: id('stratagem-queue'),
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
  for (const [key, element] of Object.entries(elements.screens)) {
    element.hidden = key !== phase;
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
      cell.className = 'arrow';
      if (i < progress) cell.classList.add('done');
      else if (i === progress) cell.classList.add('current');
      cell.append(arrowGlyph(direction));
      return cell;
    })
  );
}

function arrowGlyph(direction) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('class', 'arrow-glyph');
  svg.setAttribute('aria-hidden', 'true');

  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', ARROW_PATH);
  path.setAttribute('fill', 'currentColor');
  path.setAttribute('transform', `rotate(${ROTATION[direction]} 50 50)`);

  svg.append(path);
  return svg;
}

// The queue shows the stratagem being entered plus the ones lined up behind it.
// Rebuilding it means re-creating up to eleven <img> elements, so it is rebuilt
// only when the round or the position within it actually changes - never on a
// plain re-paint.
let queueCache = { sequence: null, index: null };

function renderQueue(elements, sequence, index) {
  if (queueCache.sequence === sequence && queueCache.index === index) return;
  queueCache = { sequence, index };

  elements.queue.replaceChildren(
    ...sequence
      .slice(index, index + QUEUE_PREVIEW + 1)
      .map((stratagem, offset) => queueIcon(stratagem, offset === 0))
  );
}

function queueIcon(stratagem, isCurrent) {
  const cell = document.createElement('div');
  cell.className = isCurrent ? 'queue-icon current' : 'queue-icon';
  cell.title = stratagem.name;

  if (!stratagem.icon) return cell;

  const img = document.createElement('img');
  img.alt = '';
  // Every icon is a separate wiki URL, so any one of them can 404. A dead URL
  // hides its own image and leaves the empty cell standing, which keeps the
  // rest of the queue in place instead of shifting it left.
  img.onerror = () => {
    img.hidden = true;
  };
  img.src = stratagem.icon;

  cell.append(img);
  return cell;
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
      renderQueue(elements, state.sequence, state.index);
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
