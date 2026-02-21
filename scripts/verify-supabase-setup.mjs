import { createSupabaseClientFromEnv } from '../apps/web/src/lib/supabase-client.js';

const requiredEnv = ['DB_PROVIDER', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const requiredTables = [
  'settings',
  'channels',
  'videos',
  'video_transcripts',
  'video_player_mentions',
  'player_metrics_snapshot',
  'recommendations_snapshot',
  'elite_managers_snapshot',
  'elite_manager_picks_snapshot',
  'elite_template_snapshot',
  'team_strategy_insights',
  'pipeline_runs',
  'pipeline_events',
];
const requiredColumns = [
  { table: 'recommendations_snapshot', column: 'run_id' },
  { table: 'recommendations_snapshot', column: 'template_ownership_pct' },
  { table: 'recommendations_snapshot', column: 'template_gap_score' },
  { table: 'recommendations_snapshot', column: 'momentum_signal' },
  { table: 'recommendations_snapshot', column: 'risk_tier' },
  { table: 'recommendations_snapshot', column: 'team_fit_reason' },
  { table: 'team_strategy_insights', column: 'diagnostic_code' },
];

function missingEnvVars() {
  return requiredEnv.filter((key) => !process.env[key]);
}

async function main() {
  const missingEnv = missingEnvVars();
  if (missingEnv.length > 0) {
    console.error(`Missing env vars: ${missingEnv.join(', ')}`);
    process.exit(1);
  }

  if (process.env.DB_PROVIDER !== 'supabase') {
    console.error(`DB_PROVIDER must be "supabase" (current: "${process.env.DB_PROVIDER}")`);
    process.exit(1);
  }

  const client = await createSupabaseClientFromEnv();
  const missingTables = [];
  const missingColumns = [];
  const otherErrors = [];

  for (const table of requiredTables) {
    const result = await client.from(table).select('*').limit(1);
    if (!result.error) {
      continue;
    }

    const message = result.error.message || String(result.error);
    if (/relation .* does not exist/i.test(message)) {
      missingTables.push(table);
    } else {
      otherErrors.push({ table, message });
    }
  }

  for (const item of requiredColumns) {
    const result = await client.from(item.table).select(item.column).limit(1);
    if (!result.error) {
      continue;
    }

    const message = result.error.message || String(result.error);
    if (new RegExp(`Could not find the '${item.column}' column`, 'i').test(message)) {
      missingColumns.push(`${item.table}.${item.column}`);
    } else if (/column .* does not exist/i.test(message)) {
      missingColumns.push(`${item.table}.${item.column}`);
    } else {
      otherErrors.push({ table: `${item.table}.${item.column}`, message });
    }
  }

  if (missingTables.length > 0) {
    console.error(`Missing tables: ${missingTables.join(', ')}`);
  }

  if (missingColumns.length > 0) {
    console.error(`Missing columns: ${missingColumns.join(', ')}`);
  }

  if (otherErrors.length > 0) {
    console.error('Unexpected Supabase errors:');
    for (const item of otherErrors) {
      console.error(`- ${item.table}: ${item.message}`);
    }
  }

  if (missingTables.length > 0 || missingColumns.length > 0 || otherErrors.length > 0) {
    process.exit(1);
  }

  console.log('Supabase setup verified: env vars are present and all required tables exist.');
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
