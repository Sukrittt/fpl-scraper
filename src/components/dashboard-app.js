'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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

function formatPlayerLabel({ playerId, playerName }) {
  if (playerName) return `${playerName} (#${playerId})`;
  return `#${playerId}`;
}

function buildUpcomingWeekPlan({ pulse, strategyTeam, gap, playerNameById }) {
  const recommendedIn = strategyTeam?.recommended_in || [];
  const recommendedOut = strategyTeam?.recommended_out || [];
  const topCaptain = pulse?.topCaptains?.[0] || null;
  const topOwned = pulse?.topOwned?.[0] || null;

  const buyTarget = recommendedIn[0]
    ? formatPlayerLabel({
      playerId: recommendedIn[0].player_id,
      playerName: recommendedIn[0].player_name || playerNameById.get(Number(recommendedIn[0].player_id)),
    })
    : topOwned
      ? formatPlayerLabel({
        playerId: topOwned.player_id,
        playerName: topOwned.player_name || playerNameById.get(Number(topOwned.player_id)),
      })
      : null;

  const sellTarget = recommendedOut[0]
    ? formatPlayerLabel({
      playerId: recommendedOut[0].player_id,
      playerName: recommendedOut[0].player_name || playerNameById.get(Number(recommendedOut[0].player_id)),
    })
    : null;

  const captainTarget = topCaptain
    ? formatPlayerLabel({
      playerId: topCaptain.player_id,
      playerName: topCaptain.player_name || playerNameById.get(Number(topCaptain.player_id)),
    })
    : null;

  const doNow = [
    buyTarget
      ? `Make this transfer first: bring in ${buyTarget}.`
      : 'No clear buy target yet. Refresh strategy after latest data sync.',
    captainTarget
      ? `Captain ${captainTarget} (${n(topCaptain.captain_pct)}% elite captaincy).`
      : 'No strong captain consensus yet, so prioritize fixture/form checks.',
  ];

  const optional = [
    gap?.inCount > 0
      ? `If budget allows, close one more template gap (${gap.inCount} currently open).`
      : 'Optional upside move: roll transfer or make a low-risk fixture play.',
  ];

  const avoid = [
    sellTarget
      ? `Avoid holding ${sellTarget} if you need one clear sell this week.`
      : 'Avoid forcing a defensive transfer without a clear sell signal.',
    'Avoid overreacting to flat momentum; prioritize ownership and captaincy signals.',
  ];

  const headline = gap?.confidence >= 70
    ? 'Plan is stable. Execute one focused move and protect captain upside.'
    : 'Plan is still fragile. Reduce risk and align closer to elite template this week.';

  return { headline, doNow, optional, avoid };
}

