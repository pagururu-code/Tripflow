'use client';

import { useEffect } from 'react';
import type { AppData } from '@/lib/types';

const APP_KEY = 'tripflow-v2';
const SESSION_KEY = 'tripflow-place-type-backfill-v1';

function humanizeType(value = '') {
  return value
    .split('_')
    .filter(Boolean)
    .map(word => word[0]?.toUpperCase() + word.slice(1))
    .join(' ');
}

export default function PlaceTypeBackfill() {
  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY)) return;
    sessionStorage.setItem(SESSION_KEY, 'running');

    let cancelled = false;

    const run = async () => {
      try {
        const raw = localStorage.getItem(APP_KEY);
        if (!raw) return;
        const data = JSON.parse(raw) as AppData;
        const missing = data.inbox.filter(item => !item.placeType && item.source === 'google-maps');
        if (!missing.length) {
          sessionStorage.setItem(SESSION_KEY, 'done');
          return;
        }

        let changed = false;
        for (const item of missing) {
          if (cancelled) return;
          try {
            const query = [item.title, item.address].filter(Boolean).join(' ');
            const response = await fetch('/api/places/search?q=' + encodeURIComponent(query));
            if (!response.ok) continue;
            const result = await response.json();
            const place = result.places?.[0];
            const label = place?.primaryTypeDisplayName?.text || humanizeType(place?.primaryType || '');
            if (!label) continue;
            const target = data.inbox.find(entry => entry.id === item.id);
            if (target) {
              target.placeType = label;
              changed = true;
              localStorage.setItem(APP_KEY, JSON.stringify(data));
              window.dispatchEvent(new StorageEvent('storage', { key: APP_KEY, newValue: JSON.stringify(data) }));
            }
          } catch {
            // Keep the place usable even when type lookup fails.
          }
        }

        sessionStorage.setItem(SESSION_KEY, changed ? 'done' : 'retry');
      } catch {
        sessionStorage.removeItem(SESSION_KEY);
      }
    };

    run();
    return () => { cancelled = true; };
  }, []);

  return null;
}
