import test from 'node:test';
import assert from 'node:assert/strict';
import { createTemplateAgent } from '../../packages/pipeline/src/template-agent.js';
import { createTransferPatternAgent } from '../../packages/pipeline/src/transfer-pattern-agent.js';
import { scorePlayer } from '../../packages/pipeline/src/scoring.js';

test('template agent aggregates ownership and captain percentages', () => {
  const agent = createTemplateAgent({ nowFn: () => '2026-02-21T00:00:00Z' });
  const result = agent.run({
    snapshotGw: 26,
    managers: [
      { manager_entry_id: 1, formation: '3-4-3' },
      { manager_entry_id: 2, formation: '3-5-2' },
    ],
    picks: [
      { manager_entry_id: 1, player_id: 10, is_captain: true, is_vice_captain: false },
      { manager_entry_id: 2, player_id: 10, is_captain: false, is_vice_captain: true },
    ],
  });

  assert.equal(result.templateRows.length, 1);
  assert.equal(result.templateRows[0].template_ownership_pct, 100);
  assert.equal(result.templateRows[0].captain_pct, 50);
});

test('transfer pattern agent computes buy/sell momentum from snapshots', () => {
  const agent = createTransferPatternAgent();
  const rows = agent.run({
    currentTemplate: [{ player_id: 1, template_ownership_pct: 42 }],
    previousTemplate: [{ player_id: 1, template_ownership_pct: 35 }],
  });

  assert.equal(rows[0].buy_momentum, 7);
  assert.equal(rows[0].sell_momentum, 0);
});

test('scorePlayer responds to strategy blend inputs', () => {
  const neutral = scorePlayer({ form: 70, fixtures: 60, minutes: 70, value: 50, sentiment: 60 });
  const boosted = scorePlayer({
    form: 70,
    fixtures: 60,
    minutes: 70,
    value: 50,
    sentiment: 60,
    templateAlignment: 80,
    eliteMomentum: 8,
    teamNeedFit: 80,
  });

  assert.equal(boosted.score > neutral.score, true);
});
