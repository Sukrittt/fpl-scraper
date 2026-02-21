function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function renderList(title, recommendations) {
  const top = [...recommendations]
    .sort((a, b) => num(b.score_5gw) - num(a.score_5gw))
    .slice(0, 12);

  const items = top
    .map((rec) => [
      '<li class="radar-item">',
      `<div class="radar-item-head"><strong>${rec.player_name}</strong><span class="badge">${num(rec.confidence)}%</span></div>`,
      `<p>${(Array.isArray(rec.reasons) ? rec.reasons : []).slice(0, 2).join(', ')}</p>`,
      '</li>',
    ].join(''))
    .join('');

  return [
    '<section class="radar-column">',
    `<h2>${title}</h2>`,
    `<ul class="radar-list">${items || '<li class="radar-item empty">None</li>'}</ul>`,
    '</section>',
  ].join('');
}

function safeDate(value) {
  if (!value) return 'n/a';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'n/a';
  return date.toISOString().replace('T', ' ').slice(0, 16);
}

function renderSettings(settings) {
  if (!settings) {
    return '<section class="meta-card"><h2>Settings</h2><p>No settings configured.</p></section>';
  }

  const channels = Array.isArray(settings.channels) ? settings.channels : [];
  const channelItems = channels.map((id) => `<li><code>${id}</code></li>`).join('');

  return [
    '<section class="meta-card">',
    '<h2>Settings</h2>',
    `<p><strong>Entry ID:</strong> ${settings.entry_id || 'n/a'}</p>`,
    `<p><strong>Channels:</strong> ${channels.length}</p>`,
    `<ul class="channel-list">${channelItems || '<li>None</li>'}</ul>`,
    '</section>',
  ].join('');
}

function renderControls(settings) {
  const entryId = settings?.entry_id || '';
  const channels = Array.isArray(settings?.channels) ? settings.channels.join('\n') : '';

  return [
    '<section class="meta-card wide control-card">',
    '<h2>Controls</h2>',
    '<form id="settings-form" class="control-form">',
    '<label for="entry-id">FPL Entry ID</label>',
    `<input id="entry-id" name="entry_id" type="number" min="1" value="${entryId}" required />`,
    '<label for="channel-ids">YouTube Channel IDs (one per line)</label>',
    `<textarea id="channel-ids" name="channels" rows="6" required>${channels}</textarea>`,
    '<div class="actions">',
    '<button type="submit">Save Settings</button>',
    '<button type="button" id="sync-now" class="secondary">Run Sync Now</button>',
    '</div>',
    '<p id="control-status" class="control-status"></p>',
    '</form>',
    '</section>',
  ].join('');
}

function renderKpis({ recommendations, runs, videos }) {
  const recs = recommendations || [];
  const buy = recs.filter((row) => row.action === 'BUY').length;
  const sell = recs.filter((row) => row.action === 'SELL').length;
  const hold = recs.filter((row) => row.action === 'HOLD').length;
  const avgConfidence = recs.length > 0
    ? Math.round(recs.reduce((acc, row) => acc + num(row.confidence), 0) / recs.length)
    : 0;

  const latestRun = [...(runs || [])]
    .sort((a, b) => new Date(b.started_at || 0).getTime() - new Date(a.started_at || 0).getTime())[0];
  const latestVideos = [...(videos || [])]
    .sort((a, b) => new Date(b.processed_at || 0).getTime() - new Date(a.processed_at || 0).getTime())
    .slice(0, 40);
  const processed = latestVideos.filter((v) => v.status === 'processed').length;
  const skipped = latestVideos.filter((v) => v.status === 'skipped').length;

  const cells = [
    { label: 'Buy / Sell / Hold', value: `${buy} / ${sell} / ${hold}` },
    { label: 'Average Confidence', value: `${avgConfidence}%` },
    { label: 'Latest Run', value: latestRun?.run_id || 'n/a' },
    { label: 'Latest Video Outcome', value: `processed ${processed}, skipped ${skipped}` },
  ];

  const cards = cells.map((cell) => [
    '<article class="kpi-card">',
    `<p class="kpi-label">${cell.label}</p>`,
    `<p class="kpi-value">${cell.value}</p>`,
    '</article>',
  ].join('')).join('');

  return `<section class="kpi-grid">${cards}</section>`;
}

