'use client';

import { useEffect } from 'react';
import type { AppData } from '@/lib/types';

const STORAGE_KEY = 'tripflow-v2';
const NOTE_ATTRIBUTE = 'data-timeline-place-note';

function readAppData(): AppData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as AppData : null;
  } catch {
    return null;
  }
}

function syncTimelineNotes() {
  const appData = readAppData();
  if (!appData) return;

  const schedulesById = new Map(appData.schedules.map(schedule => [schedule.id, schedule]));

  document.querySelectorAll<HTMLElement>('.schedule-card[data-schedule-id]').forEach(card => {
    const scheduleId = card.dataset.scheduleId;
    const note = scheduleId ? schedulesById.get(scheduleId)?.note?.trim() : '';
    let noteElement = card.querySelector<HTMLElement>(`[${NOTE_ATTRIBUTE}]`);

    if (!note) {
      noteElement?.remove();
      return;
    }

    if (!noteElement) {
      noteElement = document.createElement('p');
      noteElement.setAttribute(NOTE_ATTRIBUTE, '');
      noteElement.className = 'timeline-place-note';
      card.appendChild(noteElement);
    }

    if (noteElement.textContent !== note) noteElement.textContent = note;
  });
}

export default function TimelineDisplayEnhancements() {
  useEffect(() => {
    syncTimelineNotes();

    const observer = new MutationObserver(syncTimelineNotes);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('storage', syncTimelineNotes);

    return () => {
      observer.disconnect();
      window.removeEventListener('storage', syncTimelineNotes);
    };
  }, []);

  return <style jsx global>{`
    .timeline .transfer {
      display: none;
    }

    .timeline-place-note {
      margin: 6px 0 0;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.45;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
  `}</style>;
}
