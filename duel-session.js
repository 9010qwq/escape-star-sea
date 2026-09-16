(function (root) {
  'use strict';
  function settle(state) {
    if (!state || !state.duel) return null;
    if (state.duelResult) return state.duelResult;
    const withdrawn = state.players.find(p => p.withdrawn);
    const first = state.placements[0];
    if (withdrawn) {
      state.duelResult = { winnerIds: state.players.filter(p => !p.withdrawn).map(p => p.id), round: state.round, reason: 'concede' };
    } else if (first && (state.round > first.round || state.phase === 'game_over')) {
      state.duelResult = { winnerIds: [...first.playerIds], round: first.round, reason: 'escape' };
    }
    if (state.duelResult) state.phase = 'game_over';
    return state.duelResult || null;
  }
  root.EscapeStarSeaDuel = { settle };
  if (typeof module !== 'undefined') module.exports = { settle };
})(typeof globalThis !== 'undefined' ? globalThis : this);
