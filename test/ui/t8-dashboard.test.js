import test from 'node:test';
import assert from 'node:assert/strict';
import { renderTransferRadar } from '../../apps/web/src/lib/transfer-radar.js';

test('renders Buy/Sell/Hold sections with player names', () => {
  const html = renderTransferRadar({
    loading: false,
    error: null,
    recommendations: [
      { player_name: 'Salah', action: 'BUY', confidence: 80, reasons: ['Form'] },
      { player_name: 'Haaland', action: 'SELL', confidence: 70, reasons: ['Tough fixtures'] },
      { player_name: 'Saka', action: 'HOLD', confidence: 60, reasons: ['Stable'] },
    ],
  });

  assert.match(html, /Buy Picks/);
  assert.match(html, /Salah/);
  assert.match(html, /Sell Picks/);
  assert.match(html, /Haaland/);
  assert.match(html, /Hold Watchlist/);
  assert.match(html, /Saka/);
});

test('renders loading and error states', () => {
  const loading = renderTransferRadar({ loading: true, error: null, recommendations: [] });
  assert.match(loading, /Loading recommendations/);

  const errored = renderTransferRadar({ loading: false, error: 'Failed', recommendations: [] });
  assert.match(errored, /Failed/);
});