function renderRunHistory(runs) {
  const sortedRuns = [...(runs || [])]
    .filter((row) => row.run_id)
    .sort((a, b) => new Date(b.started_at || 0).getTime() - new Date(a.started_at || 0).getTime())
    .slice(0, 8);

  const items = sortedRuns
    .map((run) => `<li><code>${run.run_id}</code> - ${run.status || 'unknown'} - ${safeDate(run.started_at)}</li>`)
    .join('');

  return [
    '<section class="meta-card">',
    '<h2>Recent Runs</h2>',
    `<ul class="run-list">${items || '<li>No runs yet.</li>'}</ul>`,
    '</section>',
  ].join('');
}

function renderEventTimeline(events) {
  const items = [...(events || [])]
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
    .slice(0, 12)
    .map((row) => [
      '<li>',
      `<strong>[${row.level || 'info'}]</strong> ${row.message || ''}`,
      `<span>${safeDate(row.created_at)}</span>`,
      '</li>',
    ].join(''))
    .join('');

  return [
    '<section class="meta-card">',
    '<h2>Event Timeline</h2>',
    `<ul class="event-list">${items || '<li>No events yet.</li>'}</ul>`,
    '</section>',
  ].join('');
}

function renderRecommendationExplorer(recommendations) {
  const rows = [...(recommendations || [])]
    .sort((a, b) => num(b.score_5gw) - num(a.score_5gw))
    .slice(0, 320)
    .map((row) => [
      `<tr class="rec-row" data-player="${String(row.player_name || '').toLowerCase()}" data-action="${row.action || ''}" data-confidence="${num(row.confidence)}" data-score="${num(row.score_5gw)}">`,
      `<td><strong>${row.player_name || 'Unknown'}</strong></td>`,
      `<td>${row.action || 'n/a'}</td>`,
      `<td>${num(row.score_5gw)}</td>`,
      `<td>${num(row.confidence)}%</td>`,
      `<td>${(Array.isArray(row.reasons) ? row.reasons : []).slice(0, 2).join('; ')}</td>`,
      '</tr>',
    ].join(''))
    .join('');

  return [
    '<section class="meta-card wide">',
    '<h2>Recommendation Explorer</h2>',
    '<div class="explorer-controls">',
    '<input id="rec-search" placeholder="Search player..." />',
    '<select id="rec-action"><option value="ALL">All actions</option><option value="BUY">Buy</option><option value="SELL">Sell</option><option value="HOLD">Hold</option></select>',
    '<label class="slider-wrap">Min confidence <span id="rec-min-confidence-value">0</span>% <input id="rec-min-confidence" type="range" min="0" max="100" value="0" /></label>',
    '<select id="rec-sort"><option value="score_desc">Sort: Score high to low</option><option value="confidence_desc">Sort: Confidence high to low</option><option value="name_asc">Sort: Name A-Z</option></select>',
    '</div>',
    '<p class="explorer-meta">Showing up to 320 players for fast UI response.</p>',
    '<div class="table-wrap"><table><thead><tr><th>Player</th><th>Action</th><th>Score</th><th>Confidence</th><th>Reasons</th></tr></thead>',
    `<tbody id="rec-table-body">${rows || '<tr><td colspan="5">No recommendations yet.</td></tr>'}</tbody>`,
    '</table></div>',
    '</section>',
  ].join('');
}

