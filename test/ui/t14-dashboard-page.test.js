import test from 'node:test';
import assert from 'node:assert/strict';
import { renderDashboardPage } from '../../apps/web/src/app/page.js';

test('dashboard page contains title and transfer radar content', async () => {
  const html = await renderDashboardPage();
  assert.match(html, /FPL Transfer Radar/);
  assert.match(html, /Transfer Radar/);
  assert.match(html, /Recent Runs/);
  assert.match(html, /Video Diagnostics/);
  assert.match(html, /Save Settings/);
  assert.match(html, /Run Sync Now/);
});
