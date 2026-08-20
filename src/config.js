// Every tunable number lives here.
//
// The real Stratagem Hero scoring formula has never been published: the wiki
// gives no numbers and the best-known community clone states it invented its
// own. These values are a deliberate approximation. Tune them here; game.js
// must never hardcode a number.
export const CONFIG = {
  FIRST_ROUND_SIZE: 6,
  MAX_ROUND_SIZE: 16,
  ROUND_TIME: 10.0,
  TIME_PER_CORRECT: 1.0,
  BASE_POINTS: 100,
  POINTS_PER_ARROW: 20,
  SPEED_BONUS_MAX: 1.0,
  SPEED_WINDOW: 3.0,
  ERROR_PENALTY: 25,
  PERFECT_ROUND_BONUS: 1000,
  TIME_BONUS_PER_SECOND: 50,
};
