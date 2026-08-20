import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { createGame, roundSize, stratagemScore, roundBonus, PHASE } from '../src/game.js';

// A deterministic stratagem pool: every code is [up, down] so tests can drive
// the machine without tracking which stratagem came up.
const pool = Array.from({ length: 20 }, (_, i) => ({
  name: `Stratagem ${i}`,
  category: 'Test',
  code: ['up', 'down'],
  icon: null,
}));

const noShuffle = (items) => items;
const newGame = (overrides = {}) => createGame(pool, { config: CONFIG, shuffle: noShuffle, ...overrides });

function enterCurrentCode(game) {
  for (const direction of game.state.sequence[game.state.index].code) {
    game.input(direction);
  }
}

test('roundSize starts at 6 and grows by one per round', () => {
  assert.equal(roundSize(1, CONFIG), 6);
  assert.equal(roundSize(2, CONFIG), 7);
  assert.equal(roundSize(5, CONFIG), 10);
});

test('roundSize caps at 16 from round 11 onward', () => {
  assert.equal(roundSize(11, CONFIG), 16);
  assert.equal(roundSize(12, CONFIG), 16);
  assert.equal(roundSize(50, CONFIG), 16);
});

test('start moves from TITLE to PLAYING with a full timer', () => {
  const game = newGame();
  assert.equal(game.state.phase, PHASE.TITLE);
  game.start();
  assert.equal(game.state.phase, PHASE.PLAYING);
  assert.equal(game.state.round, 1);
  assert.equal(game.state.sequence.length, 6);
  assert.equal(game.state.timeRemaining, CONFIG.ROUND_TIME);
});

test('a correct arrow advances progress without advancing the stratagem', () => {
  const game = newGame();
  game.start();
  game.input('up');
  assert.equal(game.state.progress, 1);
  assert.equal(game.state.index, 0);
});

test('completing a code advances to the next stratagem and resets progress', () => {
  const game = newGame();
  game.start();
  enterCurrentCode(game);
  assert.equal(game.state.index, 1);
  assert.equal(game.state.progress, 0);
});

test('completing a code adds time, clamped to the round maximum', () => {
  const game = newGame();
  game.start();
  game.tick(4);
  assert.equal(game.state.timeRemaining, CONFIG.ROUND_TIME - 4);
  enterCurrentCode(game);
  assert.equal(game.state.timeRemaining, CONFIG.ROUND_TIME - 4 + CONFIG.TIME_PER_CORRECT);
});

test('time never exceeds ROUND_TIME', () => {
  const game = newGame();
  game.start();
  game.tick(0.1);
  enterCurrentCode(game);
  assert.equal(game.state.timeRemaining, CONFIG.ROUND_TIME);
});

test('a wrong arrow resets progress to zero and counts an error', () => {
  const game = newGame();
  game.start();
  game.input('up');
  game.input('left');
  assert.equal(game.state.progress, 0);
  assert.equal(game.state.index, 0);
  assert.equal(game.state.stratagemErrors, 1);
  assert.equal(game.state.roundErrors, 1);
  assert.equal(game.state.wrongFlash, true);
});

test('a wrong arrow does not lose time beyond the normal countdown', () => {
  const game = newGame();
  game.start();
  const before = game.state.timeRemaining;
  game.input('left');
  assert.equal(game.state.timeRemaining, before);
});

test('finishing every stratagem ends the round in ROUND_COMPLETE', () => {
  const game = newGame();
  game.start();
  for (let i = 0; i < 6; i += 1) enterCurrentCode(game);
  assert.equal(game.state.phase, PHASE.ROUND_COMPLETE);
});

test('the timer reaching zero mid-round ends in GAME_OVER', () => {
  const game = newGame();
  game.start();
  game.tick(CONFIG.ROUND_TIME);
  assert.equal(game.state.phase, PHASE.GAME_OVER);
});

test('the timer never goes below zero', () => {
  const game = newGame();
  game.start();
  game.tick(999);
  assert.equal(game.state.timeRemaining, 0);
});

test('input is ignored once the game is over', () => {
  const game = newGame();
  game.start();
  game.tick(999);
  game.input('up');
  assert.equal(game.state.progress, 0);
});

test('nextRound advances the round and refills the timer', () => {
  const game = newGame();
  game.start();
  for (let i = 0; i < 6; i += 1) enterCurrentCode(game);
  game.nextRound();
  assert.equal(game.state.phase, PHASE.PLAYING);
  assert.equal(game.state.round, 2);
  assert.equal(game.state.sequence.length, 7);
  assert.equal(game.state.timeRemaining, CONFIG.ROUND_TIME);
  assert.equal(game.state.roundErrors, 0);
});

test('stratagemScore scales with code length', () => {
  const short = stratagemScore({ codeLength: 3, round: 1, elapsed: 99, errors: 0 }, CONFIG);
  const long = stratagemScore({ codeLength: 8, round: 1, elapsed: 99, errors: 0 }, CONFIG);
  assert.ok(long > short, `expected ${long} > ${short}`);
});

test('stratagemScore scales with the round number', () => {
  const early = stratagemScore({ codeLength: 5, round: 1, elapsed: 99, errors: 0 }, CONFIG);
  const late = stratagemScore({ codeLength: 5, round: 4, elapsed: 99, errors: 0 }, CONFIG);
  assert.equal(late, early * 4);
});

test('stratagemScore pays a full speed bonus for instant entry', () => {
  const instant = stratagemScore({ codeLength: 5, round: 1, elapsed: 0, errors: 0 }, CONFIG);
  const slow = stratagemScore({ codeLength: 5, round: 1, elapsed: CONFIG.SPEED_WINDOW, errors: 0 }, CONFIG);
  assert.equal(instant, slow * 2);
});

test('stratagemScore never returns a negative number', () => {
  assert.equal(stratagemScore({ codeLength: 3, round: 1, elapsed: 99, errors: 500 }, CONFIG), 0);
});

test('roundBonus pays the perfect bonus only with zero errors', () => {
  assert.equal(roundBonus({ round: 3, errors: 0, timeRemaining: 0 }, CONFIG), CONFIG.PERFECT_ROUND_BONUS * 3);
  assert.equal(roundBonus({ round: 3, errors: 1, timeRemaining: 0 }, CONFIG), 0);
});

test('roundBonus pays for whole leftover seconds', () => {
  assert.equal(roundBonus({ round: 1, errors: 1, timeRemaining: 4.9 }, CONFIG), 4 * CONFIG.TIME_BONUS_PER_SECOND);
});

test('a perfect round adds its bonus to the running score', () => {
  const game = newGame();
  game.start();
  const before = game.state.score;
  for (let i = 0; i < 6; i += 1) enterCurrentCode(game);
  assert.ok(game.state.lastRoundBonus >= CONFIG.PERFECT_ROUND_BONUS);
  assert.equal(game.state.score, before + game.state.roundScoreTotal + game.state.lastRoundBonus);
});

test('the game refuses to start with an empty stratagem pool', () => {
  assert.throws(() => createGame([], { config: CONFIG, shuffle: noShuffle }), /no stratagems/i);
});

test('the sequence is drawn using the injected shuffle', () => {
  const reversed = (items) => [...items].reverse();
  const game = createGame(pool, { config: CONFIG, shuffle: reversed });
  game.start();
  assert.equal(game.state.sequence[0].name, pool[pool.length - 1].name);
});
