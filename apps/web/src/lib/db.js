import { createSupabaseDatabase } from './supabase-db.js';

export const REQUIRED_TABLES = [
  'settings',
  'channels',
  'videos',
  'video_transcripts',
  'video_player_mentions',
  'player_metrics_snapshot',
  'recommendations_snapshot',
  'pipeline_runs',
  'pipeline_events',
];

class InMemoryDB {
  constructor() {
    this.tables = new Map();
  }

  createTable(name) {
    if (!this.tables.has(name)) {
      this.tables.set(name, []);
    }
  }

  hasTable(name) {
    return this.tables.has(name);
  }

  async upsert(table, row) {
    const rows = this.tables.get(table);
    if (!rows) {
      throw new Error(`Table ${table} not found`);
    }

    if (rows.length === 0) {
      rows.push(structuredClone(row));
      return;
    }

    rows[0] = { ...rows[0], ...structuredClone(row) };
  }

  async insert(table, row) {
    const rows = this.tables.get(table);
    if (!rows) {
      throw new Error(`Table ${table} not found`);
    }

    rows.push(structuredClone(row));
  }

  async getOne(table) {
    const rows = this.tables.get(table);
    if (!rows || rows.length === 0) {
      return null;
    }

    return structuredClone(rows[0]);
  }

  async getAll(table) {
    const rows = this.tables.get(table);
    if (!rows) {
      throw new Error(`Table ${table} not found`);
    }

    return structuredClone(rows);
  }
}

export function createDatabase({ provider = process.env.DB_PROVIDER || 'memory', supabaseClient = null } = {}) {
  if (provider === 'supabase') {
    if (!supabaseClient) {
      throw new Error('supabaseClient is required when provider is supabase');
    }

    return createSupabaseDatabase({ client: supabaseClient });
  }

  return new InMemoryDB();
}

export async function runMigrations(db) {
  if (typeof db.createTable !== 'function') {
    return;
  }

  for (const table of REQUIRED_TABLES) {
    db.createTable(table);
  }
}