function renderVideoDiagnostics(videos) {
  const latest = [...(videos || [])]
    .sort((a, b) => new Date(b.processed_at || 0).getTime() - new Date(a.processed_at || 0).getTime())
    .slice(0, 12);

  const processed = latest.filter((row) => row.status === 'processed').length;
  const skipped = latest.filter((row) => row.status === 'skipped').length;
  const rows = latest.map((row) => [
    '<tr>',
    `<td><code>${row.video_id || 'n/a'}</code></td>`,
    `<td>${row.status || 'n/a'}</td>`,
    `<td>${row.skip_reason || '-'}</td>`,
    `<td>${safeDate(row.processed_at)}</td>`,
    '</tr>',
  ].join('')).join('');

  return [
    '<section class="meta-card wide">',
    '<h2>Video Diagnostics (Latest 12)</h2>',
    `<p>Processed: <strong>${processed}</strong> | Skipped: <strong>${skipped}</strong></p>`,
    '<div class="table-wrap"><table><thead><tr><th>Video</th><th>Status</th><th>Reason</th><th>Time</th></tr></thead>',
    `<tbody>${rows || '<tr><td colspan="4">No video rows yet.</td></tr>'}</tbody></table></div>`,
    '</section>',
  ].join('');
}

function renderStrategyCockpit(strategyTemplate = [], strategyTeam = null) {
  const fmtPlayer = (row) => row?.player_name ? `${row.player_name} (#${row.player_id})` : `#${row?.player_id}`;
  const currentGw = Number(strategyTeam?.snapshot_gw || strategyTemplate?.[0]?.snapshot_gw || 0) || null;
  const topOwned = [...strategyTemplate]
    .sort((a, b) => num(b.template_ownership_pct) - num(a.template_ownership_pct))
    .slice(0, 5);
  const topCaptains = [...strategyTemplate]
    .sort((a, b) => num(b.captain_pct) - num(a.captain_pct))
    .slice(0, 3);
  const rising = [...strategyTemplate]
    .sort((a, b) => num(b.buy_momentum) - num(a.buy_momentum))
    .slice(0, 5);
  const falling = [...strategyTemplate]
    .sort((a, b) => num(b.sell_momentum) - num(a.sell_momentum))
    .slice(0, 5);

  const inRows = (strategyTeam?.recommended_in || []).slice(0, 5)
    .map((row) => `<li>${row.player_name || row.player_id}</li>`).join('');
  const outRows = (strategyTeam?.recommended_out || []).slice(0, 5)
    .map((row) => `<li>${row.player_name || row.player_id}</li>`).join('');
  const topRows = topOwned.map((row) => `<li>${fmtPlayer(row)} (${num(row.template_ownership_pct)}%)</li>`).join('');
  const captainRows = topCaptains.map((row) => `<li>${fmtPlayer(row)} (${num(row.captain_pct)}%)</li>`).join('');
  const riseRows = rising.map((row) => `<li>${fmtPlayer(row)} (+${num(row.buy_momentum)})</li>`).join('');
  const fallRows = falling.map((row) => `<li>${fmtPlayer(row)} (-${num(row.sell_momentum)})</li>`).join('');

  const buyTarget = strategyTeam?.recommended_in?.[0] || topOwned[0] || null;
  const sellTarget = strategyTeam?.recommended_out?.[0] || null;
  const captainTarget = topCaptains[0] || null;
  const gapCount = (strategyTeam?.recommended_in || []).length;
  const doNowRows = [
    buyTarget
      ? `Make this transfer first: ${buyTarget.player_name || fmtPlayer(buyTarget)}.`
      : 'No clear buy target yet.',
    captainTarget
      ? `Captain ${captainTarget.player_name || fmtPlayer(captainTarget)} (${num(captainTarget.captain_pct)}%).`
      : 'No strong captain consensus yet.',
  ].map((line) => `<li>${line}</li>`).join('');
  const optionalRows = [
    gapCount > 0
      ? `If possible, close one more template gap (${gapCount} open).`
      : 'Optional upside move only; team/template alignment is stable.',
  ].map((line) => `<li>${line}</li>`).join('');
  const avoidRows = [
    sellTarget
      ? `Avoid holding ${sellTarget.player_name || fmtPlayer(sellTarget)} if you need one clear sell.`
      : 'Avoid forcing a sell without clear downside signal.',
    'Avoid overreacting to flat momentum values this week.',
  ].map((line) => `<li>${line}</li>`).join('');
  const gapRows = (strategyTeam?.recommended_in || []).slice(0, 8).map((row) => [
    '<li>',
    `<strong>${row.player_name || fmtPlayer(row)}</strong>`,
    `<br /><span>Template ownership ${num(row.template_ownership_pct)}% · buy momentum +${num(row.buy_momentum)}</span>`,
    '</li>',
  ].join('')).join('');

  return [
    '<section class="meta-card wide">',
    '<h2>Template Pulse</h2>',
    '<p><strong>Top Owned:</strong></p>',
    `<ul class="run-list">${topRows || '<li>No template rows yet.</li>'}</ul>`,
    '<p><strong>Captain Trend:</strong></p>',
    `<ul class="run-list">${captainRows || '<li>No captain rows yet.</li>'}</ul>`,
    '</section>',
    '<section class="meta-card">',
    '<h2>Your Team vs Elite</h2>',
    `<p>Suggested IN: ${(strategyTeam?.recommended_in || []).length}</p>`,
    `<p>Suggested OUT: ${(strategyTeam?.recommended_out || []).length}</p>`,
    `<p>${strategyTeam?.why || 'No team insight yet.'}</p>`,
    '</section>',
    '<section class="meta-card">',
    '<h2>Transfer Radar</h2>',
    `<p><strong>IN</strong></p><ul class="run-list">${inRows || '<li>None</li>'}</ul>`,
    `<p><strong>OUT</strong></p><ul class="run-list">${outRows || '<li>None</li>'}</ul>`,
    '</section>',
    '<section class="meta-card wide">',
    '<h2>Market Momentum</h2>',
    `<p><strong>Rising:</strong></p><ul class="run-list">${riseRows || '<li>None</li>'}</ul>`,
    `<p><strong>Falling:</strong></p><ul class="run-list">${fallRows || '<li>None</li>'}</ul>`,
    '</section>',
    '<section class="meta-card wide">',
    `<h2>Upcoming Week Plan ${currentGw ? `(GW ${currentGw})` : '(GW n/a)'}</h2>`,
    '<p>Action summary for the upcoming gameweek from template, team-fit, and captaincy signals.</p>',
    '<p><strong>Do now</strong></p>',
    `<ul class="run-list">${doNowRows}</ul>`,
    '<p><strong>Optional</strong></p>',
    `<ul class="run-list">${optionalRows}</ul>`,
    '<p><strong>Avoid this week</strong></p>',
    `<ul class="run-list">${avoidRows}</ul>`,
    '</section>',
    '<section class="meta-card wide">',
    `<h2>Template Gaps to Fill ${currentGw ? `(GW ${currentGw})` : '(GW n/a)'}</h2>`,
    '<p>Players in the elite template that your current team is missing.</p>',
    `<ul class="run-list">${gapRows || '<li>No major template gaps detected.</li>'}</ul>`,
    '</section>',
  ].join('');
}

