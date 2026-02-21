'use client';

import { useMemo, useState } from 'react';
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

function teamPlanRows(recommendations) {
  const sorted = sortedBy(recommendations, 'score_desc');
  const buys = sorted.filter((r) => r.action === 'BUY').slice(0, 5);
  const sells = sorted.filter((r) => r.action === 'SELL').slice(0, 5);
  return { buys, sells };
}

export default function DashboardApp({
  initialSettings,
  initialRecommendations,
  initialRuns,
  initialEvents,
  initialVideos,
  updatedAtIso,
}) {
  const [entryId, setEntryId] = useState(initialSettings?.entry_id || '');
  const [channelsText, setChannelsText] = useState((initialSettings?.channels || []).join('\n'));
  const [status, setStatus] = useState('');
  const [statusError, setStatusError] = useState(false);

  const [search, setSearch] = useState('');
  const [action, setAction] = useState('ALL');
  const [minConfidence, setMinConfidence] = useState(0);
  const [sortMode, setSortMode] = useState('score_desc');

  const recommendations = initialRecommendations || [];
  const runs = initialRuns || [];
  const events = initialEvents || [];
  const videos = initialVideos || [];

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
    const recentVideoBatch = [...videos]
      .sort((a, b) => new Date(b.processed_at || 0).getTime() - new Date(a.processed_at || 0).getTime())
      .slice(0, 40);
    const processed = recentVideoBatch.filter((v) => v.status === 'processed').length;
    const skipped = recentVideoBatch.filter((v) => v.status === 'skipped').length;
    return { buy, sell, hold, avgConfidence, latestRun: latestRun?.run_id || 'n/a', processed, skipped };
  }, [recommendations, runs, videos]);

  const { buys, sells } = useMemo(() => teamPlanRows(recommendations), [recommendations]);
  const holdTop = useMemo(() => sortedBy(recommendations.filter((r) => r.action === 'HOLD'), 'score_desc').slice(0, 5), [recommendations]);

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
      if (!response.ok) throw new Error('sync_failed');
      setStatus('Sync completed. Refreshing...');
      setTimeout(() => window.location.reload(), 750);
    } catch {
      setStatusError(true);
      setStatus('Sync failed. Check CRON_SECRET/auth.');
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-5 py-8 md:px-8 md:py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">FPL Transfer Radar</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground md:text-base">
            Team-first transfer cockpit. Review top moves, validate confidence, and run syncs with one click.
          </p>
        </div>
        <Badge variant="secondary" className="h-fit px-3 py-1 text-xs">Updated {fmtDate(updatedAtIso)}</Badge>
      </header>

      <section className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Buy / Sell / Hold</CardDescription>
          </CardHeader>
          <CardContent className="text-lg font-semibold">{kpis.buy} / {kpis.sell} / {kpis.hold}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Average Confidence</CardDescription>
          </CardHeader>
          <CardContent className="text-lg font-semibold">{kpis.avgConfidence}%</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Latest Run</CardDescription>
          </CardHeader>
          <CardContent className="truncate text-lg font-semibold">{kpis.latestRun}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Video Outcome</CardDescription>
          </CardHeader>
          <CardContent className="text-sm font-semibold md:text-base">processed {kpis.processed}, skipped {kpis.skipped}</CardContent>
        </Card>
      </section>

      <section className="mb-4 grid gap-3 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Apply To Team: Top Buys</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {buys.length ? buys.map((r) => <li key={`buy-${r.player_id}`}>{r.player_name} ({n(r.confidence)}%)</li>) : <li>None</li>}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Apply To Team: Top Sells</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {sells.length ? sells.map((r) => <li key={`sell-${r.player_id}`}>{r.player_name} ({n(r.confidence)}%)</li>) : <li>None</li>}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Watchlist Holds</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {holdTop.length ? holdTop.map((r) => <li key={`hold-${r.player_id}`}>{r.player_name} ({n(r.confidence)}%)</li>) : <li>None</li>}
            </ul>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Controls</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3" onSubmit={onSaveSettings}>
              <label className="text-sm font-medium" htmlFor="entry-id">FPL Entry ID</label>
              <Input id="entry-id" type="number" min="1" value={entryId} onChange={(e) => setEntryId(e.target.value)} required />
              <label className="text-sm font-medium" htmlFor="channel-ids">YouTube Channel IDs (one per line)</label>
              <Textarea id="channel-ids" rows="6" value={channelsText} onChange={(e) => setChannelsText(e.target.value)} required />
              <div className="flex flex-wrap gap-2">
                <Button type="submit">Save Settings</Button>
                <Button type="button" variant="secondary" onClick={onRunSync}>Run Sync Now</Button>
              </div>
              <p className={`text-sm ${statusError ? 'text-destructive' : 'text-muted-foreground'}`}>{status}</p>
            </form>
          </CardContent>
        </Card>

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
                <label className="text-sm text-muted-foreground" htmlFor="min-confidence">Min confidence {minConfidence}%</label>
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
                  <TableHead>Reasons</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecommendations.slice(0, 220).map((r) => (
                  <TableRow key={`rec-${r.player_id}-${r.updated_at || ''}`}>
                    <TableCell className="font-semibold">{r.player_name}</TableCell>
                    <TableCell>{r.action}</TableCell>
                    <TableCell>{n(r.score_5gw)}</TableCell>
                    <TableCell>{n(r.confidence)}%</TableCell>
                    <TableCell>{(Array.isArray(r.reasons) ? r.reasons : []).slice(0, 2).join('; ')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Runs</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {sortedRuns.map((run) => <li key={run.run_id}><code>{run.run_id}</code> - {run.status || 'unknown'} - {fmtDate(run.started_at)}</li>)}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Event Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {sortedEvents.map((row) => (
                <li key={`${row.run_id}-${row.created_at}-${row.message}`} className="rounded-md border p-2">
                  <p><strong>[{row.level || 'info'}]</strong> {row.message || ''}</p>
                  <span className="text-xs text-muted-foreground">{fmtDate(row.created_at)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Video Diagnostics (Latest 14)</CardTitle>
          </CardHeader>
          <CardContent>
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
      </section>
    </main>
  );
}
