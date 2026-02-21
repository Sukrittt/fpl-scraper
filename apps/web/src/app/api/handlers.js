async function safeGetAll(db, table) {
  try {
    return await db.getAll(table);
  } catch {
    return [];
  }
}

function nowIso() {
  return new Date().toISOString();
}

function toTime(value) {
  const parsed = new Date(value || 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function latestRecommendationsBatch(rows = []) {
  const withRunId = rows.filter((row) => row?.run_id);
  if (withRunId.length > 0) {
    const latestByRun = new Map();
    for (const row of withRunId) {
      const runId = row.run_id;
      const ts = Math.max(toTime(row.updated_at), toTime(row.created_at));
      const prev = latestByRun.get(runId) || 0;
      if (ts >= prev) {
        latestByRun.set(runId, ts);
      }
    }

    const latestRunId = [...latestByRun.entries()]
      .sort((a, b) => b[1] - a[1])[0]?.[0];
    if (latestRunId) {
      return withRunId.filter((row) => row.run_id === latestRunId);
    }
  }

  // Legacy fallback for historical rows without run_id.
  const latestTs = Math.max(...rows.map((row) => toTime(row.updated_at)));
  if (!Number.isFinite(latestTs) || latestTs <= 0) {
    return rows;
  }

  const windowMs = 5 * 60 * 1000;
  const bucket = rows.filter((row) => (latestTs - toTime(row.updated_at)) <= windowMs);
  return bucket.length > 0 ? bucket : rows;
}

function dedupeRunRows(rows = []) {
  const byRunId = new Map();
  for (const row of rows) {
    if (!row?.run_id) continue;
    const existing = byRunId.get(row.run_id);
    if (!existing) {
      byRunId.set(row.run_id, row);
      continue;
    }

    const existingRank = existing.status === 'completed' ? 3 : existing.status === 'failed' ? 2 : 1;
    const rowRank = row.status === 'completed' ? 3 : row.status === 'failed' ? 2 : 1;
    const existingTs = Math.max(toTime(existing.finished_at), toTime(existing.started_at));
    const rowTs = Math.max(toTime(row.finished_at), toTime(row.started_at));

    if (rowRank > existingRank || (rowRank === existingRank && rowTs >= existingTs)) {
      byRunId.set(row.run_id, row);
    }
  }
  return [...byRunId.values()];
}

function buildPlayerNameById({ recommendations = [], teamInsights = [] } = {}) {
  const map = new Map();
  for (const row of recommendations) {
    const playerId = Number(row?.player_id || 0);
    if (!playerId || !row?.player_name) continue;
    map.set(playerId, row.player_name);
  }
  for (const insight of teamInsights) {
    for (const row of insight?.recommended_in || []) {
      const playerId = Number(row?.player_id || 0);
      if (!playerId || !row?.player_name) continue;
      map.set(playerId, row.player_name);
    }
    for (const row of insight?.recommended_out || []) {
      const playerId = Number(row?.player_id || 0);
      if (!playerId || !row?.player_name) continue;
      map.set(playerId, row.player_name);
    }
  }
  return map;
}

export async function getSettingsHandler({ db }) {
  const settings = await db.getOne('settings');
  return { status: 200, body: settings || null };
}

export async function getRecommendationsHandler({ db }) {
  const rows = latestRecommendationsBatch(await db.getAll('recommendations_snapshot'));
  const templateRows = await safeGetAll(db, 'elite_template_snapshot');
  const teamInsights = await safeGetAll(db, 'team_strategy_insights');

  const templateByPlayer = new Map();
  for (const row of templateRows) {
    const playerId = Number(row.player_id || 0);
    if (!playerId) continue;

    const existing = templateByPlayer.get(playerId);
    if (!existing || new Date(row.created_at || 0).getTime() > new Date(existing.created_at || 0).getTime()) {
      templateByPlayer.set(playerId, row);
    }
  }

  const latestInsight = [...teamInsights]
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0];
  const inSet = new Set((latestInsight?.recommended_in || []).map((row) => Number(row.player_id)).filter(Boolean));
  const outSet = new Set((latestInsight?.recommended_out || []).map((row) => Number(row.player_id)).filter(Boolean));

  const enriched = rows.map((row) => {
    const template = templateByPlayer.get(Number(row.player_id || 0));
    return {
      ...row,
      template_ownership_pct: Number(row.template_ownership_pct ?? template?.template_ownership_pct ?? 0),
      template_gap_score: Number(row.template_gap_score ?? 0),
      momentum_signal: Number(row.momentum_signal ?? ((Number(template?.buy_momentum || 0) - Number(template?.sell_momentum || 0)) || 0)),
      risk_tier: row.risk_tier || 'balanced',
      team_fit_reason: row.team_fit_reason || (inSet.has(Number(row.player_id)) ? 'Recommended in strategy plan' : outSet.has(Number(row.player_id)) ? 'Recommended out in strategy plan' : 'Neutral fit'),
      data_freshness: {
        fetched_at: nowIso(),
        source: 'recommendations_snapshot',
      },
    };
  });

  return { status: 200, body: enriched };
}

export async function getRunsHandler({ db, query = {} }) {
  const rows = dedupeRunRows(await db.getAll('pipeline_runs'));
  const limit = Number(query.limit || 20);
  const sorted = [...rows]
    .filter((row) => row.run_id)
    .sort((a, b) => Math.max(toTime(b.finished_at), toTime(b.started_at)) - Math.max(toTime(a.finished_at), toTime(a.started_at)))
    .slice(0, Number.isFinite(limit) && limit > 0 ? limit : 20);
  const body = sorted.map((row) => ({
    ...row,
    data_freshness: {
      fetched_at: nowIso(),
      source: 'pipeline_runs',
    },
  }));
  return { status: 200, body };
}

export async function getEventsHandler({ db, query = {} }) {
  const rows = await db.getAll('pipeline_events');
  const limit = Number(query.limit || 30);
  const sorted = [...rows]
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
    .slice(0, Number.isFinite(limit) && limit > 0 ? limit : 30);
  const body = sorted.map((row) => ({
    ...row,
    data_freshness: {
      fetched_at: nowIso(),
      source: 'pipeline_events',
    },
  }));
  return { status: 200, body };
}

export async function getVideosHandler({ db, query = {} }) {
  const rows = await db.getAll('videos');
  const filtered = query.status ? rows.filter((row) => row.status === query.status) : rows;
  const body = filtered.map((row) => ({
    ...row,
    data_freshness: {
      fetched_at: nowIso(),
      source: 'videos',
    },
  }));
  return { status: 200, body };
}

export async function postSyncRunHandler({ runPipeline }) {
  const run = await runPipeline();
  return { status: 202, body: run };
}

export async function getStrategyTemplateHandler({ db, query = {} }) {
  const rows = await safeGetAll(db, 'elite_template_snapshot');
  const recommendations = latestRecommendationsBatch(await safeGetAll(db, 'recommendations_snapshot'));
  const teamInsights = await safeGetAll(db, 'team_strategy_insights');
  const playerNameById = buildPlayerNameById({ recommendations, teamInsights });
  const gw = Number(query.gw || 0) || Math.max(...rows.map((row) => Number(row.snapshot_gw || 0)));
  const filtered = gw > 0 ? rows.filter((row) => Number(row.snapshot_gw) === gw) : rows;
  const latestByPlayer = new Map();
  for (const row of filtered) {
    const playerId = Number(row.player_id || 0);
    if (!playerId) continue;
    const existing = latestByPlayer.get(playerId);
    if (!existing || toTime(row.created_at) >= toTime(existing.created_at)) {
      latestByPlayer.set(playerId, row);
    }
  }
  const sorted = [...latestByPlayer.values()]
    .sort((a, b) => Number(b.template_ownership_pct || 0) - Number(a.template_ownership_pct || 0))
    .slice(0, Number(query.limit || 200));
  const body = sorted.map((row) => ({
    ...row,
    player_name: row.player_name || playerNameById.get(Number(row.player_id)) || null,
    data_freshness: {
      fetched_at: nowIso(),
      source: 'elite_template_snapshot',
    },
  }));
  return { status: 200, body };
}

export async function getStrategyTeamHandler({ db, query = {} }) {
  const rows = await safeGetAll(db, 'team_strategy_insights');
  const templateRows = await safeGetAll(db, 'elite_template_snapshot');
  const entryId = Number(query.entry_id || 0);
  const filtered = entryId > 0 ? rows.filter((row) => Number(row.entry_id) === entryId) : rows;
  const latest = [...filtered].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0] || null;

  if (latest) {
    return {
      status: 200,
      body: {
        ...latest,
        data_freshness: {
          fetched_at: nowIso(),
          source: 'team_strategy_insights',
        },
      },
    };
  }

  let diagnosticCode = 'strategy_run_not_executed';
  if (templateRows.length === 0) {
    diagnosticCode = 'no_cohort_rows';
  } else if (entryId <= 0) {
    diagnosticCode = 'missing_entry_team';
  } else {
    diagnosticCode = 'missing_entry_team';
  }

  return {
    status: 200,
    body: {
      snapshot_gw: null,
      entry_id: entryId || null,
      risk_profile: 'balanced_template_aware',
      recommended_in: [],
      recommended_out: [],
      confidence: 0,
      why: 'No team strategy insight yet.',
      diagnostic_code: diagnosticCode,
      evidence: {},
      data_freshness: {
        fetched_at: nowIso(),
        source: 'team_strategy_insights',
      },
    },
  };
}

export async function postStrategyRunHandler({ runStrategy }) {
  const run = await runStrategy();
  return { status: 202, body: run };
}
