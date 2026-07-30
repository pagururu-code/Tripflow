'use client';

import { useEffect } from 'react';
import { hasLeadingEmoji, placeEmoji } from '@/utils/emoji';

const APP_KEY = 'tripflow-v2';
const MIGRATION_KEY = 'tripflow-place-emoji-migration-v1';

export default function RegisterSW() {
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    if (localStorage.getItem(MIGRATION_KEY)) return;

    try {
      const raw = localStorage.getItem(APP_KEY);
      if (!raw) {
        localStorage.setItem(MIGRATION_KEY, 'done');
        return;
      }
      const data = JSON.parse(raw);
      let changed = false;
      const apply = (item: any) => {
        const shouldApply = item?.source === 'google-maps' || item?.type === 'place';
        if (!shouldApply || !item?.title || hasLeadingEmoji(item.title)) return item;
        changed = true;
        return { ...item, title: `${placeEmoji(item.title, item.placeType)} ${item.title}` };
      };
      const next = {
        ...data,
        inbox: Array.isArray(data.inbox) ? data.inbox.map(apply) : data.inbox,
        schedules: Array.isArray(data.schedules) ? data.schedules.map(apply) : data.schedules,
      };
      if (changed) localStorage.setItem(APP_KEY, JSON.stringify(next));
      localStorage.setItem(MIGRATION_KEY, 'done');
      if (changed) window.location.reload();
    } catch {
      localStorage.setItem(MIGRATION_KEY, 'done');
    }
  }, []);

  return null;
}