export function renderTransferRadar({
  loading,
  error,
  recommendations,
  settings = null,
  runs = [],
  events = [],
  videos = [],
  strategyTemplate = [],
  strategyTeam = null,
}) {
  if (loading) {
    return '<div>Loading recommendations...</div>';
  }

  if (error) {
    return `<div role="alert">${error}</div>`;
  }

  const buy = recommendations.filter((row) => row.action === 'BUY');
  const sell = recommendations.filter((row) => row.action === 'SELL');
  const hold = recommendations.filter((row) => row.action === 'HOLD');

  return [
    '<main class="radar-shell"><h1>Transfer Radar</h1>',
    '<p class="radar-subtitle">AI-ranked actions from FPL form + YouTube sentiment signals.</p>',
    renderKpis({ recommendations, runs, videos }),
    '<div class="radar-grid">',
    renderList('Buy Picks', buy),
    renderList('Sell Picks', sell),
    renderList('Hold Watchlist', hold),
    '</div>',
    '<section class="meta-grid">',
    renderRecommendationExplorer(recommendations),
    renderControls(settings),
    renderSettings(settings),
    renderStrategyCockpit(strategyTemplate, strategyTeam),
    renderRunHistory(runs),
    renderEventTimeline(events),
    renderVideoDiagnostics(videos),
    '</section>',
    '</main>',
  ].join('');
}
