import test from 'node:test';
import assert from 'node:assert/strict';
import { scorePlayer, classifyAction } from '../../packages/pipeline/src/scoring.js';

test('scorePlayer computes weighted 5GW score', () => {
  const result = scorePlayer({
    form: 80,
    fixtures: 60,
    minutes: 70,
    value: 50,
    sentiment: 90,
    transcriptCoverage: 0.8,
  });

  assert.equal(Math.round(result.score), 72);
  assert.equal(result.confidence >= 60, true);
});

test('classifyAction maps score and confidence to BUY/SELL/HOLD', () => {
  assert.equal(classifyAction({ score: 75, confidence: 70 }), 'BUY');
  assert.equal(classifyAction({ score: 40, confidence: 80 }), 'SELL');
  assert.equal(classifyAction({ score: 75, confidence: 50 }), 'HOLD');
});
