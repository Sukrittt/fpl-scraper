import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase, runMigrations, REQUIRED_TABLES } from '../../apps/web/src/lib/db.js';

test('runMigrations creates required tables', async () => {
  const db = createDatabase();
  await runMigrations(db);

  for (const table of REQUIRED_TABLES) {
    assert.equal(db.hasTable(table), true);
  }
});

test('settings table read/write contract works', async () => {
  const db = createDatabase();
  await runMigrations(db);

  await db.upsert('settings', {
    entry_id: 123456,
    ollama_base_url: 'http://127.0.0.1:11434',
    ollama_model: 'llama3.1:8b-instruct',
    channels: ['chan1'],
  });

  const settings = await db.getOne('settings');
  assert.equal(settings.entry_id, 123456);
  assert.equal(settings.channels.length, 1);
});
