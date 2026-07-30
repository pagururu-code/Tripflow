'use client';

import { useEffect, useState } from 'react';
import type { AppData } from '@/types';

export type DayTitles = Record<string, { icon: string; title: string }>;

const APP_KEY = 'tripflow-v2';
const DAY_TITLES_KEY = 'tripflow-day-titles-v1';

/** Keeps the existing local-only persistence lifecycle in one place. */
export function useTrips(seed: AppData) {
  const [data, setData] = useState<AppData>(seed);
  const [dayTitles, setDayTitles] = useState<DayTitles>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const savedData = localStorage.getItem(APP_KEY);
      if (savedData) setData(JSON.parse(savedData));
      const savedTitles = localStorage.getItem(DAY_TITLES_KEY);
      if (savedTitles) setDayTitles(JSON.parse(savedTitles));
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(APP_KEY, JSON.stringify(data));
    localStorage.setItem(DAY_TITLES_KEY, JSON.stringify(dayTitles));
  }, [data, dayTitles, loaded]);

  return { data, setData, dayTitles, setDayTitles };
}