function detectCurrentGw({ strategyTeam, strategyTemplate }) {
  const teamGw = Number(strategyTeam?.snapshot_gw || 0);
  if (teamGw > 0) return teamGw;
  const templateGw = Number(strategyTemplate?.[0]?.snapshot_gw || 0);
  return templateGw > 0 ? templateGw : null;
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
  initialLiveGw,
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
  const [liveGw, setLiveGw] = useState(initialLiveGw || null);

  const [search, setSearch] = useState('');
  const [action, setAction] = useState('ALL');
  const [minConfidence, setMinConfidence] = useState(0);
  const [sortMode, setSortMode] = useState('score_desc');
  const [activePanel, setActivePanel] = useState('recommendations');

  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState(updatedAtIso || new Date().toISOString());
  const [nowTick, setNowTick] = useState(Date.now());
  const lastPollRef = useRef(0);

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
        const [recsRes, runsRes, eventsRes, videosRes, templateRes, teamRes, gwRes] = await Promise.all([
          fetch('/api/recommendations'),
          fetch('/api/runs?limit=20'),
          fetch('/api/events?limit=30'),
          fetch('/api/videos'),
          strategyEnabled ? fetch('/api/strategy/template?limit=40') : Promise.resolve(null),
          strategyEnabled ? fetch(`/api/strategy/team?entry_id=${Number(entryId) || 0}`) : Promise.resolve(null),
          fetch('/api/gameweek'),
        ]);

        if (!cancelled && recsRes?.ok) setRecommendations(await recsRes.json());
        if (!cancelled && runsRes?.ok) setRuns(await runsRes.json());
        if (!cancelled && eventsRes?.ok) setEvents(await eventsRes.json());
        if (!cancelled && videosRes?.ok) setVideos(await videosRes.json());
        if (!cancelled && strategyEnabled && templateRes?.ok) setStrategyTemplate(await templateRes.json());
        if (!cancelled && strategyEnabled && teamRes?.ok) setStrategyTeam(await teamRes.json());
        if (!cancelled && gwRes?.ok) {
          const gwData = await gwRes.json();
          if (gwData?.gameweek) setLiveGw(gwData.gameweek);
        }

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

    const now = Date.now();
    if (now - lastPollRef.current > 5000) {
      lastPollRef.current = now;
      pollData();
    }
    const intervalId = setInterval(() => {
      lastPollRef.current = Date.now();
      pollData();
    }, 45000);
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
  const playerNameById = useMemo(() => {
    const map = new Map();
    for (const row of recommendations) {
      const id = Number(row.player_id || 0);
      if (!id) continue;
      if (row.player_name) map.set(id, row.player_name);
    }
    for (const row of strategyTemplate) {
      const id = Number(row.player_id || 0);
      if (!id) continue;
      if (row.player_name) map.set(id, row.player_name);
    }
    for (const row of strategyTeam?.recommended_in || []) {
      const id = Number(row.player_id || 0);
      if (!id) continue;
      if (row.player_name) map.set(id, row.player_name);
    }
    for (const row of strategyTeam?.recommended_out || []) {
      const id = Number(row.player_id || 0);
      if (!id) continue;
      if (row.player_name) map.set(id, row.player_name);
    }
    return map;
  }, [recommendations, strategyTemplate, strategyTeam]);
  const upcomingWeekPlan = useMemo(
    () => buildUpcomingWeekPlan({
      pulse,
      strategyTeam,
      gap,
      playerNameById,
    }),
    [pulse, strategyTeam, gap, playerNameById],
  );
  const snapshotGw = useMemo(
    () => detectCurrentGw({ strategyTeam, strategyTemplate }),
    [strategyTeam, strategyTemplate],
  );
  const currentGw = liveGw || snapshotGw;

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
    <main className="cockpit-surface mx-auto max-w-[1320px] px-3 pb-8 pt-7 md:px-6 md:pb-10 md:pt-9">
      <section className="mac-window mb-4 overflow-hidden rounded-2xl">
        <div className="mac-window-header flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="window-controls" aria-hidden>
              <span />
              <span />
              <span />
            </span>
            <p className="text-[11px] font-medium uppercase tracking-[0.11em] text-zinc-400">FPL Strategy Cockpit</p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-[11px] text-slate-300">
            <span className={`sync-dot ${isSyncing ? 'is-active' : ''}`} />
            <span className={`sync-ring ${isSyncing ? 'is-active' : ''}`} />
            <span>{isSyncing ? 'Syncing live feeds' : 'Live feed idle'}</span>
            <Badge variant="secondary">Updated {fmtDate(updatedAtIso)}</Badge>
          </div>
        </div>

        <div className="p-4 md:p-5">
          <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-100 md:text-3xl">FPL Strategy Desk</h1>
              <p className="mt-1 max-w-3xl text-[12px] text-zinc-400 md:text-[13px]">
                Live decision desk blending model scores, elite-manager templates, and tactical momentum.
              </p>
            </div>
          </header>

          <section className="mb-4 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="mac-chip px-2.5 py-1">Data freshness: {freshnessSeconds === null ? 'n/a' : `${freshnessSeconds}s ago`}</span>
            <span className="mac-chip px-2.5 py-1">Poll cadence: 45s</span>
            <span className="mac-chip px-2.5 py-1">Last poll: {sinceLastPoll === null ? 'n/a' : `${sinceLastPoll}s ago`}</span>
            {liveError ? <span className="mac-chip px-2.5 py-1 text-rose-300">{liveError}</span> : null}
            <span className="hidden">{nowTick}</span>
          </section>

      {!strategyEnabled ? (
        <Card className="mb-4 border-dashed border-white/[0.15] bg-black/[0.2]">
          <CardContent className="pt-4 text-[12px] text-zinc-400">
            Strategy dashboard is disabled. Set <code>ENABLE_STRATEGY_DASHBOARD=1</code> to enable Template Pulse, Team vs Elite, and Transfer Radar strategy panels.
          </CardContent>
        </Card>
      ) : null}

      <section className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card className={isSyncing ? 'poll-shimmer' : ''}>
          <CardHeader className="pb-2"><CardDescription>Transfer Signals</CardDescription></CardHeader>
          <CardContent className="text-lg font-semibold text-slate-100">{kpis.buy} / {kpis.sell} / {kpis.hold}</CardContent>
        </Card>
        <Card className={isSyncing ? 'poll-shimmer' : ''}>
          <CardHeader className="pb-2"><CardDescription>Model Confidence</CardDescription></CardHeader>
          <CardContent className="text-lg font-semibold text-slate-100">{kpis.avgConfidence}%</CardContent>
        </Card>
        <Card className={isSyncing ? 'poll-shimmer' : ''}>
          <CardHeader className="pb-2"><CardDescription>Latest Run</CardDescription></CardHeader>
          <CardContent className="truncate text-lg font-semibold text-slate-100">{kpis.latestRun}</CardContent>
        </Card>
        <Card className={isSyncing ? 'poll-shimmer' : ''}>
          <CardHeader className="pb-2"><CardDescription>Team Fit Confidence</CardDescription></CardHeader>
          <CardContent className="text-lg font-semibold text-slate-100">{gap.confidence || 0}%</CardContent>
        </Card>
      </section>

      <section className="mb-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>Template Pulse</CardTitle>
            <CardDescription>Elite ownership and captaincy consensus.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-[12px]">
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-[0.09em] text-zinc-400">Top Owned</p>
              <ul className="space-y-1 text-slate-200">
                {pulse.topOwned.length ? pulse.topOwned.slice(0, 4).map((row) => (
                  <li key={`owned-${row.player_id}`}>
                    {formatPlayerLabel({ playerId: row.player_id, playerName: playerNameById.get(Number(row.player_id)) })} · {n(row.template_ownership_pct)}%
                  </li>
                )) : <li className="text-zinc-500">None</li>}
              </ul>
            </div>
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-[0.09em] text-zinc-400">Captain Trend</p>
              <ul className="space-y-1 text-slate-200">
                {pulse.topCaptains.length ? pulse.topCaptains.slice(0, 3).map((row) => (
                  <li key={`cap-${row.player_id}`}>
                    {formatPlayerLabel({ playerId: row.player_id, playerName: playerNameById.get(Number(row.player_id)) })} · {n(row.captain_pct)}%
                  </li>
                )) : <li className="text-zinc-500">None</li>}
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your Team vs Elite</CardTitle>
            <CardDescription>Coverage and structure mismatch signals.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-[12px] text-slate-200">
            <p>Template gaps to fill: <strong>{gap.inCount}</strong></p>
            <p>Likely overexposed slots: <strong>{gap.outCount}</strong></p>
            <p className="text-zinc-400">{strategyTeam?.why || 'No team strategy insight yet.'}</p>
            {strategyTeam?.diagnostic_code ? (
              <p className="rounded-md border border-amber-500/[0.35] bg-amber-500/[0.1] px-2 py-1 text-[11px] text-amber-100">
                Diagnostic: {strategyTeam.diagnostic_code}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Transfer Radar</CardTitle>
            <CardDescription>Suggested IN/OUT pairs with tactical framing.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-[12px] text-slate-200">
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-[0.09em] text-zinc-400">IN</p>
              <ul className="space-y-2">{(strategyTeam?.recommended_in || []).slice(0, 5).map((row) => {
                const rec = recByPlayerId.get(Number(row.player_id));
                return (
                  <li key={`in-${row.player_id}`} className="rounded-md border border-white/10 bg-black/20 px-2 py-1.5">
                    <p>{row.player_name} ({n(row.template_ownership_pct)}%)</p>
                    <p className="text-[11px] text-zinc-400">Template gap closed, momentum +{n(row.buy_momentum)}, risk {rec?.risk_tier || 'balanced'}</p>
                  </li>
                );
              })}</ul>
            </div>
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-[0.09em] text-zinc-400">OUT</p>
              <ul className="space-y-2">{(strategyTeam?.recommended_out || []).slice(0, 5).map((row) => {
                const rec = recByPlayerId.get(Number(row.player_id));
                return (
                  <li key={`out-${row.player_id}`} className="rounded-md border border-white/10 bg-black/20 px-2 py-1.5">
                    <p>{row.player_name}</p>
                    <p className="text-[11px] text-zinc-400">Momentum pressure -{n(row.sell_momentum)}, ownership {n(row.template_ownership_pct)}%, risk {rec?.risk_tier || 'balanced'}</p>
                  </li>
                );
              })}</ul>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Market Momentum</CardTitle>
            <CardDescription>Most bought and sold by elite cohort.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-[12px] text-slate-200">
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-[0.09em] text-zinc-400">Rising</p>
              <ul className="space-y-1">
                {pulse.rising.slice(0, 4).map((row) => (
                  <li key={`rise-${row.player_id}`}>
                    {formatPlayerLabel({ playerId: row.player_id, playerName: playerNameById.get(Number(row.player_id)) })} +{n(row.buy_momentum)}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-[0.09em] text-zinc-400">Falling</p>
              <ul className="space-y-1">
                {pulse.falling.slice(0, 4).map((row) => (
                  <li key={`fall-${row.player_id}`}>
                    {formatPlayerLabel({ playerId: row.player_id, playerName: playerNameById.get(Number(row.player_id)) })} -{n(row.sell_momentum)}
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="mb-4">
        <Card className="neon-card">
          <CardHeader>
            <CardTitle className="text-base">Upcoming Week Plan {currentGw ? `(GW ${currentGw})` : '(GW n/a)'}</CardTitle>
            <CardDescription>Action summary for the upcoming gameweek from template, team-fit, and captaincy signals.</CardDescription>
            {liveGw && snapshotGw && liveGw !== snapshotGw ? (
              <p className="mt-1 text-[11px] text-amber-300">Plan data from GW {snapshotGw} — run strategy refresh for GW {liveGw}.</p>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-200">
            <p className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-cyan-100">
              {upcomingWeekPlan.headline}
            </p>
            <div>
              <p className="mb-1 text-xs uppercase text-emerald-300">Do now</p>
              <ul className="space-y-1">
                {upcomingWeekPlan.doNow.map((line) => <li key={line}>{line}</li>)}
              </ul>
            </div>
            <div>
              <p className="mb-1 text-xs uppercase text-cyan-300">Optional</p>
              <ul className="space-y-1">
                {upcomingWeekPlan.optional.map((line) => <li key={line}>{line}</li>)}
              </ul>
            </div>
            <div>
              <p className="mb-1 text-xs uppercase text-rose-300">Avoid this week</p>
              <ul className="space-y-1">
                {upcomingWeekPlan.avoid.map((line) => <li key={line}>{line}</li>)}
              </ul>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="mb-4">
        <Card className="neon-card">
          <CardHeader>
            <CardTitle className="text-base">Template Gaps to Fill {currentGw ? `(GW ${currentGw})` : '(GW n/a)'}</CardTitle>
            <CardDescription>Players in the elite template that your current team is missing.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-slate-200">
            {(strategyTeam?.recommended_in || []).length ? (
              <ul className="space-y-2">
                {(strategyTeam?.recommended_in || []).slice(0, 8).map((row) => (
                  <li key={`gap-${row.player_id}`}>
                    <p>{row.player_name || formatPlayerLabel({ playerId: row.player_id, playerName: playerNameById.get(Number(row.player_id)) })}</p>
                    <p className="text-xs text-cyan-300">
                      Template ownership {n(row.template_ownership_pct)}% · buy momentum +{n(row.buy_momentum)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No major template gaps detected.</p>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="mb-4 flex flex-wrap gap-2">
        <Button size="sm" variant={activePanel === 'recommendations' ? 'default' : 'secondary'} onClick={() => setActivePanel('recommendations')}>Recommendations</Button>
        <Button size="sm" variant={activePanel === 'pipeline' ? 'default' : 'secondary'} onClick={() => setActivePanel('pipeline')}>Pipeline Health</Button>
        <Button size="sm" variant={activePanel === 'videos' ? 'default' : 'secondary'} onClick={() => setActivePanel('videos')}>Video Diagnostics</Button>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Controls</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3" onSubmit={onSaveSettings}>
              <label className="text-[12px] font-medium text-slate-300" htmlFor="entry-id">FPL Entry ID</label>
              <Input id="entry-id" type="number" min="1" value={entryId} onChange={(e) => setEntryId(e.target.value)} required />
              <label className="text-[12px] font-medium text-slate-300" htmlFor="channel-ids">YouTube Channel IDs (one per line)</label>
              <Textarea id="channel-ids" rows="5" value={channelsText} onChange={(e) => setChannelsText(e.target.value)} required />
              <div className="flex flex-wrap gap-2">
                <Button type="submit">Save Settings</Button>
                <Button type="button" variant="secondary" onClick={onRunSync}>Run Sync Now</Button>
                {strategyEnabled ? <Button type="button" variant="outline" onClick={onRunStrategy}>Run Strategy Refresh</Button> : null}
              </div>
              <p className={`text-[12px] ${statusError ? 'text-destructive' : 'text-zinc-400'}`}>{status}</p>
            </form>
          </CardContent>
        </Card>

        {activePanel === 'recommendations' ? (
          <Card className="lg:col-span-2">
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
                  <label className="text-[11px] text-zinc-400" htmlFor="min-confidence">Min confidence {minConfidence}%</label>
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
            <Card>
              <CardHeader><CardTitle>Recent Runs</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-2 text-[12px] text-slate-300">
                  {sortedRuns.map((run) => <li key={run.run_id}><code>{run.run_id}</code> - {run.status || 'unknown'} - {fmtDate(run.started_at)}</li>)}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Event Timeline</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-2 text-[12px]">
                  {sortedEvents.map((row) => (
                    <li key={`${row.run_id}-${row.created_at}-${row.message}`} className="rounded-md border border-white/10 bg-black/20 p-2">
                      <p><strong>[{row.level || 'info'}]</strong> {row.message || ''}</p>
                      <span className="text-[11px] text-slate-500">{fmtDate(row.created_at)}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </>
        ) : null}

        {activePanel === 'videos' ? (
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>Video Diagnostics (Latest 14)</CardTitle></CardHeader>
            <CardContent>
              <div className="mb-3 flex flex-wrap gap-2">
                {videoReasonStats.map(([reason, count]) => (
                  <span key={reason} className="mac-chip px-3 py-1 text-[11px]">
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
        </div>
      </section>
    </main>
  );
}
