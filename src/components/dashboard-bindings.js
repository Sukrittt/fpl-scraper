'use client';

import { useEffect } from 'react';

export default function DashboardBindings() {
  useEffect(() => {
    const statusEl = document.getElementById('control-status');
    const setStatus = (msg, isError) => {
      if (!statusEl) return;
      statusEl.textContent = msg || '';
      statusEl.style.color = isError ? '#b03a48' : '#2d5b86';
    };

    const onSubmit = async (event) => {
      event.preventDefault();
      const entryId = Number(document.getElementById('entry-id')?.value || 0);
      const channelsRaw = String(document.getElementById('channel-ids')?.value || '');
      const channels = channelsRaw.split(/\n|,/).map((v) => v.trim()).filter(Boolean);
      if (!entryId || channels.length === 0) {
        setStatus('Entry ID and at least one channel are required.', true);
        return;
      }
      setStatus('Saving settings...', false);
      try {
        const response = await fetch('/api/settings', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ entry_id: entryId, channels }),
        });
        if (!response.ok) throw new Error('settings_failed');
        setStatus('Settings saved.', false);
        setTimeout(() => window.location.reload(), 300);
      } catch {
        setStatus('Failed to save settings.', true);
      }
    };

    const onSync = async () => {
      setStatus('Running sync...', false);
      try {
        const response = await fetch('/api/sync/run', { method: 'POST' });
        if (!response.ok) throw new Error('sync_failed');
        setStatus('Sync completed. Refreshing...', false);
        setTimeout(() => window.location.reload(), 600);
      } catch {
        setStatus('Sync failed. Check CRON_SECRET/auth.', true);
      }
    };

    const settingsForm = document.getElementById('settings-form');
    const syncBtn = document.getElementById('sync-now');
    settingsForm?.addEventListener('submit', onSubmit);
    syncBtn?.addEventListener('click', onSync);

    const searchInput = document.getElementById('rec-search');
    const actionSelect = document.getElementById('rec-action');
    const minConfidenceInput = document.getElementById('rec-min-confidence');
    const minConfidenceValue = document.getElementById('rec-min-confidence-value');
    const sortSelect = document.getElementById('rec-sort');
    const tableBody = document.getElementById('rec-table-body');

    const applyRecommendationFilters = () => {
      if (!tableBody) return;
      const rows = [...tableBody.querySelectorAll('.rec-row')];
      const q = String(searchInput?.value || '').toLowerCase().trim();
      const action = String(actionSelect?.value || 'ALL');
      const minConfidence = Number(minConfidenceInput?.value || 0);
      if (minConfidenceValue) minConfidenceValue.textContent = String(minConfidence);

      const visibleRows = [];
      for (const row of rows) {
        const player = row.getAttribute('data-player') || '';
        const rowAction = row.getAttribute('data-action') || '';
        const confidence = Number(row.getAttribute('data-confidence') || 0);
        const matchesSearch = q.length === 0 || player.includes(q);
        const matchesAction = action === 'ALL' || rowAction === action;
        const matchesConfidence = confidence >= minConfidence;
        const visible = matchesSearch && matchesAction && matchesConfidence;
        row.style.display = visible ? '' : 'none';
        if (visible) visibleRows.push(row);
      }

      const mode = String(sortSelect?.value || 'score_desc');
      const comparator = (a, b) => {
        if (mode === 'confidence_desc') {
          return Number(b.getAttribute('data-confidence') || 0) - Number(a.getAttribute('data-confidence') || 0);
        }
        if (mode === 'name_asc') {
          return String(a.getAttribute('data-player') || '').localeCompare(String(b.getAttribute('data-player') || ''));
        }
        return Number(b.getAttribute('data-score') || 0) - Number(a.getAttribute('data-score') || 0);
      };

      visibleRows.sort(comparator);
      for (const row of visibleRows) tableBody.appendChild(row);
    };

    searchInput?.addEventListener('input', applyRecommendationFilters);
    actionSelect?.addEventListener('change', applyRecommendationFilters);
    minConfidenceInput?.addEventListener('input', applyRecommendationFilters);
    sortSelect?.addEventListener('change', applyRecommendationFilters);
    applyRecommendationFilters();

    return () => {
      settingsForm?.removeEventListener('submit', onSubmit);
      syncBtn?.removeEventListener('click', onSync);
      searchInput?.removeEventListener('input', applyRecommendationFilters);
      actionSelect?.removeEventListener('change', applyRecommendationFilters);
      minConfidenceInput?.removeEventListener('input', applyRecommendationFilters);
      sortSelect?.removeEventListener('change', applyRecommendationFilters);
    };
  }, []);

  return null;
}
