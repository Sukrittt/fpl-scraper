'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card.js';
import { Input } from './ui/input.js';
import { Select } from './ui/select.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table.js';
import { Textarea } from './ui/textarea.js';

function fmtDate(value) {
  if (!value) return 'n/a';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'n/a';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function n(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sortedBy(list, mode) {
  const rows = [...list];
  if (mode === 'confidence_desc') return rows.sort((a, b) => n(b.confidence) - n(a.confidence));
  if (mode === 'name_asc') return rows.sort((a, b) => String(a.player_name || '').localeCompare(String(b.player_name || '')));
  return rows.sort((a, b) => n(b.score_5gw) - n(a.score_5gw));
}

function strategyPulseRows(templateRows) {
  const topOwned = [...templateRows].sort((a, b) => n(b.template_ownership_pct) - n(a.template_ownership_pct)).slice(0, 6);
  const topCaptains = [...templateRows].sort((a, b) => n(b.captain_pct) - n(a.captain_pct)).slice(0, 5);
  const rising = [...templateRows].sort((a, b) => n(b.buy_momentum) - n(a.buy_momentum)).slice(0, 5);
  const falling = [...templateRows].sort((a, b) => n(b.sell_momentum) - n(a.sell_momentum)).slice(0, 5);
  return { topOwned, topCaptains, rising, falling };
}

function coverageGap(strategyTeam) {
  const ins = strategyTeam?.recommended_in || [];
  const outs = strategyTeam?.recommended_out || [];
  return {
    inCount: ins.length,
    outCount: outs.length,
    confidence: n(strategyTeam?.confidence),
  };
}

function freshnessFromRows(rows = []) {
  const first = rows[0];
  return first?.data_freshness?.fetched_at || first?.updated_at || first?.created_at || null;
}

function secondsSince(iso) {
  if (!iso) return null;
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return null;
  return Math.max(0, Math.floor((Date.now() - ts) / 1000));
}

export default function DashboardApp({
  strategyEnabled,
  initialSettings,
  initialRecommendations,
  initialRuns,
  initialEvents,
  initialVideos,
  initialStrategyTemplate,
  initialStrategyTeam,
  updatedAtIso,
}) {
  const [entryId, setEntryId] = useState(initialSettings?.entry_id || '');
  const [channelsText, setChannelsText] = useState((initialSettings?.channels || []).join('\n'));
  const [status, setStatus] = useState('');
  const [statusError, setStatusError] = useState(false);
  const [liveError, setLiveError] = useState('');

  const [recommendations, setRecommendations] = useState(initialRecommendations || []);
  const [runs, setRuns] = useState(initialRuns || []);
  const [events, setEvents] = useState(initialEvents || []);
  const [videos, setVideos] = useState(initialVideos || []);
  const [strategyTemplate, setStrategyTemplate] = useState(initialStrategyTemplate || []);
  const [strategyTeam, setStrategyTeam] = useState(initialStrategyTeam || null);

  const [search, setSearch] = useState('');
  const [action, setAction] = useState('ALL');
  const [minConfidence, setMinConfidence] = useState(0);
  const [sortMode, setSortMode] = useState('score_desc');
  const [activePanel, setActivePanel] = useState('recommendations');

  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState(updatedAtIso || new Date().toISOString());
  const [nowTick, setNowTick] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function pollData() {
      setIsSyncing(true);
      setLiveError('');
      try {
        const [recsRes, runsRes, eventsRes, videosRes, templateRes, teamRes] = await Promise.all([
          fetch('/api/recommendations'),
          fetch('/api/runs?limit=20'),
          fetch('/api/events?limit=30'),
          fetch('/api/videos'),
          strategyEnabled ? fetch('/api/strategy/template?limit=40') : Promise.resolve(null),
          strategyEnabled ? fetch(`/api/strategy/team?entry_id=${Number(entryId) || 0}`) : Promise.resolve(null),
        ]);

        if (!cancelled && recsRes?.ok) setRecommendations(await recsRes.json());
        if (!cancelled && runsRes?.ok) setRuns(await runsRes.json());
        if (!cancelled && eventsRes?.ok) setEvents(await eventsRes.json());
        if (!cancelled && videosRes?.ok) setVideos(await videosRes.json());
        if (!cancelled && strategyEnabled && templateRes?.ok) setStrategyTemplate(await templateRes.json());
        if (!cancelled && strategyEnabled && teamRes?.ok) setStrategyTeam(await teamRes.json());

        if (!cancelled) {
          setLastSyncAt(new Date().toISOString());
        }
      } catch {
        if (!cancelled) {
          setLiveError('Live refresh failed. Retrying on next poll.');
        }
      } finally {
        if (!cancelled) {
          setIsSyncing(false);
        }
      }
    }

    pollData();
    const intervalId = setInterval(pollData, 45000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [strategyEnabled, entryId]);

  const filteredRecommendations = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = recommendations.filter((row) => {
      const player = String(row.player_name || '').toLowerCase();
      return (q.length === 0 || player.includes(q))
        && (action === 'ALL' || row.action === action)
        && n(row.confidence) >= minConfidence;
    });
    return sortedBy(filtered, sortMode);
  }, [recommendations, search, action, minConfidence, sortMode]);

  const kpis = useMemo(() => {
    const buy = recommendations.filter((r) => r.action === 'BUY').length;
    const sell = recommendations.filter((r) => r.action === 'SELL').length;
    const hold = recommendations.filter((r) => r.action === 'HOLD').length;
    const avgConfidence = recommendations.length > 0
      ? Math.round(recommendations.reduce((acc, r) => acc + n(r.confidence), 0) / recommendations.length)
      : 0;
    const latestRun = [...runs].sort((a, b) => new Date(b.started_at || 0).getTime() - new Date(a.started_at || 0).getTime())[0];
    return { buy, sell, hold, avgConfidence, latestRun: latestRun?.run_id || 'n/a' };
  }, [recommendations, runs]);

  const pulse = useMemo(() => strategyPulseRows(strategyTemplate), [strategyTemplate]);
  const gap = useMemo(() => coverageGap(strategyTeam), [strategyTeam]);

  const recByPlayerId = useMemo(() => new Map(recommendations.map((r) => [Number(r.player_id), r])), [recommendations]);

  const sortedRuns = useMemo(
    () => [...runs].sort((a, b) => new Date(b.started_at || 0).getTime() - new Date(a.started_at || 0).getTime()).slice(0, 10),
    [runs],
  );
  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()).slice(0, 12),
    [events],
  );
  const latestVideos = useMemo(
    () => [...videos].sort((a, b) => new Date(b.processed_at || 0).getTime() - new Date(a.processed_at || 0).getTime()).slice(0, 14),
    [videos],
  );
  const videoReasonStats = useMemo(() => {
    const counts = new Map();
    for (const row of latestVideos) {
      const key = row.skip_reason || row.status || 'unknown';
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [latestVideos]);

  const compositeFreshness = useMemo(() => {
    return freshnessFromRows(recommendations)
      || freshnessFromRows(strategyTemplate)
      || strategyTeam?.data_freshness?.fetched_at
      || updatedAtIso;
  }, [recommendations, strategyTemplate, strategyTeam, updatedAtIso]);

  const freshnessSeconds = secondsSince(compositeFreshness);
  const sinceLastPoll = secondsSince(lastSyncAt);

  async function onSaveSettings(event) {
    event.preventDefault();
    const parsedEntryId = Number(entryId);
    const channels = channelsText.split(/\n|,/).map((v) => v.trim()).filter(Boolean);
    if (!parsedEntryId || channels.length === 0) {
      setStatusError(true);
      setStatus('Entry ID and at least one channel are required.');
      return;
    }
    setStatusError(false);
    setStatus('Saving settings...');
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entry_id: parsedEntryId, channels }),
      });
      if (!response.ok) throw new Error('settings_failed');
      setStatus('Settings saved.');
      setTimeout(() => window.location.reload(), 350);
    } catch {
      setStatusError(true);
      setStatus('Failed to save settings.');
    }
  }

  async function onRunSync() {
    setStatusError(false);
    setStatus('Running sync...');
    try {
      const response = await fetch('/api/sync/run', { method: 'POST' });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.message || 'sync_failed');
      }
      setStatus('Sync completed. Refreshing...');
      setTimeout(() => window.location.reload(), 750);
    } catch (error) {
      setStatusError(true);
      setStatus(`Sync failed: ${error?.message || 'Check CRON_SECRET/auth.'}`);
    }
  }

  async function onRunStrategy() {
    setStatusError(false);
    setStatus('Running strategy refresh...');
    try {
      const response = await fetch('/api/strategy/run', { method: 'POST' });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.message || 'strategy_failed');
      }
      const body = await response.json().catch(() => ({}));
      if (Array.isArray(body?.warnings) && body.warnings.length > 0) {
        setStatus(`Strategy refresh completed with warnings: ${body.warnings.join(', ')}`);
        setStatusError(false);
        setTimeout(() => window.location.reload(), 1200);
        return;
      }
      setStatus('Strategy refresh completed. Reloading...');
      setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      setStatusError(true);
      setStatus(`Strategy refresh failed: ${error?.message || 'Verify settings and data sources.'}`);
    }
  }

  return (
    <main className="cockpit-surface mx-auto max-w-[1320px] px-4 pt-10 pb-10 md:px-8 md:pt-12 md:pb-12">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-cyan-50">FPL Strategy Cockpit</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400 md:text-base">
            Live decision desk blending model scores, elite-manager templates, and tactical momentum.
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-full border border-slate-700/80 bg-slate-900/80 px-3 py-2 text-xs text-slate-300">
          <span className={`sync-dot ${isSyncing ? 'is-active' : ''}`} />
          <span className={`sync-ring ${isSyncing ? 'is-active' : ''}`} />
          <span>{isSyncing ? 'Syncing live feeds' : 'Live feed idle'}</span>
          <Badge variant="secondary" className="border border-slate-600 bg-slate-800 text-slate-100">Updated {fmtDate(updatedAtIso)}</Badge>
        </div>
      </header>

      <section className="mb-4 flex flex-wrap items-center gap-3 text-xs text-slate-400">
        <span>Data freshness: {freshnessSeconds === null ? 'n/a' : `${freshnessSeconds}s ago`}</span>
        <span>Poll cadence: 45s</span>
        <span>Last poll: {sinceLastPoll === null ? 'n/a' : `${sinceLastPoll}s ago`}</span>
        {liveError ? <span className="text-rose-400">{liveError}</span> : null}
        <span className="hidden">{nowTick}</span>
      </section>

      {!strategyEnabled ? (
        <Card className="neon-card mb-4 border-dashed">
          <CardContent className="pt-6 text-sm text-slate-400">
            Strategy dashboard is disabled. Set <code>ENABLE_STRATEGY_DASHBOARD=1</code> to enable Template Pulse, Team vs Elite, and Transfer Radar strategy panels.
          </CardContent>
        </Card>
      ) : null}

      <section className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card className={`neon-card ${isSyncing ? 'poll-shimmer' : ''}`}>
          <CardHeader className="pb-2"><CardDescription>Transfer Signals</CardDescription></CardHeader>
          <CardContent className="text-xl font-semibold text-cyan-100">{kpis.buy} / {kpis.sell} / {kpis.hold}</CardContent>
        </Card>
        <Card className={`neon-card ${isSyncing ? 'poll-shimmer' : ''}`}>
          <CardHeader className="pb-2"><CardDescription>Model Confidence</CardDescription></CardHeader>
          <CardContent className="text-xl font-semibold text-cyan-100">{kpis.avgConfidence}%</CardContent>
        </Card>
        <Card className={`neon-card ${isSyncing ? 'poll-shimmer' : ''}`}>
          <CardHeader className="pb-2"><CardDescription>Latest Run</CardDescription></CardHeader>
          <CardContent className="truncate text-xl font-semibold text-cyan-100">{kpis.latestRun}</CardContent>
        </Card>
        <Card className={`neon-card ${isSyncing ? 'poll-shimmer' : ''}`}>
          <CardHeader className="pb-2"><CardDescription>Team Fit Confidence</CardDescription></CardHeader>
          <CardContent className="text-xl font-semibold text-cyan-100">{gap.confidence || 0}%</CardContent>
        </Card>
      </section>

      <section className="mb-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
        <Card className="neon-card">
          <CardHeader>
            <CardTitle className="text-base">Template Pulse</CardTitle>
            <CardDescription>Elite ownership and captaincy consensus.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="mb-1 text-xs uppercase text-slate-400">Top Owned</p>
              <ul className="space-y-1 text-slate-200">{pulse.topOwned.length ? pulse.topOwned.slice(0, 4).map((row) => <li key={`owned-${row.player_id}`}>#{row.player_id} · {n(row.template_ownership_pct)}%</li>) : <li>None</li>}</ul>
            </div>
            <div>
              <p className="mb-1 text-xs uppercase text-slate-400">Captain Trend</p>
              <ul className="space-y-1 text-slate-200">{pulse.topCaptains.length ? pulse.topCaptains.slice(0, 3).map((row) => <li key={`cap-${row.player_id}`}>#{row.player_id} · {n(row.captain_pct)}%</li>) : <li>None</li>}</ul>
            </div>
          </CardContent>
        </Card>

        <Card className="neon-card">
          <CardHeader>
            <CardTitle className="text-base">Your Team vs Elite</CardTitle>
            <CardDescription>Coverage and structure mismatch signals.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-200">
            <p>Template gaps to fill: <strong>{gap.inCount}</strong></p>
            <p>Likely overexposed slots: <strong>{gap.outCount}</strong></p>
            <p className="text-slate-400">{strategyTeam?.why || 'No team strategy insight yet.'}</p>
            {strategyTeam?.diagnostic_code ? (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-200">
                Diagnostic: {strategyTeam.diagnostic_code}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="neon-card">
          <CardHeader>
            <CardTitle className="text-base">Transfer Radar</CardTitle>
            <CardDescription>Suggested IN/OUT pairs with tactical framing.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm text-slate-200">
            <div>
              <p className="mb-1 text-xs uppercase text-slate-400">IN</p>
              <ul className="space-y-2">{(strategyTeam?.recommended_in || []).slice(0, 5).map((row) => {
                const rec = recByPlayerId.get(Number(row.player_id));
                return (
                  <li key={`in-${row.player_id}`}>
                    <p>{row.player_name} ({n(row.template_ownership_pct)}%)</p>
                    <p className="text-xs text-cyan-300">Template gap closed, momentum +{n(row.buy_momentum)}, risk {rec?.risk_tier || 'balanced'}</p>
                  </li>
                );
              })}</ul>
            </div>
            <div>
              <p className="mb-1 text-xs uppercase text-slate-400">OUT</p>
              <ul className="space-y-2">{(strategyTeam?.recommended_out || []).slice(0, 5).map((row) => {
                const rec = recByPlayerId.get(Number(row.player_id));
                return (
                  <li key={`out-${row.player_id}`}>
                    <p>{row.player_name}</p>
                    <p className="text-xs text-rose-300">Momentum pressure -{n(row.sell_momentum)}, ownership {n(row.template_ownership_pct)}%, risk {rec?.risk_tier || 'balanced'}</p>
                  </li>
                );
              })}</ul>
            </div>
          </CardContent>
        </Card>

        <Card className="neon-card">
          <CardHeader>
            <CardTitle className="text-base">Market Momentum</CardTitle>
            <CardDescription>Most bought and sold by elite cohort.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm text-slate-200">
            <div>
              <p className="mb-1 text-xs uppercase text-slate-400">Rising</p>
              <ul className="space-y-1">{pulse.rising.slice(0, 4).map((row) => <li key={`rise-${row.player_id}`}>#{row.player_id} +{n(row.buy_momentum)}</li>)}</ul>
            </div>
            <div>
              <p className="mb-1 text-xs uppercase text-slate-400">Falling</p>
              <ul className="space-y-1">{pulse.falling.slice(0, 4).map((row) => <li key={`fall-${row.player_id}`}>#{row.player_id} -{n(row.sell_momentum)}</li>)}</ul>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="mb-4 flex flex-wrap gap-2">
        <Button variant={activePanel === 'recommendations' ? 'default' : 'secondary'} onClick={() => setActivePanel('recommendations')}>Recommendations</Button>
        <Button variant={activePanel === 'pipeline' ? 'default' : 'secondary'} onClick={() => setActivePanel('pipeline')}>Pipeline Health</Button>
        <Button variant={activePanel === 'videos' ? 'default' : 'secondary'} onClick={() => setActivePanel('videos')}>Video Diagnostics</Button>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="neon-card lg:col-span-2">
          <CardHeader>
            <CardTitle>Controls</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3" onSubmit={onSaveSettings}>
              <label className="text-sm font-medium" htmlFor="entry-id">FPL Entry ID</label>
              <Input id="entry-id" type="number" min="1" value={entryId} onChange={(e) => setEntryId(e.target.value)} required />
              <label className="text-sm font-medium" htmlFor="channel-ids">YouTube Channel IDs (one per line)</label>
              <Textarea id="channel-ids" rows="5" value={channelsText} onChange={(e) => setChannelsText(e.target.value)} required />
              <div className="flex flex-wrap gap-2">
                <Button type="submit">Save Settings</Button>
                <Button type="button" variant="secondary" onClick={onRunSync}>Run Sync Now</Button>
                {strategyEnabled ? <Button type="button" variant="outline" onClick={onRunStrategy}>Run Strategy Refresh</Button> : null}
              </div>
              <p className={`text-sm ${statusError ? 'text-destructive' : 'text-slate-400'}`}>{status}</p>
            </form>
          </CardContent>
        </Card>

        {activePanel === 'recommendations' ? (
          <Card className="neon-card lg:col-span-2">
            <CardHeader>
              <CardTitle>Recommendation Explorer</CardTitle>
              <CardDescription>Showing {Math.min(filteredRecommendations.length, 220)} of {recommendations.length} players.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4 grid gap-2 lg:grid-cols-4">
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search player..." />
                <Select value={action} onChange={(e) => setAction(e.target.value)}>
                  <option value="ALL">All actions</option>
                  <option value="BUY">Buy</option>
                  <option value="SELL">Sell</option>
                  <option value="HOLD">Hold</option>
                </Select>
                <div className="grid gap-1">
                  <label className="text-sm text-slate-400" htmlFor="min-confidence">Min confidence {minConfidence}%</label>
                  <Input
                    id="min-confidence"
                    type="range"
                    min="0"
                    max="100"
                    value={minConfidence}
                    onChange={(e) => setMinConfidence(Number(e.target.value))}
                    className="px-0"
                  />
                </div>
                <Select value={sortMode} onChange={(e) => setSortMode(e.target.value)}>
                  <option value="score_desc">Sort: Score high to low</option>
                  <option value="confidence_desc">Sort: Confidence high to low</option>
                  <option value="name_asc">Sort: Name A-Z</option>
                </Select>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Player</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Template%</TableHead>
                    <TableHead>Momentum</TableHead>
                    <TableHead>Risk</TableHead>
                    <TableHead>Team Fit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRecommendations.slice(0, 220).map((r) => (
                    <TableRow key={`rec-${r.player_id}-${r.updated_at || ''}`}>
                      <TableCell className="font-semibold">{r.player_name}</TableCell>
                      <TableCell>{r.action}</TableCell>
                      <TableCell>{n(r.score_5gw)}</TableCell>
                      <TableCell>{n(r.confidence)}%</TableCell>
                      <TableCell>{n(r.template_ownership_pct)}%</TableCell>
                      <TableCell>{n(r.momentum_signal)}</TableCell>
                      <TableCell>{r.risk_tier || 'balanced'}</TableCell>
                      <TableCell>{r.team_fit_reason || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : null}

        {activePanel === 'pipeline' ? (
          <>
            <Card className="neon-card">
              <CardHeader><CardTitle>Recent Runs</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-slate-300">
                  {sortedRuns.map((run) => <li key={run.run_id}><code>{run.run_id}</code> - {run.status || 'unknown'} - {fmtDate(run.started_at)}</li>)}
                </ul>
              </CardContent>
            </Card>

            <Card className="neon-card">
              <CardHeader><CardTitle>Event Timeline</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {sortedEvents.map((row) => (
                    <li key={`${row.run_id}-${row.created_at}-${row.message}`} className="rounded-md border border-slate-700 p-2">
                      <p><strong>[{row.level || 'info'}]</strong> {row.message || ''}</p>
                      <span className="text-xs text-slate-400">{fmtDate(row.created_at)}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </>
        ) : null}

        {activePanel === 'videos' ? (
          <Card className="neon-card lg:col-span-2">
            <CardHeader><CardTitle>Video Diagnostics (Latest 14)</CardTitle></CardHeader>
            <CardContent>
              <div className="mb-3 flex flex-wrap gap-2">
                {videoReasonStats.map(([reason, count]) => (
                  <span key={reason} className="rounded-full border border-slate-700 bg-slate-900/80 px-3 py-1 text-xs text-slate-300">
                    {reason}: {count}
                  </span>
                ))}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Video</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {latestVideos.map((row) => (
                    <TableRow key={`${row.video_id}-${row.processed_at}`}>
                      <TableCell><code>{row.video_id || 'n/a'}</code></TableCell>
                      <TableCell>{row.status || 'n/a'}</TableCell>
                      <TableCell>{row.skip_reason || '-'}</TableCell>
                      <TableCell>{fmtDate(row.processed_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : null}
      </section>
    </main>
  );
}
