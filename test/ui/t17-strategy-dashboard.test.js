import test from 'node:test';
import assert from 'node:assert/strict';
import { renderDashboardPage } from '../../apps/web/src/app/page.js';

test('dashboard page contains strategy cockpit sections', async () => {
  const html = await renderDashboardPage();
  assert.match(html, /Template Pulse/);
  assert.match(html, /Your Team vs Elite/);
  assert.match(html, /Transfer Radar/);
  assert.match(html, /Market Momentum/);
  assert.match(html, /Upcoming Week Plan/);
});
