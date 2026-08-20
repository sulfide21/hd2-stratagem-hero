// The rules of Stratagem Hero, as a pure state machine.
//
// This module never reads the clock, never touches the DOM, and never calls
// Math.random. Time arrives through tick(), randomness through an injected
// shuffle. That is what makes the whole thing testable under node --test.

import { CONFIG as DEFAULT_CONFIG } from './config.js';

export const PHASE = {
  TITLE: 'TITLE',
  ROUND_INTRO: 'ROUND_INTRO',
  PLAYING: 'PLAYING',
  ROUND_COMPLETE: 'ROUND_COMPLETE',
  GAME_OVER: 'GAME_OVER',
};

export function roundSize(round, config = DEFAULT_CONFIG) {
  return Math.min(config.FIRST_ROUND_SIZE + (round - 1), config.MAX_ROUND_SIZE);
}

export function stratagemScore({ codeLength, round, elapsed, errors }, config = DEFAULT_CONFIG) {
  const raw = (config.BASE_POINTS + config.POINTS_PER_ARROW * codeLength) * round;
  const speedFactor = Math.max(0, Math.min(1, 1 - elapsed / config.SPEED_WINDOW));
  const speed = raw * config.SPEED_BONUS_MAX * speedFactor;
  return Math.max(0, Math.round(raw + speed - errors * config.ERROR_PENALTY));
}

export function roundBonus({ round, errors, timeRemaining }, config = DEFAULT_CONFIG) {
  const perfect = errors === 0 ? config.PERFECT_ROUND_BONUS * round : 0;
  return perfect + Math.floor(timeRemaining) * config.TIME_BONUS_PER_SECOND;
}

function defaultShuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function createGame(stratagems, { config = DEFAULT_CONFIG, shuffle = defaultShuffle } = {}) {
  if (!Array.isArray(stratagems) || stratagems.length === 0) {
    throw new Error('createGame: no stratagems available');
  }

  const state = {
    phase: PHASE.TITLE,
    round: 0,
    score: 0,
    roundScoreTotal: 0,
    lastRoundBonus: 0,
    timeRemaining: 0,
    sequence: [],
    index: 0,
    progress: 0,
    stratagemErrors: 0,
    roundErrors: 0,
    wrongFlash: false,
  };

  let stratagemElapsed = 0;

  function drawSequence(round) {
    const wanted = roundSize(round, config);
    const drawn = [];
    // The pool can be smaller than the round, so keep reshuffling until full.
    while (drawn.length < wanted) {
      drawn.push(...shuffle(stratagems));
    }
    return drawn.slice(0, wanted);
  }

  function beginRound(round) {
    state.phase = PHASE.PLAYING;
    state.round = round;
    state.sequence = drawSequence(round);
    state.index = 0;
    state.progress = 0;
    state.stratagemErrors = 0;
    state.roundErrors = 0;
    state.roundScoreTotal = 0;
    state.lastRoundBonus = 0;
    state.timeRemaining = config.ROUND_TIME;
    state.wrongFlash = false;
    stratagemElapsed = 0;
  }

  function completeStratagem() {
    const current = state.sequence[state.index];
    state.roundScoreTotal += stratagemScore(
      { codeLength: current.code.length, round: state.round, elapsed: stratagemElapsed, errors: state.stratagemErrors },
      config
    );

    state.timeRemaining = Math.min(config.ROUND_TIME, state.timeRemaining + config.TIME_PER_CORRECT);
    state.index += 1;
    state.progress = 0;
    state.stratagemErrors = 0;
    stratagemElapsed = 0;

    if (state.index >= state.sequence.length) completeRound();
  }

  function completeRound() {
    state.lastRoundBonus = roundBonus(
      { round: state.round, errors: state.roundErrors, timeRemaining: state.timeRemaining },
      config
    );
    state.score += state.roundScoreTotal + state.lastRoundBonus;
    state.phase = PHASE.ROUND_COMPLETE;
  }

  return {
    state,

    start() {
      state.score = 0;
      beginRound(1);
    },

    nextRound() {
      const carried = state.score;
      beginRound(state.round + 1);
      state.score = carried;
    },

    input(direction) {
      if (state.phase !== PHASE.PLAYING) return;

      const expected = state.sequence[state.index].code[state.progress];
      if (direction === expected) {
        state.wrongFlash = false;
        state.progress += 1;
        if (state.progress >= state.sequence[state.index].code.length) completeStratagem();
      } else {
        state.progress = 0;
        state.stratagemErrors += 1;
        state.roundErrors += 1;
        state.wrongFlash = true;
      }
    },

    tick(deltaSeconds) {
      if (state.phase !== PHASE.PLAYING) return;

      stratagemElapsed += deltaSeconds;
      state.timeRemaining = Math.max(0, state.timeRemaining - deltaSeconds);
      if (state.timeRemaining === 0) state.phase = PHASE.GAME_OVER;
    },
  };
}
